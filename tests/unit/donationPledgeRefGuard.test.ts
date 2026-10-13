import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * A bad pledge reference must fail the same way in both storage modes.
 *
 * `assertGiftRefString` exists because Prisma's string inputs also accept filter
 * objects, so `{ not: "" }` as a `pledgeRef` would match every row rather than
 * one. It runs inside `transitionPending` — but on the Postgres path that is
 * *inside* `withReceiptTransaction`, whose catch-all turns every
 * non-unique-violation into `ReceiptIssuanceError`. So the assertion fired, and
 * the caller was told "we could not confirm whether reconciliation completed":
 * an outage message for a programming error, and the opposite of what the memory
 * branch reports for the same argument.
 *
 * No other unit test could see it, because the memory branch asserts before the
 * transaction and every unit suite runs in memory mode. The Tier 3b probe would
 * have caught it, and could not run — see
 * `tasks/open/donation-pledges-table-is-unapplied-and-its-postgres-probe-unrun.md`.
 * This file is the cheap standing guard that does not need a server.
 */

const prismaDouble = vi.hoisted(() => ({
  // Runs `work` against a transaction client double, exactly as an interactive
  // transaction does — so the real `withReceiptTransaction` wrapping is exercised
  // rather than mocked away. Mocking the ledger instead would remove the very
  // behaviour under test.
  $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({})),
  donationPledge: { create: vi.fn() },
}));

/** What Prisma raises for a unique violation, in the shape the ledger inspects. */
function uniqueViolation(modelName: string | null, target: string[] | string) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: modelName === null ? { target } : { modelName, target },
  });
}

/** A row the create double returns, shaped like the Prisma model. */
function pledgeRow(pledgeRef: string) {
  return {
    id: "gift-1",
    donorName: "Probe Donor",
    donorEmail: "probe@example.test",
    donorPhone: null,
    taxIdOrIc: null,
    tierId: "kibble",
    tierName: "Kibble Fund",
    amountSen: 5000,
    currency: "MYR",
    frequency: "one_time",
    paymentMethod: "online_banking",
    status: "PENDING_PAYMENT",
    targetPetName: null,
    notes: null,
    pledgeRef,
    receiptNumber: null,
    createdAt: new Date("2026-09-22T04:00:00.000Z"),
  };
}

const DRAFT = {
  donorName: "Probe Donor",
  donorEmail: "probe@example.test",
  tierId: "kibble" as const,
  tierName: "Kibble Fund",
  amountSen: 5000 as never,
  currency: "MYR",
  frequency: "one_time" as const,
  paymentMethod: "online_banking" as const,
  pledgeRef: "HFS-GFT-20260922-111111",
};

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaDouble,
  disconnectPrisma: vi.fn(),
}));

beforeEach(() => {
  // Declared mode, not a mocked predicate: `isLedgerPersistent()` reads this, and
  // the point of the test is the branch the real function selects.
  vi.stubEnv("DATABASE_URL", "postgresql://probe:probe@localhost:5432/probe");
  prismaDouble.$transaction.mockClear();
  prismaDouble.donationPledge.create.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a malformed pledge reference fails as a TypeError on the Postgres path", () => {
  it("rejects a filter object without reporting an unconfirmed transaction", async () => {
    const { isLedgerPersistent } = await import("@/lib/server/donationLedger");
    const { ReceiptIssuanceError } = await import("@/lib/server/donationLedger");
    const { settleDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    // The control: without this the test would be asserting the memory branch.
    expect(isLedgerPersistent()).toBe(true);

    const attempt = settleDonationPledge(
      { not: "" } as unknown as string,
      { taxDeductibleRef: "ref", shelterRegistrationNo: "reg" },
      "coordinator@example.test"
    );

    await expect(attempt).rejects.toThrow(TypeError);
    await expect(attempt).rejects.not.toBeInstanceOf(ReceiptIssuanceError);

    // The guard runs before the transaction is opened at all, so no receipt
    // series was touched on the way to refusing the argument.
    expect(prismaDouble.$transaction).not.toHaveBeenCalled();
  });

  it("rejects the same argument as a TypeError in memory mode too", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { settleDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    await expect(
      settleDonationPledge(
        { not: "" } as unknown as string,
        { taxDeductibleRef: "ref", shelterRegistrationNo: "reg" },
        "coordinator@example.test"
      )
    ).rejects.toThrow(TypeError);
  });
});

/**
 * A pledge reference is a 6-digit random scoped to a UTC day, so two gifts on a
 * busy day can draw the same one. Left unhandled it surfaces as an unconfirmed
 * write, which loses a real donor's submission *and* tells them not to retry --
 * the worst available outcome for a claim nobody else is recording.
 */
describe("a colliding pledge reference is retried, not reported as a lost gift", () => {
  it("redraws the reference once and keeps the gift", async () => {
    const { recordDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    prismaDouble.donationPledge.create
      .mockRejectedValueOnce(uniqueViolation("DonationPledge", ["pledgeRef"]))
      .mockImplementationOnce(async (args: { data: { pledgeRef: string } }) =>
        pledgeRow(args.data.pledgeRef)
      );

    const record = await recordDonationPledge(DRAFT);

    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
    // A *fresh* reference, not the one that collided.
    expect(record.pledgeRef).toMatch(/^HFS-GFT-\d{8}-\d{6}$/);
    expect(record.pledgeRef).not.toBe(DRAFT.pledgeRef);
    expect(record.status).toBe("PENDING_PAYMENT");
    expect(record.receiptNumber).toBeNull();
  });

  it("does not retry a collision on receiptNumber", async () => {
    const { recordDonationPledge, DonationPledgeWriteError } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    // The table's other unique. Redrawing the reference and inserting again would
    // write a second row for money that already has a receipt.
    prismaDouble.donationPledge.create.mockRejectedValue(
      uniqueViolation("DonationPledge", ["receiptNumber"])
    );

    await expect(recordDonationPledge(DRAFT)).rejects.toBeInstanceOf(
      DonationPledgeWriteError
    );
    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(1);
  });

  it("propagates a second collision rather than looping", async () => {
    const { recordDonationPledge, DonationPledgeWriteError } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    prismaDouble.donationPledge.create.mockRejectedValue(
      uniqueViolation("DonationPledge", ["pledgeRef"])
    );

    await expect(recordDonationPledge(DRAFT)).rejects.toBeInstanceOf(
      DonationPledgeWriteError
    );
    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
  });
});

/**
 * The shapes a P2002 actually arrives in.
 *
 * The retry must not depend on `meta.modelName`: nothing has measured Prisma
 * populating it for a `donationPledge.create`, and if it is absent the predicate
 * would quietly return false, the retry would never run, and a colliding
 * reference would go on being reported to the donor as an unconfirmed write --
 * the failure the retry exists to remove, silently unfixed. `meta.target` also
 * arrives either as a field-name array or as the index name, depending on the
 * driver, so both are pinned here.
 */
describe("the collision predicate survives every shape the error arrives in", () => {
  it("retries when meta carries no modelName at all", async () => {
    const { recordDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    prismaDouble.donationPledge.create
      .mockRejectedValueOnce(uniqueViolation(null, ["pledgeRef"]))
      .mockImplementationOnce(async (args: { data: { pledgeRef: string } }) =>
        pledgeRow(args.data.pledgeRef)
      );

    const record = await recordDonationPledge(DRAFT);

    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
    expect(record.pledgeRef).not.toBe(DRAFT.pledgeRef);
  });

  it("retries when target is the index name rather than the column list", async () => {
    const { recordDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    prismaDouble.donationPledge.create
      .mockRejectedValueOnce(
        uniqueViolation(null, "donation_pledges_pledgeRef_key")
      )
      .mockImplementationOnce(async (args: { data: { pledgeRef: string } }) =>
        pledgeRow(args.data.pledgeRef)
      );

    const record = await recordDonationPledge(DRAFT);

    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
    expect(record.pledgeRef).not.toBe(DRAFT.pledgeRef);
  });

  it("still refuses to retry the receiptNumber unique without a modelName", async () => {
    const { recordDonationPledge, DonationPledgeWriteError } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    prismaDouble.donationPledge.create.mockRejectedValue(
      uniqueViolation(null, "donation_pledges_receiptNumber_key")
    );

    await expect(recordDonationPledge(DRAFT)).rejects.toBeInstanceOf(
      DonationPledgeWriteError
    );
    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(1);
  });
});

/**
 * The shape Prisma 7 with `@prisma/adapter-pg` actually raises.
 *
 * Every case above fabricates `meta.target`, which this client never sets: the
 * runtime wraps the adapter's error as `{ driverAdapterError }` and the columns
 * sit at `driverAdapterError.cause.constraint.fields`, parsed from Postgres's
 * `Key ("pledgeRef")=(...) already exists` detail. A review found the predicate
 * discriminating on the key that is never there, so its column guard was dead
 * code and the suite was green on a fiction. These are the cases that would have
 * failed.
 */
function adapterViolation(fields: string[] | undefined) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: {
      modelName: "DonationPledge",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: fields === undefined ? undefined : { fields },
        },
      },
    },
  });
}

describe("the collision predicate reads the driver adapter's own error shape", () => {
  it("retries when the adapter names pledgeRef, quoted as Postgres prints it", async () => {
    const { recordDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    prismaDouble.donationPledge.create
      .mockRejectedValueOnce(adapterViolation(['"pledgeRef"']))
      .mockImplementationOnce(async (args: { data: { pledgeRef: string } }) =>
        pledgeRow(args.data.pledgeRef)
      );

    const record = await recordDonationPledge(DRAFT);

    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
    expect(record.pledgeRef).not.toBe(DRAFT.pledgeRef);
  });

  it("refuses to retry when the adapter names receiptNumber", async () => {
    const { recordDonationPledge, DonationPledgeWriteError } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    // The guard that was dead code: on the real shape, a receiptNumber collision
    // used to fall into the "no target" branch and be retried.
    prismaDouble.donationPledge.create.mockRejectedValue(
      adapterViolation(['"receiptNumber"'])
    );

    await expect(recordDonationPledge(DRAFT)).rejects.toBeInstanceOf(
      DonationPledgeWriteError
    );
    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(1);
  });

  it("retries when the error names no column at all", async () => {
    const { recordDonationPledge } = await import("@/lib/server/donationPledgeLedger");

    // The adapter leaves `constraint` undefined when Postgres sends no detail
    // line. The insert never sets receiptNumber, so the reference is the only
    // unique this statement can violate, and refusing would lose the gift.
    prismaDouble.donationPledge.create
      .mockRejectedValueOnce(adapterViolation(undefined))
      .mockImplementationOnce(async (args: { data: { pledgeRef: string } }) =>
        pledgeRow(args.data.pledgeRef)
      );

    const record = await recordDonationPledge(DRAFT);

    expect(prismaDouble.donationPledge.create).toHaveBeenCalledTimes(2);
    expect(record.pledgeRef).not.toBe(DRAFT.pledgeRef);
  });
});
