import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLES } from "@/lib/security/permissions";

/**
 * No official receipt exists before a coordinator confirms the money.
 *
 * Until 2026-09-22 `submitDonationPledgeAction` allocated an `HFS-DON-*` Section
 * 44(6) receipt the moment the public donation form was submitted. Nothing had
 * observed a bank statement: the donor was shown a DuitNow QR and told us they
 * paid. Anyone could mint a filable tax document from a public form without
 * sending a cent. It was settled by
 * `tasks/decisions/2026-09-22-general-gifts-become-pending-until-reconciled.md`,
 * and the "settles when" clause of the open entry it closed (issue #56) is what
 * this file asserts:
 *
 *   "no official receipt is allocated before that boundary confirms the money,
 *    while duplicate confirmations remain idempotent."
 *
 * Both halves are here, plus the third thing the entry demanded be covered before
 * the action's result changed: that the statutory export cannot see an
 * unreconciled gift.
 */

const currentRole = { value: null as string | null };

/**
 * The seeded staff account for each role.
 *
 * The actions guard through `requirePermission`, which re-reads the member behind
 * the cookie. These ids resolve to the same role and email on every path, so a
 * case means the same thing with or without a database on localhost.
 */
const SEEDED: Record<string, { id: string; email: string }> = {
  [ROLES.SUPER_ADMIN]: { id: "usr-admin-01", email: "admin@hopeforstrays.org" },
  [ROLES.VOLUNTEER_COORDINATOR]: {
    id: "usr-coord-01",
    email: "coordinator@hopeforstrays.org",
  },
  [ROLES.STAFF]: { id: "usr-staff-01", email: "staff@hopeforstrays.org" },
};

vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn(async () => {
    if (currentRole.value === null) return null;
    const seeded = SEEDED[currentRole.value];
    return {
      id: seeded.id,
      email: seeded.email,
      name: `Test ${currentRole.value}`,
      role: currentRole.value,
      expiresAt: Date.now() + 3_600_000,
    };
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const RECEIPT_NUMBER = /^HFS-DON-\d{6}-\d{4}$/;
const GIFT_REF = /^HFS-GFT-\d{8}-\d{6}$/;

const GIFT = {
  donorName: "Nurul Huda binti Ahmad",
  donorEmail: "nurul.huda@example.com",
  tierId: "vaccine" as const,
  tierName: "Core Vaccination & Deworming",
  amountMYR: 50,
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
};

/** Submits a gift through the public action and returns its pledge reference. */
async function pledge(overrides: Record<string, unknown> = {}): Promise<string> {
  const { submitDonationPledgeAction } = await import("@/actions/donations");
  const result = await submitDonationPledgeAction({ ...GIFT, ...overrides });
  expect(result.success).toBe(true);
  return result.data!.pledgeRef;
}

beforeEach(() => {
  currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
});

describe("the receipt series is untouched until reconciliation", () => {
  it("allocates no receipt number when a gift is pledged", async () => {
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { findDonationPledgeByRef } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    const ref = await pledge();

    expect(ref).toMatch(GIFT_REF);
    const stored = await findDonationPledgeByRef(ref);
    expect(stored?.status).toBe("PENDING_PAYMENT");
    expect(stored?.receiptNumber).toBeNull();

    // The single assertion the whole change exists for.
    expect(await listDonations()).toHaveLength(0);
  });

  it("allocates exactly one receipt when a coordinator confirms the transfer", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");

    const ref = await pledge();
    const outcome = await reconcileDonationPledgeAction(ref);

    expect(outcome.success).toBe(true);
    expect(outcome.outcome).toBe("reconciled");
    expect(outcome.receiptNumber).toMatch(RECEIPT_NUMBER);

    const ledger = await listDonations();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].receiptNumber).toBe(outcome.receiptNumber);
  });

  it("draws the number from the same gapless monthly series", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");

    const first = await pledge();
    const second = await pledge({ donorEmail: "second@example.com" });
    const third = await pledge({ donorEmail: "third@example.com" });

    // Reconciled out of submission order on purpose: the serial follows the
    // confirmation, not the claim, because the claim is not evidence of anything.
    const b = await reconcileDonationPledgeAction(second);
    const a = await reconcileDonationPledgeAction(first);
    const c = await reconcileDonationPledgeAction(third);

    const serials = [b, a, c].map((r) => Number(r.receiptNumber!.split("-").pop()));
    expect(serials).toEqual([1, 2, 3]);
  });

  it("copies the pledge's snapshot and the issuer identity onto the receipt", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { findDonationByReceiptNumber } = await import(
      "@/lib/server/donationLedger"
    );
    const { LHDN_TAX_DEDUCTIBLE_REF, STATUTORY_ROS_REGISTRATION_NO } = await import(
      "@/lib/domain/shelterIdentity"
    );

    const ref = await pledge({
      taxIdOrIc: "920512-10-5432",
      wantsTaxReceipt: true,
      targetPetName: "Barnaby",
      notes: "Get well soon",
    });
    const outcome = await reconcileDonationPledgeAction(ref);

    const receipt = await findDonationByReceiptNumber(outcome.receiptNumber!);
    expect(receipt?.donorName).toBe("Nurul Huda binti Ahmad");
    expect(receipt?.amountSen).toBe(5000);
    expect(receipt?.tierName).toBe("Core Vaccination & Deworming");
    expect(receipt?.taxIdOrIc).toBe("920512-10-5432");
    expect(receipt?.targetPetName).toBe("Barnaby");
    expect(receipt?.notes).toBe("Get well soon");
    // Snapshotted at issuance, so correcting the ROS number later cannot rewrite
    // a receipt already in a donor's hands.
    expect(receipt?.taxDeductibleRef).toBe(LHDN_TAX_DEDUCTIBLE_REF);
    expect(receipt?.shelterRegistrationNo).toBe(STATUTORY_ROS_REGISTRATION_NO);
  });
});

describe("duplicate confirmations are idempotent", () => {
  it("returns the original number and issues nothing the second time", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");

    const ref = await pledge();
    const first = await reconcileDonationPledgeAction(ref);
    const second = await reconcileDonationPledgeAction(ref);

    expect(second.success).toBe(true);
    expect(second.outcome).toBe("already_reconciled");
    expect(second.receiptNumber).toBe(first.receiptNumber);

    // The point of the guard: one gift, one statutory document. A second receipt
    // for the same money cannot be withdrawn, only offset.
    expect(await listDonations()).toHaveLength(1);
  });

  it("does not advance the series on a repeated confirmation", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");

    const first = await pledge();
    const second = await pledge({ donorEmail: "second@example.com" });

    await reconcileDonationPledgeAction(first);
    await reconcileDonationPledgeAction(first);
    const outcome = await reconcileDonationPledgeAction(second);

    // Serial 2, not 3: the repeat consumed nothing.
    expect(Number(outcome.receiptNumber!.split("-").pop())).toBe(2);
  });

  it("refuses a reference that names nothing, without touching the series", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");

    const missing = await reconcileDonationPledgeAction("HFS-GFT-20260101-999999");
    expect(missing.success).toBe(false);
    expect(missing.error).toMatch(/no donation pledge found/i);

    // Prisma's string inputs also accept filter objects, so a non-string argument
    // is refused at the boundary rather than matching every row.
    const filterObject = await reconcileDonationPledgeAction({
      not: "",
    } as unknown as string);
    expect(filterObject.success).toBe(false);

    expect(await listDonations()).toHaveLength(0);
  });
});

describe("dismissal is the other exit, and issues nothing", () => {
  it("cancels a gift no transfer backed, with no receipt", async () => {
    const { rejectDonationPledgeAction } = await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");
    const { findDonationPledgeByRef } = await import(
      "@/lib/server/donationPledgeLedger"
    );

    const ref = await pledge();
    const outcome = await rejectDonationPledgeAction(ref, "no transfer after 30 days");

    expect(outcome.success).toBe(true);
    expect((await findDonationPledgeByRef(ref))?.status).toBe("CANCELLED");
    expect(await listDonations()).toHaveLength(0);
  });

  it("will not reconcile a gift that was dismissed", async () => {
    const { reconcileDonationPledgeAction, rejectDonationPledgeAction } = await import(
      "@/actions/donations"
    );
    const { listDonations } = await import("@/lib/server/donationLedger");

    const ref = await pledge();
    await rejectDonationPledgeAction(ref, null);
    const outcome = await reconcileDonationPledgeAction(ref);

    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/cancelled/i);
    expect(await listDonations()).toHaveLength(0);
  });

  it("will not dismiss a gift that was already reconciled", async () => {
    const { reconcileDonationPledgeAction, rejectDonationPledgeAction } = await import(
      "@/actions/donations"
    );

    const ref = await pledge();
    const settled = await reconcileDonationPledgeAction(ref);
    const outcome = await rejectDonationPledgeAction(ref, "changed my mind");

    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain(settled.receiptNumber!);
  });

  it("records who dismissed it and why, without a receiptNumber key", async () => {
    const { rejectDonationPledgeAction } = await import("@/actions/donations");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");

    const ref = await pledge();
    await rejectDonationPledgeAction(ref, "duplicate submission");

    const entry = getAuditLogs(20).find((l) => l.action === "DONATION_PLEDGE_REJECTED");
    expect(entry?.entity).toBe("DonationPledge");
    expect(entry?.entityId).toBe(ref);
    expect((entry?.details as Record<string, unknown>).reason).toBe(
      "duplicate submission"
    );
    // `useAuditLogController` and `exportCsv` classify any entry carrying a
    // `receiptNumber` as a donation receipt. A dismissed gift must not be one.
    expect(entry?.details as Record<string, unknown>).not.toHaveProperty(
      "receiptNumber"
    );
  });
});

describe("the LHDN export cannot see an unreconciled gift", () => {
  it("reports nothing while gifts are pending, and the receipt once confirmed", async () => {
    const { fetchDonationReceiptsAction, reconcileDonationPledgeAction } = await import(
      "@/actions/donations"
    );

    const ref = await pledge();
    await pledge({ donorEmail: "still.pending@example.com" });

    currentRole.value = ROLES.SUPER_ADMIN;
    const before = await fetchDonationReceiptsAction();
    expect(before.success).toBe(true);
    expect(before.data).toHaveLength(0);

    currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
    const settled = await reconcileDonationPledgeAction(ref);

    currentRole.value = ROLES.SUPER_ADMIN;
    const after = await fetchDonationReceiptsAction();
    expect(after.data).toHaveLength(1);
    expect(after.data![0].receiptNumber).toBe(settled.receiptNumber);

    // The second gift is still pending, and the export is blind to it — not by a
    // filter, but because a pledge lives in a different table entirely.
    expect(after.data!.map((r) => r.donorEmail)).not.toContain(
      "still.pending@example.com"
    );
  });
});

describe("the audit trail says what actually happened", () => {
  it("writes DONATION_RECEIVED at reconciliation, never at submission", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");

    const ref = await pledge();

    // `DONATION_RECEIVED` is an interface: `useAuditLogController`,
    // `AuditLogViewer` and `exportCsv` each classify a donation by it. Firing it
    // at submission is what made those three count money nobody had received.
    expect(getAuditLogs(20).find((l) => l.action === "DONATION_RECEIVED")).toBeUndefined();

    const pledged = getAuditLogs(20).find((l) => l.action === "DONATION_PLEDGED");
    expect(pledged?.entity).toBe("DonationPledge");
    expect(pledged?.details as Record<string, unknown>).not.toHaveProperty(
      "receiptNumber"
    );

    const settled = await reconcileDonationPledgeAction(ref);

    const received = getAuditLogs(20).find((l) => l.action === "DONATION_RECEIVED");
    expect(received?.entity).toBe("Donation");
    expect(received?.entityId).toBe(settled.receiptNumber);
    expect((received?.details as Record<string, unknown>).pledgeRef).toBe(ref);
    expect(received?.actorEmail).toBe("coordinator@hopeforstrays.org");
  });

  it("keeps the donor's NRIC on the receipt and out of the audit log", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { getAuditLogs } = await import("@/lib/domain/auditLog");
    const { findDonationByReceiptNumber } = await import("@/lib/server/donationLedger");

    const ref = await pledge({ taxIdOrIc: "920512-10-5432", wantsTaxReceipt: true });
    const settled = await reconcileDonationPledgeAction(ref);

    // On the statutory row, which is what the LHDN export reads...
    const receipt = await findDonationByReceiptNumber(settled.receiptNumber!);
    expect(receipt?.taxIdOrIc).toBe("920512-10-5432");

    // ...and in neither audit row. An identifier in `AuditLog.metadata` is personal
    // data stored a second time, and the sponsorship lane never copied it there.
    for (const entry of getAuditLogs(20)) {
      expect(JSON.stringify(entry.details ?? {})).not.toContain("920512-10-5432");
    }
  });
});

describe("the reconciliation boundary is guarded", () => {
  it("refuses a staff account and issues nothing", async () => {
    const { reconcileDonationPledgeAction, listPendingDonationPledgesAction } =
      await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");

    const ref = await pledge();

    currentRole.value = ROLES.STAFF;
    const queue = await listPendingDonationPledgesAction();
    const attempt = await reconcileDonationPledgeAction(ref);

    expect(queue.success).toBe(false);
    expect(attempt.success).toBe(false);
    expect(await listDonations()).toHaveLength(0);
  });

  it("refuses a signed-out caller and issues nothing", async () => {
    const { reconcileDonationPledgeAction } = await import("@/actions/donations");
    const { listDonations } = await import("@/lib/server/donationLedger");

    const ref = await pledge();

    currentRole.value = null;
    const attempt = await reconcileDonationPledgeAction(ref);

    expect(attempt.success).toBe(false);
    expect(await listDonations()).toHaveLength(0);
  });

  it("shows a coordinator the pending queue, oldest first, without NRICs", async () => {
    const { listPendingDonationPledgesAction } = await import("@/actions/donations");

    await pledge({ donorEmail: "first@example.com", taxIdOrIc: "920512-10-5432" });
    await pledge({ donorEmail: "second@example.com" });

    const queue = await listPendingDonationPledgesAction();

    expect(queue.success).toBe(true);
    expect(queue.data!.map((r) => r.donorEmail)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    // Confirming that a transfer landed does not require reading anyone's NRIC,
    // so it is absent from the DTO and from the ledger's projection.
    expect(queue.data![0]).not.toHaveProperty("taxIdOrIc");
  });
});
