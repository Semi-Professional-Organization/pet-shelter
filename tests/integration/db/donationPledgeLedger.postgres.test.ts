import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import {
  listPendingDonationPledges,
  recordDonationPledge,
  rejectPendingDonationPledge,
  settleDonationPledge,
  type DonationPledgeDraft,
} from "@/lib/server/donationPledgeLedger";
import {
  formatReceiptNumber,
  isLedgerPersistent,
  receiptScopeFor,
} from "@/lib/server/donationLedger";
import { senFromInteger } from "@/lib/domain/money";
import {
  LHDN_TAX_DEDUCTIBLE_REF,
  STATUTORY_ROS_REGISTRATION_NO,
} from "@/lib/domain/shelterIdentity";
import {
  requireDatabaseUrl,
  assertDatabaseReachable,
  cleanProbeLedger,
  PROBE_INSTANT,
  PROBE_GIFT_PREFIX,
  PROBE_REJECTION_AUDIT_CONTEXT,
} from "./support/database";

/**
 * The Prisma branch of the general-gift ledger, against a real server.
 *
 * Everything here is a property of PostgreSQL rather than of the module: the
 * conditional `PENDING_PAYMENT` update serialising concurrent settlers on the row
 * lock, the receipt serial rolling back with the loser's transaction, the unique
 * index on `receiptNumber` that stops a second receipt reaching the same gift, and
 * the queue's `ORDER BY`. The unit tier exercises the same state machine through
 * the in-memory branch, which cannot demonstrate any of those.
 *
 * The concurrency case is the one that matters. `settleDonationPledge` draws the
 * receipt inside the transaction that flips the pledge, so a lost race must leave
 * one receipt, one counter increment, and every loser holding the winner's number.
 * `settleSponsorship` arrived at that ordering on 2026-09-14 after the reverse
 * order left a statutory document attached to nothing; this module was written as
 * its twin, and this suite is what proves the twin behaves.
 */

const SCOPE = receiptScopeFor(PROBE_INSTANT);

const ISSUER = {
  taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
  shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
};

let serial = 0;

/** A fresh probe reference per gift; `cleanProbeLedger` deletes by this prefix. */
function nextGiftRef(): string {
  serial += 1;
  return `${PROBE_GIFT_PREFIX}-${String(serial).padStart(4, "0")}`;
}

function draft(overrides: Partial<DonationPledgeDraft> = {}): DonationPledgeDraft {
  return {
    donorName: "Probe Donor",
    donorEmail: "probe.gift@example.test",
    tierId: "kibble",
    tierName: "Kibble Fund",
    amountSen: senFromInteger(5_000),
    currency: "MYR",
    frequency: "one_time",
    paymentMethod: "online_banking",
    pledgeRef: nextGiftRef(),
    ...overrides,
  };
}

/** The probe rows in the queue, in the order the ledger returned them. */
async function probeQueue(): Promise<string[]> {
  const rows = await listPendingDonationPledges(500);
  return rows.filter((r) => r.pledgeRef.startsWith(PROBE_GIFT_PREFIX)).map((r) => r.pledgeRef);
}

beforeAll(async () => {
  requireDatabaseUrl();
  await assertDatabaseReachable();
});

beforeEach(async () => {
  await cleanProbeLedger();
});

afterAll(async () => {
  await cleanProbeLedger();
  await disconnectPrisma();
});

describe("donation pledge ledger against real PostgreSQL", () => {
  it("takes the Postgres branch rather than the in-memory ledger", async () => {
    expect(isLedgerPersistent()).toBe(true);

    const record = await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    const row = await prisma.donationPledge.findUnique({
      where: { pledgeRef: record.pledgeRef },
    });
    expect(row?.status).toBe("PENDING_PAYMENT");
    expect(row?.receiptNumber).toBeNull();
    expect(record.id).not.toMatch(/^mem-gift-/);
  });

  it("writes no donation row when a gift is merely pledged", async () => {
    const record = await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    // The whole point of the table. Asked of Postgres directly, not of the module
    // that wrote the pledge.
    const receipts = await prisma.donation.count({
      where: { sequenceScope: { startsWith: SCOPE } },
    });
    expect(receipts).toBe(0);
    expect(record.receiptNumber).toBeNull();
  });

  it("redraws a colliding pledge reference instead of losing the gift", async () => {
    const taken = await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    // The same reference a second time. The column is unique, so this is exactly
    // what a same-day random collision produces — and the *real* P2002, with
    // whatever `meta.modelName` and `meta.target` this Prisma client actually
    // populates. The unit tests fabricate that error object, so this is the only
    // place the predicate is checked against the shape Postgres really raises.
    const second = await recordDonationPledge(
      draft({ pledgeRef: taken.pledgeRef, donorEmail: "second.donor@example.test" }),
      { now: PROBE_INSTANT }
    );

    expect(second.pledgeRef).not.toBe(taken.pledgeRef);
    expect(second.pledgeRef).toMatch(/^HFS-GFT-\d{8}-\d{6}$/);
    expect(second.status).toBe("PENDING_PAYMENT");

    // Both gifts survived, and neither drew a receipt on the way.
    const rows = await prisma.donationPledge.findMany({
      where: { pledgeRef: { in: [taken.pledgeRef, second.pledgeRef] } },
      select: { pledgeRef: true, receiptNumber: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.receiptNumber === null)).toBe(true);
  });

  it("lists pending gifts oldest first, breaking a same-instant tie on id", async () => {
    const sameInstant = new Date("2999-01-10T04:00:00.000Z");
    const tied = [
      await recordDonationPledge(draft(), { now: sameInstant }),
      await recordDonationPledge(draft(), { now: sameInstant }),
      await recordDonationPledge(draft(), { now: sameInstant }),
    ];
    const oldest = await recordDonationPledge(draft(), {
      now: new Date("2999-01-05T04:00:00.000Z"),
    });
    const settled = await recordDonationPledge(draft(), {
      now: new Date("2999-01-01T04:00:00.000Z"),
    });
    await settleDonationPledge(settled.pledgeRef, ISSUER, "probe@x", { now: sameInstant });

    // The tiebreak is `id`, in the database's own ordering of that column — asked of
    // Postgres rather than assumed, because text collation decides it, not JavaScript.
    const tiedInDbOrder = await prisma.donationPledge.findMany({
      where: { id: { in: tied.map((r) => r.id) } },
      orderBy: { id: "asc" },
      select: { pledgeRef: true },
    });

    expect(await probeQueue()).toEqual([
      oldest.pledgeRef,
      ...tiedInDbOrder.map((r) => r.pledgeRef),
    ]);
  });

  it("lists a pending gift without reading the donor's tax identifier", async () => {
    const record = await recordDonationPledge(draft({ taxIdOrIc: "880101-14-5523" }), {
      now: PROBE_INSTANT,
    });

    // The control: the column holds a value, so a queue read that fetched it would
    // hand it back. Without this the assertion below could not fail.
    const stored = await prisma.donationPledge.findUnique({
      where: { pledgeRef: record.pledgeRef },
      select: { taxIdOrIc: true },
    });
    expect(stored?.taxIdOrIc).toBe("880101-14-5523");

    const queued = (await listPendingDonationPledges(500)).find(
      (r) => r.pledgeRef === record.pledgeRef
    );
    expect(queued).toBeDefined();
    expect(queued?.taxIdOrIc).toBeUndefined();
  });

  it("settles a gift as one unit: the receipt and the ACTIVE row commit together", async () => {
    const record = await recordDonationPledge(
      draft({
        taxIdOrIc: "880101-14-5523",
        notes: "For Tuah, with love",
        targetPetName: "Tuah",
      }),
      { now: PROBE_INSTANT }
    );

    const outcome = await settleDonationPledge(
      record.pledgeRef,
      ISSUER,
      "coordinator@example.test",
      { now: PROBE_INSTANT }
    );
    expect(outcome.status).toBe("reconciled");
    if (outcome.status !== "reconciled") return;

    // Read back through Prisma directly, not through the modules that wrote it.
    const donation = await prisma.donation.findUnique({
      where: { receiptNumber: outcome.donation.receiptNumber },
    });
    expect(donation).toMatchObject({
      receiptNumber: formatReceiptNumber(SCOPE, 1),
      donorEmail: "probe.gift@example.test",
      amountSen: 5_000,
      targetPetName: "Tuah",
      taxIdOrIc: "880101-14-5523",
      notes: "For Tuah, with love",
      taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
      shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
    });

    const row = await prisma.donationPledge.findUnique({
      where: { pledgeRef: record.pledgeRef },
    });
    expect(row).toMatchObject({
      status: "ACTIVE",
      receiptNumber: outcome.donation.receiptNumber,
      reconciledBy: "coordinator@example.test",
    });
    expect(row?.reconciledAt).not.toBeNull();
  });

  it("produces exactly one receipt when settlers race the same gift", async () => {
    const record = await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    const outcomes = await Promise.all(
      ["a@example.test", "b@example.test", "c@example.test"].map((who) =>
        settleDonationPledge(record.pledgeRef, ISSUER, who, { now: PROBE_INSTANT })
      )
    );

    const reconciled = outcomes.filter((o) => o.status === "reconciled");
    expect(reconciled).toHaveLength(1);

    // Every loser is handed the number that exists rather than minting another for
    // the same money, or reporting a failure for a gift that was settled.
    const winner = reconciled[0];
    if (winner.status !== "reconciled") return;
    for (const other of outcomes) {
      if (other === winner) continue;
      expect(other.status).toBe("already_reconciled");
      if (other.status === "already_reconciled") {
        expect(other.receiptNumber).toBe(winner.donation.receiptNumber);
      }
    }

    // One receipt, one counter increment. The serial rolls back with each loser's
    // transaction, which is what a bare SEQUENCE could not do.
    const receipts = await prisma.donation.findMany({
      where: { sequenceScope: SCOPE },
      select: { receiptNumber: true },
    });
    expect(receipts).toHaveLength(1);

    const counter = await prisma.receiptSequence.findUnique({ where: { scope: SCOPE } });
    expect(counter?.lastValue).toBe(1);
  });

  it("refuses to settle a dismissed gift, and to dismiss a settled one", async () => {
    const dismissed = await recordDonationPledge(draft(), { now: PROBE_INSTANT });
    await rejectPendingDonationPledge(dismissed.pledgeRef, PROBE_REJECTION_AUDIT_CONTEXT);

    const afterDismissal = await settleDonationPledge(
      dismissed.pledgeRef,
      ISSUER,
      "coordinator@example.test",
      { now: PROBE_INSTANT }
    );
    expect(afterDismissal.status).toBe("not_pending");

    const settled = await recordDonationPledge(draft(), { now: PROBE_INSTANT });
    await settleDonationPledge(settled.pledgeRef, ISSUER, "coordinator@example.test", {
      now: PROBE_INSTANT,
    });

    const afterSettlement = await rejectPendingDonationPledge(
      settled.pledgeRef,
      PROBE_REJECTION_AUDIT_CONTEXT
    );
    expect(afterSettlement.status).toBe("already_reconciled");

    // Exactly one receipt across both gifts: the dismissed one earned none.
    const receipts = await prisma.donation.count({ where: { sequenceScope: SCOPE } });
    expect(receipts).toBe(1);
  });

  it("writes the dismissal and its audit row in one transaction", async () => {
    const record = await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    const outcome = await rejectPendingDonationPledge(
      record.pledgeRef,
      PROBE_REJECTION_AUDIT_CONTEXT
    );
    expect(outcome.status).toBe("rejected");

    const row = await prisma.donationPledge.findUnique({
      where: { pledgeRef: record.pledgeRef },
    });
    expect(row?.status).toBe("CANCELLED");
    expect(row?.cancelledAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: record.pledgeRef, action: "DONATION_PLEDGE_REJECTED" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.targetEntity).toBe("DonationPledge");
  });

  it("refuses a filter object where a pledge reference belongs", async () => {
    await recordDonationPledge(draft(), { now: PROBE_INSTANT });

    // Prisma's string inputs also accept filter objects, so `{ not: "" }` would
    // match every row. The ledger asserts the runtime type before the `where`.
    await expect(
      settleDonationPledge({ not: "" } as unknown as string, ISSUER, "coordinator@example.test")
    ).rejects.toThrow(TypeError);

    const receipts = await prisma.donation.count({ where: { sequenceScope: SCOPE } });
    expect(receipts).toBe(0);
  });
});
