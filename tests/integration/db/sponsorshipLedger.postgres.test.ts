import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import {
  listPendingSponsorships,
  recordSponsorshipPledge,
  reconcileSponsorship,
  rejectPendingSponsorship,
  settleSponsorship,
  type SponsorshipDraft,
} from "@/lib/server/sponsorshipLedger";
import {
  formatReceiptNumber,
  isLedgerPersistent,
  receiptScopeFor,
} from "@/lib/server/donationLedger";
import { senFromInteger } from "@/lib/domain/money";
import {
  requireDatabaseUrl,
  assertDatabaseReachable,
  cleanProbeLedger,
  PROBE_INSTANT,
  PROBE_PLEDGE_PREFIX,
  PROBE_REJECTION_AUDIT_CONTEXT,
} from "./support/database";

/**
 * Closes §4 of `tasks/open/donation-form-and-admin-denials-have-loose-ends.md`: the
 * Prisma branch of the sponsorship ledger had been asserted and never run. Everything
 * here is a property of PostgreSQL rather than of the module — the conditional
 * `PENDING_PAYMENT` update serialising concurrent settlers on the row lock, the
 * serial rolling back with the loser's transaction, and the queue's `ORDER BY`.
 *
 * The concurrency case is the one that matters. `settleSponsorship` draws the receipt
 * inside the transaction that flips the pledge, so a lost race must leave one receipt,
 * one counter increment, and every loser holding the winner's number.
 */

const SCOPE = receiptScopeFor(PROBE_INSTANT);

let serial = 0;

/** A fresh probe reference per pledge; `cleanProbeLedger` deletes by this prefix. */
function nextPledgeRef(): string {
  serial += 1;
  return `${PROBE_PLEDGE_PREFIX}-${String(serial).padStart(4, "0")}`;
}

function draft(overrides: Partial<SponsorshipDraft> = {}): SponsorshipDraft {
  return {
    // No pet row: the FK is nullable by design, and a probe must not depend on seed data.
    petId: null,
    petName: "Probe Pet",
    sponsorName: "Probe Sponsor",
    sponsorEmail: "probe@example.test",
    tierId: "kibble",
    tierName: "Kibble Fund",
    frequency: "one_time",
    amountSen: senFromInteger(5_000),
    paymentMethod: "online_banking",
    pledgeRef: nextPledgeRef(),
    ...overrides,
  };
}

/** The probe rows in the queue, in the order the ledger returned them. */
async function probeQueue(): Promise<string[]> {
  const rows = await listPendingSponsorships(500);
  return rows.filter((r) => r.pledgeRef.startsWith(PROBE_PLEDGE_PREFIX)).map((r) => r.pledgeRef);
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

describe("sponsorship ledger against real PostgreSQL", () => {
  it("takes the Postgres branch rather than the in-memory ledger", async () => {
    // Guards the whole suite, as the donation probe does.
    expect(isLedgerPersistent()).toBe(true);

    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });

    const row = await prisma.petSponsorship.findUnique({ where: { pledgeRef: record.pledgeRef } });
    expect(row?.status).toBe("PENDING_PAYMENT");
    expect(row?.receiptNumber).toBeNull();
    expect(record.id).not.toMatch(/^mem-spn-/);
  });

  it("persists the checkout's Sponsor Wall consent instead of falling back to the column default", async () => {
    const record = await recordSponsorshipPledge(
      draft({ displayOnWall: true }),
      { now: PROBE_INSTANT }
    );

    // Read through Prisma, not the mapper that accepted the input, so this proves
    // the Boolean crossed the actual persistence boundary.
    const row = await prisma.petSponsorship.findUnique({
      where: { pledgeRef: record.pledgeRef },
      select: { displayOnWall: true },
    });
    expect(row?.displayOnWall).toBe(true);
  });

  it("lists pending commitments oldest first, breaking a same-instant tie on id", async () => {
    const sameInstant = new Date("2999-01-10T04:00:00.000Z");
    const tied = [
      await recordSponsorshipPledge(draft(), { now: sameInstant }),
      await recordSponsorshipPledge(draft(), { now: sameInstant }),
      await recordSponsorshipPledge(draft(), { now: sameInstant }),
    ];
    const oldest = await recordSponsorshipPledge(draft(), {
      now: new Date("2999-01-05T04:00:00.000Z"),
    });
    const settled = await recordSponsorshipPledge(draft(), {
      now: new Date("2999-01-01T04:00:00.000Z"),
    });
    await settleSponsorship(settled.pledgeRef, "probe@x", { now: sameInstant });

    // The tiebreak is `id`, in the database's own ordering of that column — asked of
    // Postgres rather than assumed, because text collation decides it, not JavaScript.
    const tiedInDbOrder = await prisma.petSponsorship.findMany({
      where: { id: { in: tied.map((r) => r.id) } },
      orderBy: { id: "asc" },
      select: { pledgeRef: true },
    });

    expect(await probeQueue()).toEqual([
      oldest.pledgeRef,
      ...tiedInDbOrder.map((r) => r.pledgeRef),
    ]);
  });

  it("settles a pledge as one unit: the receipt and the ACTIVE row commit together", async () => {
    const record = await recordSponsorshipPledge(
      draft({ notes: "For Tuah, with love" }),
      { now: PROBE_INSTANT }
    );

    const outcome = await settleSponsorship(record.pledgeRef, "coordinator@example.test", {
      now: PROBE_INSTANT,
    });
    expect(outcome.status).toBe("reconciled");
    if (outcome.status !== "reconciled") return;

    // Read back through Prisma directly, not through the modules that wrote it.
    const donation = await prisma.donation.findUnique({
      where: { receiptNumber: outcome.donation.receiptNumber },
    });
    expect(donation).toMatchObject({
      receiptNumber: formatReceiptNumber(SCOPE, 1),
      donorEmail: "probe@example.test",
      amountSen: 5_000,
      targetPetName: "Probe Pet",
      notes: "For Tuah, with love",
    });

    const row = await prisma.petSponsorship.findUnique({ where: { pledgeRef: record.pledgeRef } });
    expect(row).toMatchObject({
      status: "ACTIVE",
      receiptNumber: outcome.donation.receiptNumber,
      reconciledBy: "coordinator@example.test",
    });
    expect(row?.reconciledAt).toEqual(PROBE_INSTANT);
    expect(outcome.record.receiptNumber).toBe(outcome.donation.receiptNumber);
  });

  it("issues exactly one receipt when coordinators race to settle the same pledge", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });

    // The design claim: the conditional update runs inside the transaction that drew
    // the serial, so a loser blocks on the row lock, sees zero rows, and rolls its
    // serial back. Only a real server can show that; the memory branch models it.
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        settleSponsorship(record.pledgeRef, `coordinator-${i}@example.test`, {
          now: PROBE_INSTANT,
        })
      )
    );

    const winners = outcomes.filter((o) => o.status === "reconciled");
    expect(winners).toHaveLength(1);
    const number = winners[0].status === "reconciled" ? winners[0].donation.receiptNumber : "";
    expect(number).toBe(formatReceiptNumber(SCOPE, 1));

    for (const loser of outcomes.filter((o) => o.status !== "reconciled")) {
      expect(loser).toEqual({ status: "already_reconciled", receiptNumber: number });
    }

    const rows = await prisma.donation.findMany({ where: { sequenceScope: SCOPE } });
    expect(rows.map((r) => r.receiptNumber)).toEqual([number]);

    const counter = await prisma.receiptSequence.findUnique({ where: { scope: SCOPE } });
    expect(counter?.lastValue).toBe(1);

    const pledge = await prisma.petSponsorship.findUnique({
      where: { pledgeRef: record.pledgeRef },
    });
    expect(pledge).toMatchObject({ status: "ACTIVE", receiptNumber: number });

    // The losers' serials rolled back, so the next receipt in the series is 2, not 5.
    const next = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });
    const settledNext = await settleSponsorship(next.pledgeRef, "probe@x", {
      now: PROBE_INSTANT,
    });
    expect(settledNext.status === "reconciled" && settledNext.donation.sequenceValue).toBe(2);
  });

  it("dismisses an unpaid pledge, and refuses to settle it afterwards", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });

    const rejected = await rejectPendingSponsorship(record.pledgeRef, {
      ...PROBE_REJECTION_AUDIT_CONTEXT,
      now: PROBE_INSTANT,
    });
    expect(rejected.status).toBe("rejected");

    const row = await prisma.petSponsorship.findUnique({ where: { pledgeRef: record.pledgeRef } });
    expect(row).toMatchObject({ status: "CANCELLED", receiptNumber: null });
    expect(row?.cancelledAt).toEqual(PROBE_INSTANT);
    expect(await probeQueue()).not.toContain(record.pledgeRef);

    // Terminal in both directions: not dismissible twice, and never reconcilable.
    expect(await rejectPendingSponsorship(record.pledgeRef, PROBE_REJECTION_AUDIT_CONTEXT)).toEqual({
      status: "not_pending",
      currentStatus: "CANCELLED",
    });
    expect(await settleSponsorship(record.pledgeRef, "probe@x", { now: PROBE_INSTANT })).toEqual(
      { status: "not_pending", currentStatus: "CANCELLED" }
    );

    // Nothing was drawn from the series at any point.
    expect(await prisma.donation.findMany({ where: { sequenceScope: SCOPE } })).toHaveLength(0);
    expect(await prisma.receiptSequence.findUnique({ where: { scope: SCOPE } })).toBeNull();
  });

  it("refuses the offline receipt-attachment helper in persistent mode", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });

    await expect(
      reconcileSponsorship(
        record.pledgeRef,
        formatReceiptNumber(SCOPE, 9999),
        "probe@example.test"
      )
    ).rejects.toThrow(/offline-only helper.*settleSponsorship/i);

    const row = await prisma.petSponsorship.findUnique({
      where: { pledgeRef: record.pledgeRef },
    });
    expect(row).toMatchObject({ status: "PENDING_PAYMENT", receiptNumber: null });
    expect(await prisma.donation.findMany({ where: { sequenceScope: SCOPE } })).toEqual([]);
  });

  it("commits a rejected pledge and its actor/reason audit as one durable outcome", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });

    await expect(
      rejectPendingSponsorship(record.pledgeRef, {
        ...PROBE_REJECTION_AUDIT_CONTEXT,
        now: PROBE_INSTANT,
      })
    ).resolves.toMatchObject({ status: "rejected" });

    const [pledge, auditRows] = await Promise.all([
      prisma.petSponsorship.findUnique({ where: { pledgeRef: record.pledgeRef } }),
      prisma.auditLog.findMany({
        where: { action: "SPONSORSHIP_REJECTED", targetId: record.pledgeRef },
      }),
    ]);
    expect(pledge).toMatchObject({ status: "CANCELLED", cancelledAt: PROBE_INSTANT });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      actorId: PROBE_REJECTION_AUDIT_CONTEXT.actorId,
      actorEmail: PROBE_REJECTION_AUDIT_CONTEXT.actorEmail,
      actorRole: PROBE_REJECTION_AUDIT_CONTEXT.actorRole,
      targetEntity: "PetSponsorship",
      targetId: record.pledgeRef,
      metadata: expect.objectContaining({
        pledgeRef: record.pledgeRef,
        reason: PROBE_REJECTION_AUDIT_CONTEXT.reason,
      }),
    });
  });

  it("rolls cancellation back when PostgreSQL refuses the audit row", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });
    const invalidAuditContext = {
      ...PROBE_REJECTION_AUDIT_CONTEXT,
      // Runtime callers can violate the TypeScript surface. The non-null database
      // column is the last boundary and must abort the enclosing transaction.
      actorEmail: null as unknown as string,
      now: PROBE_INSTANT,
    };

    await expect(rejectPendingSponsorship(record.pledgeRef, invalidAuditContext)).rejects.toThrow();

    const [pledge, auditRows] = await Promise.all([
      prisma.petSponsorship.findUnique({ where: { pledgeRef: record.pledgeRef } }),
      prisma.auditLog.findMany({ where: { targetId: record.pledgeRef } }),
    ]);
    expect(pledge).toMatchObject({ status: "PENDING_PAYMENT", cancelledAt: null });
    expect(auditRows).toEqual([]);
  });

  it("refuses to dismiss a pledge that already carries a receipt", async () => {
    const record = await recordSponsorshipPledge(draft(), { now: PROBE_INSTANT });
    const settled = await settleSponsorship(record.pledgeRef, "probe@x", {
      now: PROBE_INSTANT,
    });
    expect(settled.status).toBe("reconciled");
    const number = settled.status === "reconciled" ? settled.donation.receiptNumber : "";

    // The same vocabulary as reconciliation: a row that already carries a receipt is
    // "already reconciled", whichever transition asks.
    expect(await rejectPendingSponsorship(record.pledgeRef, PROBE_REJECTION_AUDIT_CONTEXT)).toEqual({
      status: "already_reconciled",
      receiptNumber: number,
    });
    expect(await settleSponsorship(record.pledgeRef, "probe@x")).toEqual({
      status: "already_reconciled",
      receiptNumber: number,
    });
    expect(
      await rejectPendingSponsorship(
        `${PROBE_PLEDGE_PREFIX}-NOPE`,
        PROBE_REJECTION_AUDIT_CONTEXT
      )
    ).toEqual({
      status: "not_found",
    });
  });
});
