import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import {
  issueDonationReceipt,
  isLedgerPersistent,
  listDonations,
  findDonationByReceiptNumber,
  receiptScopeFor,
  formatReceiptNumber,
  type DonationDraft,
} from "@/lib/server/donationLedger";
import { senFromInteger } from "@/lib/domain/money";
import {
  requireDatabaseUrl,
  assertDatabaseReachable,
  cleanProbeLedger,
  PROBE_INSTANT,
} from "./support/database";

/**
 * Closes the standing gap recorded in docs/tasks/TARGET_SCHEMA_TYPE_INTEGRITY.md §2:
 * the transaction and upsert path in the donation ledger had only ever been proven
 * against a hand-built fake that *models* row locking and rollback
 * (tests/unit/donationLedger.test.ts). A fake built to implement the behaviour the
 * code expects cannot tell you whether the database agrees.
 *
 * Everything asserted here is a property of PostgreSQL rather than of the module:
 * transactional rollback of the counter, the unique index, row-level locking under
 * concurrency, and exact integer round-tripping.
 */

const SCOPE = receiptScopeFor(PROBE_INSTANT);

function draft(overrides: Partial<DonationDraft> = {}): DonationDraft {
  return {
    donorName: "Probe Donor",
    donorEmail: "probe@example.test",
    tierId: "kibble",
    tierName: "Kibble Fund",
    amountSen: senFromInteger(25_000),
    currency: "MYR",
    frequency: "one_time",
    paymentMethod: "duitnow_qr",
    ...overrides,
  };
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

describe("donation ledger against real PostgreSQL", () => {
  it("takes the Postgres branch rather than the in-memory ledger", async () => {
    // Guards the whole suite. If this is false, every assertion below still
    // passes — against an array in this process.
    expect(isLedgerPersistent()).toBe(true);

    const record = await issueDonationReceipt(draft(), { now: PROBE_INSTANT });

    // Read back through Prisma directly, not through the module that wrote it.
    const row = await prisma.donation.findUnique({
      where: { receiptNumber: record.receiptNumber },
    });
    expect(row).not.toBeNull();
    expect(row?.donorEmail).toBe("probe@example.test");
    // A memory-mode id looks like "mem-don-000001"; a persisted one is a cuid.
    expect(record.id).not.toMatch(/^mem-don-/);
    expect(row?.id).toBe(record.id);
  });

  it("issues contiguous serials from 1 and advances the counter row in step", async () => {
    const issued = [];
    for (let i = 0; i < 5; i += 1) {
      issued.push(await issueDonationReceipt(draft(), { now: PROBE_INSTANT }));
    }

    expect(issued.map((r) => r.sequenceValue)).toEqual([1, 2, 3, 4, 5]);
    expect(issued.map((r) => r.receiptNumber)).toEqual([
      formatReceiptNumber(SCOPE, 1),
      formatReceiptNumber(SCOPE, 2),
      formatReceiptNumber(SCOPE, 3),
      formatReceiptNumber(SCOPE, 4),
      formatReceiptNumber(SCOPE, 5),
    ]);

    const counter = await prisma.receiptSequence.findUnique({ where: { scope: SCOPE } });
    expect(counter?.lastValue).toBe(5);
  });

  it("stays gapless when concurrent donors race for the same scope", async () => {
    // The design claim is that the counter upsert takes a row-level write lock, so
    // concurrent writers queue rather than draw the same serial. Only a real server
    // can demonstrate that; the unit-test fake asserts its own implementation of it.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => issueDonationReceipt(draft(), { now: PROBE_INSTANT }))
    );

    const serials = results.map((r) => r.sequenceValue).sort((a, b) => a - b);
    expect(serials).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(results.map((r) => r.receiptNumber)).size).toBe(8);

    const rows = await prisma.donation.findMany({ where: { sequenceScope: SCOPE } });
    expect(rows).toHaveLength(8);
  });

  it("rolls the counter back when the insert fails, which a SEQUENCE cannot do", async () => {
    await issueDonationReceipt(draft(), { now: PROBE_INSTANT });

    // Mirrors issueInPostgres: draw a number, then fail. If the counter survived
    // the rollback, the next real receipt would be 3 and 2 would be permanently
    // missing — the gap the ReceiptSequence model comment exists to rule out.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.receiptSequence.upsert({
          where: { scope: SCOPE },
          create: { scope: SCOPE, lastValue: 1 },
          update: { lastValue: { increment: 1 } },
        });
        throw new Error("simulated insert failure");
      })
    ).rejects.toThrow("simulated insert failure");

    const counter = await prisma.receiptSequence.findUnique({ where: { scope: SCOPE } });
    expect(counter?.lastValue).toBe(1);

    const next = await issueDonationReceipt(draft(), { now: PROBE_INSTANT });
    expect(next.sequenceValue).toBe(2);
  });

  it("lets the database, not the application, reject a duplicated serial", async () => {
    const first = await issueDonationReceipt(draft(), { now: PROBE_INSTANT });

    // The @@unique([sequenceScope, sequenceValue]) index is the real guarantee; the
    // transaction is only the mechanism. Bypass the module to prove the index is
    // actually present in the pushed schema rather than merely declared in it.
    await expect(
      prisma.donation.create({
        data: {
          receiptNumber: first.receiptNumber + "-DUPLICATE",
          sequenceScope: first.sequenceScope,
          sequenceValue: first.sequenceValue,
          donorName: "Duplicate Serial",
          donorEmail: "duplicate@example.test",
          tierId: "kibble",
          tierName: "Kibble Fund",
          amountSen: 1_000,
          currency: "MYR",
          frequency: "one_time",
          paymentMethod: "duitnow_qr",
          taxDeductibleRef: "",
          shelterRegistrationNo: "",
          issuedAt: PROBE_INSTANT,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("round-trips money as exact integer sen", async () => {
    // RM 1,234.56. A float column or a numeric-as-string would surface here.
    const record = await issueDonationReceipt(draft({ amountSen: senFromInteger(123_456) }), {
      now: PROBE_INSTANT,
    });

    const row = await prisma.donation.findUnique({
      where: { receiptNumber: record.receiptNumber },
    });
    expect(row?.amountSen).toBe(123_456);
    expect(Number.isInteger(row?.amountSen)).toBe(true);

    const fetched = await findDonationByReceiptNumber(record.receiptNumber);
    expect(fetched?.amountSen).toBe(123_456);
  });

  it("round-trips optional columns and writes no tax snapshot on a new row", async () => {
    const record = await issueDonationReceipt(
      draft({
        donorPhone: "+60 12-345 6789",
        targetPetName: "Tuah",
        notes: "In honour of a very good dog.",
      }),
      { now: PROBE_INSTANT }
    );

    const fetched = await findDonationByReceiptNumber(record.receiptNumber);
    expect(fetched).toMatchObject({
      donorPhone: "+60 12-345 6789",
      targetPetName: "Tuah",
      notes: "In honour of a very good dog.",
      // The shelter is not a registered society (#239): a new row carries no ROS or
      // LHDN identifier and no donor tax number.
      taxDeductibleRef: "",
      shelterRegistrationNo: "",
    });
    expect(fetched?.taxIdOrIc).toBeUndefined();

    // Columns the schema declares nullable must come back as undefined rather than
    // null, so a persisted DonationRecord matches the in-memory branch exactly.
    const bare = await issueDonationReceipt(draft(), { now: PROBE_INSTANT });
    const bareFetched = await findDonationByReceiptNumber(bare.receiptNumber);
    expect(bareFetched?.donorPhone).toBeUndefined();
    expect(bareFetched?.targetPetName).toBeUndefined();
  });

  it("lists issued receipts newest first", async () => {
    const older = await issueDonationReceipt(draft({ donorName: "Older" }), {
      now: new Date("2999-01-15T04:00:00.000Z"),
    });
    const newer = await issueDonationReceipt(draft({ donorName: "Newer" }), {
      now: new Date("2999-01-20T04:00:00.000Z"),
    });

    const listed = await listDonations(500);
    const probeRows = listed.filter((r) => r.sequenceScope === SCOPE);
    expect(probeRows[0]?.receiptNumber).toBe(newer.receiptNumber);
    expect(probeRows.map((r) => r.receiptNumber)).toContain(older.receiptNumber);
  });
});
