import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The ledger's contract, exercised in both of its declared modes.
 *
 * The Postgres half runs against a hand-built fake that models the two properties
 * the real design depends on — a row-locked counter and transaction rollback — so
 * the gaplessness claim is actually tested rather than mocked away. Asserting
 * `$transaction` was called N times would prove nothing about whether a number is
 * burned when an insert fails, which is the entire point of the counter-row design.
 */

interface UpsertArgs {
  where: { scope: string };
  create: { scope: string; lastValue: number };
  update: { lastValue: { increment: number } };
}

interface CreateArgs {
  data: Record<string, unknown> & { sequenceScope: string; sequenceValue: number; issuedAt: Date };
}

interface FakeDb {
  rows: Record<string, unknown>[];
  counters: Map<string, number>;
  failNextInsert: (times: number, modelName?: string | null) => void;
  /** Clears every piece of fake state, including the unique-index set. */
  reset: () => void;
  transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
}

function createFakeDb(): FakeDb {
  const counters = new Map<string, number>();
  const rows: Record<string, unknown>[] = [];
  const takenSerials = new Set<string>();
  let insertFailuresRemaining = 0;
  let insertFailureModel: string | null = "Donation";

  const uniqueViolation = (modelName: string | null) => {
    const err = new Error("Unique constraint failed on the fields: (`receiptNumber`)");
    Object.assign(
      err,
      modelName === null ? { code: "P2002" } : { code: "P2002", meta: { modelName } }
    );
    return err;
  };

  const tx = {
    receiptSequence: {
      upsert: async (args: UpsertArgs) => {
        const current = counters.get(args.where.scope);
        // Models the row lock: readers of a scope serialise, and the value they
        // observe is the one they just wrote.
        const next =
          current === undefined
            ? args.create.lastValue
            : current + args.update.lastValue.increment;
        counters.set(args.where.scope, next);
        return { scope: args.where.scope, lastValue: next };
      },
    },
    donation: {
      create: async (args: CreateArgs) => {
        if (insertFailuresRemaining > 0) {
          insertFailuresRemaining -= 1;
          throw uniqueViolation(insertFailureModel);
        }

        // The real @@unique([sequenceScope, sequenceValue]) guarantee.
        const key = `${args.data.sequenceScope}#${args.data.sequenceValue}`;
        if (takenSerials.has(key)) {
          throw uniqueViolation("Donation");
        }
        takenSerials.add(key);

        const row = {
          id: `db-don-${rows.length + 1}`,
          currency: "MYR",
          donorPhone: null,
          taxIdOrIc: null,
          targetPetName: null,
          notes: null,
          ...args.data,
        };
        rows.push(row);
        return row;
      },
    },
  };

  return {
    rows,
    counters,
    failNextInsert: (times: number, modelName = "Donation") => {
      insertFailuresRemaining = times;
      insertFailureModel = modelName;
    },
    reset: () => {
      counters.clear();
      rows.length = 0;
      // Load-bearing: this set models the @@unique index, and leaving it populated
      // across tests would fail a legitimate retry that redraws a rolled-back serial.
      takenSerials.clear();
      insertFailuresRemaining = 0;
      insertFailureModel = "Donation";
    },
    // Models atomicity: a throwing callback rolls the counter back to its
    // pre-transaction value, which is exactly what a bare SEQUENCE cannot do —
    // and rolls the inserted row and its serial back with it, which is what
    // lets an attach step that throws leave no receipt behind.
    transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const snapshot = new Map(counters);
      const rowCount = rows.length;
      const serials = new Set(takenSerials);
      try {
        return await fn(tx);
      } catch (err) {
        counters.clear();
        for (const [k, v] of snapshot) counters.set(k, v);
        rows.length = rowCount;
        takenSerials.clear();
        for (const key of serials) takenSerials.add(key);
        throw err;
      }
    },
  };
}

const fakeDb = createFakeDb();

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fakeDb.transaction(fn),
    donation: {
      findMany: vi.fn(async () => fakeDb.rows.slice().reverse()),
      findUnique: vi.fn(async (args: { where: { receiptNumber: string } }) =>
        fakeDb.rows.find((r) => r.receiptNumber === args.where.receiptNumber) ?? null
      ),
    },
  },
}));

import type { Prisma } from "@prisma/client";
import {
  DonationDraft,
  ReceiptIssuanceError,
  drawAndInsert,
  formatReceiptNumber,
  isLedgerPersistent,
  issueDonationReceipt,
  issueReceiptInMemory,
  listDonations,
  listDonationsOrThrow,
  receiptScopeFor,
  resetDonationLedger,
  withReceiptTransaction,
} from "@/lib/server/donationLedger";
import { prisma } from "@/lib/server/prisma";
import { senFromRinggit } from "@/lib/domain/money";

const AUGUST = new Date("2026-08-15T04:00:00Z"); // 12:00 MYT, 15 Aug 2026

function draft(overrides: Partial<DonationDraft> = {}): DonationDraft {
  return {
    donorName: "Cheryl Tan",
    donorEmail: "cheryl.tan@example.com",
    tierId: "vaccine",
    tierName: "Core Vaccination & Deworming",
    amountSen: senFromRinggit(50),
    currency: "MYR",
    frequency: "one_time",
    paymentMethod: "duitnow_qr",
    ...overrides,
  };
}

beforeEach(() => {
  resetDonationLedger();
  fakeDb.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("receiptScopeFor", () => {
  it("scopes by the Malaysian calendar month, not UTC", () => {
    // 23:00 UTC on 31 Aug is 07:00 MYT on 1 Sep. A UTC-based slice would file
    // this receipt into August's series and understate September's.
    expect(receiptScopeFor(new Date("2026-08-31T23:00:00Z"))).toBe("HFS-DON-202609");
    // 16:00 UTC on 31 Jul is midnight MYT on 1 Aug — the first receipt of August.
    expect(receiptScopeFor(new Date("2026-07-31T16:00:00Z"))).toBe("HFS-DON-202608");
    // The same instant one second earlier is still July in MYT.
    expect(receiptScopeFor(new Date("2026-07-31T15:59:59Z"))).toBe("HFS-DON-202607");
  });

  it("rolls the year over correctly", () => {
    expect(receiptScopeFor(new Date("2026-12-31T16:00:00Z"))).toBe("HFS-DON-202701");
  });
});

describe("formatReceiptNumber", () => {
  it("pads to the documented four-digit width", () => {
    expect(formatReceiptNumber("HFS-DON-202608", 1)).toBe("HFS-DON-202608-0001");
    expect(formatReceiptNumber("HFS-DON-202608", 42)).toBe("HFS-DON-202608-0042");
    expect(formatReceiptNumber("HFS-DON-202608", 9999)).toBe("HFS-DON-202608-9999");
  });

  it("widens rather than wrapping past the padding width", () => {
    // Wrapping would mint a duplicate receipt number — the worst possible bug here.
    expect(formatReceiptNumber("HFS-DON-202608", 10000)).toBe("HFS-DON-202608-10000");
  });
});

describe("offline mode (no DATABASE_URL)", () => {
  it("reports itself as non-persistent", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(isLedgerPersistent()).toBe(false);
  });

  it("issues gapless, contiguous numbers from 1", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const first = await issueDonationReceipt(draft(), { now: AUGUST });
    const second = await issueDonationReceipt(draft(), { now: AUGUST });
    const third = await issueDonationReceipt(draft(), { now: AUGUST });

    expect(first.receiptNumber).toBe("HFS-DON-202608-0001");
    expect(second.receiptNumber).toBe("HFS-DON-202608-0002");
    expect(third.receiptNumber).toBe("HFS-DON-202608-0003");
    expect([first, second, third].map((r) => r.sequenceValue)).toEqual([1, 2, 3]);
  });

  it("restarts numbering per month scope", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const august = await issueDonationReceipt(draft(), { now: AUGUST });
    const september = await issueDonationReceipt(draft(), {
      now: new Date("2026-09-10T04:00:00Z"),
    });

    expect(august.receiptNumber).toBe("HFS-DON-202608-0001");
    expect(september.receiptNumber).toBe("HFS-DON-202609-0001");
  });

  it("is reset hermetically between tests", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const receipt = await issueDonationReceipt(draft(), { now: AUGUST });
    // Would be -0004 or higher if the counters above had leaked into this test.
    expect(receipt.receiptNumber).toBe("HFS-DON-202608-0001");
  });

  it("preserves the amount as exact sen and stamps no ROS or LHDN identifier", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const receipt = await issueDonationReceipt(
      draft({ amountSen: senFromRinggit("19.90") }),
      { now: AUGUST }
    );

    expect(receipt.amountSen).toBe(1990);
    // The shelter is not a registered society (#239): new rows assert nothing.
    expect(receipt.shelterRegistrationNo).toBe("");
    expect(receipt.taxDeductibleRef).toBe("");
    expect(receipt.taxIdOrIc).toBeUndefined();
    expect(receipt.issuedAt).toBe(AUGUST.toISOString());
  });
});

describe("persistent mode (DATABASE_URL set)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@localhost:5432/pet_shelter");
  });

  it("reports itself as persistent", () => {
    expect(isLedgerPersistent()).toBe(true);
  });

  it("allocates gapless numbers through the counter row", async () => {
    const receipts = [];
    for (let i = 0; i < 5; i += 1) {
      receipts.push(await issueDonationReceipt(draft(), { now: AUGUST }));
    }

    expect(receipts.map((r) => r.sequenceValue)).toEqual([1, 2, 3, 4, 5]);
    expect(receipts.map((r) => r.receiptNumber)).toEqual([
      "HFS-DON-202608-0001",
      "HFS-DON-202608-0002",
      "HFS-DON-202608-0003",
      "HFS-DON-202608-0004",
      "HFS-DON-202608-0005",
    ]);
    expect(fakeDb.rows).toHaveLength(5);
  });

  it("does not burn a number when the insert fails — the series stays gapless", async () => {
    await issueDonationReceipt(draft(), { now: AUGUST }); // 0001

    // Fail both the initial attempt and its retry, so issuance genuinely aborts.
    fakeDb.failNextInsert(2);
    await expect(issueDonationReceipt(draft(), { now: AUGUST })).rejects.toBeInstanceOf(
      ReceiptIssuanceError
    );

    // This is the property a Postgres SEQUENCE cannot provide: the failed attempt
    // rolled the counter back, so the next good receipt is 0002 and not 0003.
    const next = await issueDonationReceipt(draft(), { now: AUGUST });
    expect(next.receiptNumber).toBe("HFS-DON-202608-0002");
    expect(fakeDb.rows).toHaveLength(2);
  });

  it("retries once past a concurrent-issuance collision", async () => {
    fakeDb.failNextInsert(1);

    const receipt = await issueDonationReceipt(draft(), { now: AUGUST });

    expect(receipt.receiptNumber).toBe("HFS-DON-202608-0001");
    expect(fakeDb.rows).toHaveLength(1);
  });

  it("issues no receipt at all when the write cannot be recorded", async () => {
    fakeDb.failNextInsert(2);

    await expect(issueDonationReceipt(draft(), { now: AUGUST })).rejects.toThrow(
      ReceiptIssuanceError
    );

    // The essential guarantee: no durable row, and therefore no receipt number
    // handed to a donor that the shelter cannot reconcile later.
    expect(fakeDb.rows).toHaveLength(0);
  });

  it("surfaces the underlying cause for operators without leaking it to the donor", async () => {
    fakeDb.failNextInsert(2);

    const error = await issueDonationReceipt(draft(), { now: AUGUST }).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(ReceiptIssuanceError);
    expect((error as ReceiptIssuanceError).cause).toBeDefined();
    expect((error as ReceiptIssuanceError).message).not.toContain("Unique constraint");
  });
});

/**
 * The two reads differ only in what they do with a failure, and that difference is
 * load-bearing rather than stylistic.
 *
 * `listDonations` swallowing a read error into `[]` is right for a dashboard: an
 * empty panel during an outage is degraded, and the next refresh repairs it. It is
 * wrong for the LHDN export, where `[]` is not a degraded view but a *claim* — that
 * the shelter received no donations — and it is indistinguishable from the truthful
 * version of that claim. Nobody downstream can tell an outage from an empty year.
 *
 * This is the sign on that fence. Delete either test and the export goes back to
 * being able to file an outage as a tax return.
 */
describe("read policy: the export must be able to see a failure", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@localhost:5432/pet_shelter");
  });

  it("listDonations swallows a read failure, for the dashboard", async () => {
    vi.mocked(prisma.donation.findMany).mockRejectedValueOnce(new Error("neon unreachable"));

    await expect(listDonations(10)).resolves.toEqual([]);
  });

  it("listDonationsOrThrow propagates it, for the statutory export", async () => {
    vi.mocked(prisma.donation.findMany).mockRejectedValueOnce(new Error("neon unreachable"));

    await expect(listDonationsOrThrow(10)).rejects.toThrow("neon unreachable");
  });
});

/**
 * `withReceiptTransaction` and `drawAndInsert` are how a caller with a row of its
 * own to write — the sponsorship ledger — puts that write in the same transaction
 * as the serial draw. The property measured by the fake transaction is rollback:
 * a `work` that throws after drawing leaves no row or burned serial. The wrapper
 * still reports only an unconfirmed outcome because a real commit acknowledgement
 * can be lost after PostgreSQL has committed.
 */
describe("withReceiptTransaction: a caller's writes share the receipt's fate", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@localhost:5432/pet_shelter");
  });

  it("hands `work` the transaction the serial is drawn in and returns what it returns", async () => {
    const seen = await withReceiptTransaction(async (tx) => {
      const donation = await drawAndInsert(tx, draft(), AUGUST);
      // The fake transaction client is what `$transaction` handed out.
      return { number: donation.receiptNumber, sameTransaction: "receiptSequence" in tx };
    });

    expect(seen).toEqual({ number: "HFS-DON-202608-0001", sameTransaction: true });
    expect(fakeDb.rows).toHaveLength(1);
  });

  it("rolls the serial and the row back when `work` throws after drawing", async () => {
    await issueDonationReceipt(draft(), { now: AUGUST }); // 0001

    const error = await withReceiptTransaction(async (tx) => {
      await drawAndInsert(tx, draft(), AUGUST); // would be 0002
      throw new Error("guard matched zero rows");
    }).catch((err: unknown) => err);

    // The wrapper normalises the failure but does not claim whether the commit
    // landed: an acknowledgement can be lost after PostgreSQL committed it.
    expect(error).toBeInstanceOf(ReceiptIssuanceError);
    expect((error as ReceiptIssuanceError).cause).toMatchObject({
      message: "guard matched zero rows",
    });
    expect(fakeDb.rows).toHaveLength(1);
    // The rolled-back serial is drawn again: 0002, not 0003.
    const next = await issueDonationReceipt(draft(), { now: AUGUST });
    expect(next.receiptNumber).toBe("HFS-DON-202608-0002");
  });

  it("retries `work` once past a serial collision, and not past anything else", async () => {
    fakeDb.failNextInsert(1);
    const collided = vi.fn(async (tx: Prisma.TransactionClient) =>
      drawAndInsert(tx, draft(), AUGUST)
    );
    await expect(withReceiptTransaction(collided)).resolves.toMatchObject({
      receiptNumber: "HFS-DON-202608-0001",
    });
    expect(collided).toHaveBeenCalledTimes(2);

    const failed = vi.fn(async (): Promise<never> => {
      throw new Error("not a collision");
    });
    await expect(withReceiptTransaction(failed)).rejects.toBeInstanceOf(ReceiptIssuanceError);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2002 outside the receipt series or without a model", async () => {
    for (const modelName of ["PetSponsorship", null] as const) {
      fakeDb.failNextInsert(1, modelName);
      const collidedElsewhere = vi.fn(async (tx: Prisma.TransactionClient) =>
        drawAndInsert(tx, draft(), AUGUST)
      );

      await expect(withReceiptTransaction(collidedElsewhere)).rejects.toBeInstanceOf(
        ReceiptIssuanceError
      );
      expect(collidedElsewhere).toHaveBeenCalledTimes(1);
      fakeDb.reset();
    }
  });
});

describe("issueReceiptInMemory: the offline draw is synchronous", () => {
  it("returns the receipt without a promise, so a caller can guard, draw and write in one tick", () => {
    vi.stubEnv("DATABASE_URL", "");

    const receipt = issueReceiptInMemory(draft(), AUGUST);

    expect(receipt).not.toBeInstanceOf(Promise);
    expect(receipt.receiptNumber).toBe("HFS-DON-202608-0001");
  });

  it("refuses to run when a database is configured", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@localhost:5432/pet_shelter");

    expect(() => issueReceiptInMemory(draft(), AUGUST)).toThrow(/offline branch/);
    expect(fakeDb.rows).toHaveLength(0);
  });
});
