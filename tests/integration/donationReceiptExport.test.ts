import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  memberRowForId,
  signInAs,
  signInAsAdmin,
  signOut,
  TEST_ADMIN,
} from "../setup/authSession";
import { generateReceiptsCsvString } from "@/lib/presentation/exportCsv";
import type { DonationRecord } from "@/lib/server/donationLedger";

/**
 * Tier 3a — the donation records export, at the Server Action boundary.
 *
 * The export used to be assembled in the browser from the 250 most recent audit
 * rows *of any kind*, so donations fell off a statutory return once ordinary
 * admin traffic pushed them past the cap. Three properties keep that from
 * coming back, and none of them is visible to `tsc`:
 *
 *  1. **The amount survives the hop.** `listDonations()` returns `DonationRecord`
 *     (`amountSen`, `issuedAt`); the CSV builder consumes `DonationReceipt`
 *     (`amountMYR`, `date`). Its branch is keyed on `"receiptNumber" in item`,
 *     which a `DonationRecord` also satisfies — so an unmapped record does not
 *     throw, it prints the string `undefined` into the amount column of a tax
 *     document. That was measured before this action was written; the spike
 *     verdict is in `tasks/open/CLAIM-lhdn-export-reads-auditlog.md`.
 *  2. **Truncation is reported.** The original defect was silence, not the cap.
 *     A fix that moved the number without saying when it was hit would only
 *     change where the silence begins.
 *  3. **Authorization runs before the ledger is read.** A check that runs after
 *     the query has already read the donor PII it was meant to protect.
 */

const listDonationsOrThrow = vi.fn();
const findMemberAuthStateById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/donationLedger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/donationLedger")>();
  return { ...actual, listDonationsOrThrow };
});

vi.mock("@/lib/server/memberStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/memberStore")>();
  return { ...actual, findMemberAuthStateById };
});

/** One ledger row, shaped exactly as `toRecord` returns it. RM 250.00 as exact sen. */
function record(overrides: Partial<DonationRecord> = {}): DonationRecord {
  return {
    id: "don_1",
    receiptNumber: "HFS-DON-202608-0007",
    sequenceScope: "HFS-DON-202608",
    sequenceValue: 7,
    donorName: "Siti Aminah",
    donorEmail: "siti@example.com",
    donorPhone: "+60123456789",
    taxIdOrIc: "880101-14-5566",
    tierId: "vaccine",
    tierName: "Core Vaccination & Deworming",
    amountSen: 25000,
    currency: "MYR",
    frequency: "one_time",
    paymentMethod: "duitnow_qr",
    targetPetName: "Barnaby",
    notes: undefined,
    taxDeductibleRef: "LHDN-REF-01",
    shelterRegistrationNo: "ROS-0001",
    issuedAt: "2026-08-15T02:00:00.000Z",
    ...overrides,
  } as DonationRecord;
}

/**
 * Splits one RFC-4180 record into fields.
 *
 * `row.split(",")` is wrong here and fails in a way that looks like a product
 * bug: the MYT date renders as `15 Aug 2026, 10:00 AM`, so a naive split shifts
 * every column after it and the amount assertion reads the tax ID instead.
 */
function fields(line: string): string[] {
  const out: string[] = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

/** The cell under a named header, for the first data row of the generated CSV. */
function cell(csv: string, header: string): string {
  const [head, row] = csv.split(/\r?\n/);
  const index = fields(head).indexOf(header);
  expect(index, `header ${header} not found in: ${head}`).toBeGreaterThanOrEqual(0);
  return fields(row)[index];
}

beforeEach(() => {
  listDonationsOrThrow.mockReset();
  findMemberAuthStateById.mockReset().mockImplementation(async (id: string) => memberRowForId(id));
});

describe("fetchDonationReceiptsAction", () => {
  it("refuses an unauthenticated caller without reading the ledger", async () => {
    await signOut();
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.success).toBe(false);
    expect(res.data).toBeUndefined();
    // Ordering is the security property: a refusal that arrives after the query
    // has already pulled donor IC numbers out of the ledger is not a refusal.
    expect(listDonationsOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a role below coordinator without reading the ledger", async () => {
    await signInAs("VOLUNTEER");
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.success).toBe(false);
    expect(listDonationsOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a suspended admin's still-valid cookie before reading donor PII", async () => {
    await signInAsAdmin();
    const activeAdmin = memberRowForId(TEST_ADMIN.id);
    if (!activeAdmin) throw new Error("Expected the test admin fixture");
    findMemberAuthStateById.mockResolvedValueOnce({ ...activeAdmin, status: "SUSPENDED" });
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.success).toBe(false);
    expect(res.data).toBeUndefined();
    expect(listDonationsOrThrow).not.toHaveBeenCalled();
  });

  it("admits an admin", async () => {
    await signInAsAdmin();
    listDonationsOrThrow.mockResolvedValue([record()]);
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it("renders the ringgit amount and the issue date into the CSV", async () => {
    // The regression. An unmapped DonationRecord prints "undefined" here.
    await signInAsAdmin();
    listDonationsOrThrow.mockResolvedValue([record()]);
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();
    const csv = generateReceiptsCsvString(res.data!);

    expect(cell(csv, "Amount (MYR)")).toBe("250.00");
    expect(cell(csv, "Amount (MYR)")).not.toBe("undefined");
    expect(cell(csv, "Date & Time")).not.toBe("");
    expect(cell(csv, "Record No")).toBe("HFS-DON-202608-0007");
    // Stored tax identifiers are not exported: the shelter holds no registration (#250).
    expect(csv).not.toContain("880101-14-5566");
    expect(csv).not.toContain("LHDN-REF-01");
    expect(csv).not.toContain("ROS-0001");
  });

  it("dates the receipt in Asia/Kuala_Lumpur, not UTC", async () => {
    // 2026-08-31T17:30Z is 2026-09-01 01:30 in MYT. A receipt dated by UTC lands
    // in the wrong month's return, which is the whole reason the ledger stores
    // an instant and renders at the edges.
    await signInAsAdmin();
    listDonationsOrThrow.mockResolvedValue([record({ issuedAt: "2026-08-31T17:30:00.000Z" })]);
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.data![0].date).toContain("Sep");
    expect(res.data![0].date).not.toContain("Aug");
  });

  it("reports truncation instead of silently dropping receipts", async () => {
    await signInAsAdmin();
    // The action asks for limit + 1 so "there are more" is observed rather than
    // inferred from a full page, which cannot tell a cap from an exact fit.
    listDonationsOrThrow.mockResolvedValue([record({ id: "a" }), record({ id: "b" }), record({ id: "c" })]);
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction(2);

    expect(listDonationsOrThrow).toHaveBeenCalledWith(3);
    expect(res.data).toHaveLength(2);
    expect(res.truncated).toBe(true);
  });

  it("does not claim truncation on an exact fit", async () => {
    await signInAsAdmin();
    listDonationsOrThrow.mockResolvedValue([record({ id: "a" }), record({ id: "b" })]);
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction(2);

    expect(res.data).toHaveLength(2);
    expect(res.truncated).toBe(false);
  });

  it("surfaces a ledger failure rather than exporting an empty return", async () => {
    // This asserts the shipped behaviour only because the export reads through
    // `listDonationsOrThrow`. Against `listDonations`, which swallows every read
    // error into `[]`, the same test would pass while verifying nothing: a Neon
    // outage would reach the operator as a successful, empty statutory return.
    await signInAsAdmin();
    listDonationsOrThrow.mockRejectedValue(new Error("ledger unreachable"));
    const { fetchDonationReceiptsAction } = await import("@/actions/donations");

    const res = await fetchDonationReceiptsAction();

    expect(res.success).toBe(false);
    expect(res.error).toContain("ledger unreachable");
  });
});
