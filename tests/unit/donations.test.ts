import { describe, it, expect } from "vitest";
import { donationPledgeSchema } from "@/lib/validations/donation";
import { submitDonationPledgeAction } from "@/actions/donations";
import { sendDonationReceiptEmail } from "@/lib/email";
import { getAuditLogs } from "@/lib/domain/auditLog";
import { listDonations } from "@/lib/server/donationLedger";
import { findDonationPledgeByRef } from "@/lib/server/donationPledgeLedger";
import {
  LHDN_TAX_DEDUCTIBLE_REF,
  STATUTORY_ROS_REGISTRATION_NO,
} from "@/lib/domain/shelterIdentity";

describe("Donation & Sponsorship Validation Schema", () => {
  it("should validate a standard donation pledge successfully", () => {
    const input = {
      donorName: "Cheryl Tan",
      donorEmail: "cheryl.tan@example.com",
      donorPhone: "012-345 6789",
      tierId: "vaccine" as const,
      amountMYR: 50,
      frequency: "one_time" as const,
      targetPetName: "Milo",
      taxIdOrIc: "920512-10-5432",
      notes: "For Milo's upcoming core vaccination booster.",
    };

    const parsed = donationPledgeSchema.parse(input);
    expect(parsed.donorName).toBe("Cheryl Tan");
    expect(parsed.donorEmail).toBe("cheryl.tan@example.com");
    expect(parsed.amountMYR).toBe(50);
    expect(parsed.frequency).toBe("one_time");
    expect(parsed.tierId).toBe("vaccine");
  });

  it("should coerce string amounts to numbers and enforce minimum RM 5.00", () => {
    const validStringAmount = {
      donorName: "Ahmad Farhan",
      donorEmail: "farhan@example.com",
      tierId: "custom" as const,
      amountMYR: "150" as unknown as number,
    };

    const parsed = donationPledgeSchema.parse(validStringAmount);
    expect(parsed.amountMYR).toBe(150);

    const invalidAmount = {
      donorName: "Ahmad Farhan",
      donorEmail: "farhan@example.com",
      tierId: "custom" as const,
      amountMYR: 3,
    };

    expect(() => donationPledgeSchema.parse(invalidAmount)).toThrow(
      /Minimum donation amount is RM 5.00/
    );
  });

  it("should reject invalid email formats", () => {
    const invalidEmail = {
      donorName: "Invalid Email Donor",
      donorEmail: "not-an-email",
      tierId: "kibble" as const,
      amountMYR: 30,
    };

    expect(() => donationPledgeSchema.parse(invalidEmail)).toThrow(
      /Please provide a valid email address/
    );
  });

  it("should support monthly recurring frequency", () => {
    const monthlyInput = {
      donorName: "Rachel Wong",
      donorEmail: "rachel.wong@example.com",
      tierId: "spay_neuter" as const,
      amountMYR: 120,
      frequency: "monthly" as const,
    };

    const parsed = donationPledgeSchema.parse(monthlyInput);
    expect(parsed.frequency).toBe("monthly");
  });
});

describe("Donation Server Action (submitDonationPledgeAction)", () => {
  it("records a pledge and audits it as a claim, not as money received", async () => {
    const result = await submitDonationPledgeAction({
      donorName: "Kenneth Lee",
      donorEmail: "kenneth.lee@example.com",
      donorPhone: "+6016-987 6543",
      tierId: "emergency_medical",
      amountMYR: 250,
      frequency: "one_time",
      targetPetName: "Barnaby",
      taxIdOrIc: "880419-14-5567",
      notes: "Wishing Barnaby a speedy recovery!",
      paymentMethod: "duitnow_qr",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    if (result.data) {
      expect(result.data.pledgeRef).toMatch(/^HFS-GFT-\d{8}-\d{6}$/);
      expect(result.data.donorName).toBe("Kenneth Lee");
      expect(result.data.donorEmail).toBe("kenneth.lee@example.com");
      expect(result.data.amountMYR).toBe(250);
      expect(result.data.targetPetName).toBe("Barnaby");
      expect(result.data.status).toBe("PENDING_PAYMENT");
      expect(result.data.tierName).toBe("Emergency Medical & Trauma Care");
      expect(result.data.reconciliationNotice).toMatch(/coordinator matches your transfer/i);
    }

    // `DONATION_PLEDGED`, never `DONATION_RECEIVED`: no money has been observed.
    const logs = getAuditLogs(10);
    expect(logs.find((l) => l.action === "DONATION_RECEIVED")).toBeUndefined();

    const pledgeLog = logs.find((l) => l.action === "DONATION_PLEDGED");
    expect(pledgeLog).toBeDefined();
    expect(pledgeLog?.entity).toBe("DonationPledge");
    expect(pledgeLog?.entityId).toBe(result.data!.pledgeRef);
    expect(pledgeLog?.actorRole).toBe("DONOR");
    expect(pledgeLog?.actorEmail).toBe("kenneth.lee@example.com");
  });

  it("should handle custom amounts and default to custom tier name", async () => {
    const result = await submitDonationPledgeAction({
      donorName: "Siti Sarah",
      donorEmail: "siti.sarah@example.com",
      tierId: "custom",
      amountMYR: 75,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
    });

    expect(result.success).toBe(true);
    expect(result.data?.amountMYR).toBe(75);
    expect(result.data?.tierName).toBe("Custom Rescue Donation");
  });

  it("should return an error result for invalid input without throwing", async () => {
    const result = await submitDonationPledgeAction({
      donorName: "A", // too short (< 2 chars)
      donorEmail: "bad-email",
      tierId: "kibble",
      amountMYR: 1, // too small (< RM 5)
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("Donation Receipt Transactional Email Dispatcher", () => {
  it("should simulate and record email dispatch for donation receipts", async () => {
    const mockReceipt = {
      receiptNumber: "HFS-DON-202608-9999",
      date: "16 Aug 2026, 12:30 AM",
      donorName: "David Teoh",
      donorEmail: "david.teoh@example.com",
      donorPhone: "019-876 5432",
      tierId: "vaccine" as const,
      tierName: "Core Vaccination & Deworming",
      amountMYR: 50,
      frequency: "one_time" as const,
      paymentMethod: "duitnow_qr" as const,
      targetPetName: "Luna",
      taxIdOrIc: "910101-10-1234",
      notes: "Thanks for taking care of Luna!",
      taxDeductibleRef: LHDN_TAX_DEDUCTIBLE_REF,
      shelterRegistrationNo: STATUTORY_ROS_REGISTRATION_NO,
    };

    const emailResult = await sendDonationReceiptEmail(mockReceipt);
    expect(emailResult.success).toBe(true);
    expect(emailResult.simulated).toBe(true);
  });
});

describe("Donation persistence (the pledge table is the system of record until reconciliation)", () => {
  const basePledge = {
    donorName: "Nurul Aisyah",
    donorEmail: "nurul.aisyah@example.com",
    tierId: "kibble" as const,
    amountMYR: 30,
    frequency: "one_time" as const,
    paymentMethod: "duitnow_qr" as const,
  };

  it("writes a retrievable pledge rather than only emailing one", async () => {
    // The original defect this file guarded: the action minted a receipt number,
    // emailed it, and stored nothing. The one it guards now is the opposite end —
    // it stored a *receipt* for money nobody had counted. What is durable at this
    // point is a claim, and it must still be readable back.
    const result = await submitDonationPledgeAction(basePledge);
    expect(result.success).toBe(true);

    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);
    expect(stored).not.toBeNull();
    expect(stored?.donorName).toBe("Nurul Aisyah");
    expect(stored?.tierName).toBe("1-Week Nutrition & Kibble Fund");
    expect(stored?.status).toBe("PENDING_PAYMENT");
    expect(stored?.receiptNumber).toBeNull();
  });

  it("draws no receipt number, however many gifts are submitted", async () => {
    await submitDonationPledgeAction(basePledge);
    await submitDonationPledgeAction({ ...basePledge, donorEmail: "second@example.com" });
    await submitDonationPledgeAction({ ...basePledge, donorEmail: "third@example.com" });

    // The gapless HFS-DON series is untouched by submission. Three supporters
    // saying they paid must not consume three statutory receipt numbers.
    expect(await listDonations()).toHaveLength(0);
  });

  it("hands the donor a claim reference that cannot be mistaken for a receipt", async () => {
    const result = await submitDonationPledgeAction(basePledge);

    expect(result.data!.pledgeRef).toMatch(/^HFS-GFT-/);
    expect(result.data!.pledgeRef).not.toMatch(/HFS-DON/);
    // Nothing on the DTO can carry a receipt number: the type has no such field.
    expect(result.data).not.toHaveProperty("receiptNumber");
  });

  it("stores the amount as exact sen while the DTO still exposes ringgit", async () => {
    const result = await submitDonationPledgeAction({ ...basePledge, amountMYR: 19.9 });

    expect(result.success).toBe(true);
    expect(result.data!.amountMYR).toBe(19.9);

    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);
    expect(stored?.amountSen).toBe(1990);
  });

  it("rejects a sub-sen amount instead of rounding it onto a tax document", async () => {
    const result = await submitDonationPledgeAction({ ...basePledge, amountMYR: 30.005 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/two decimal places/);
    expect(await listDonations()).toHaveLength(0);
  });

  it("snapshots the tier name onto the pledge, so a later rename cannot rewrite it", async () => {
    const result = await submitDonationPledgeAction(basePledge);
    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);

    // The issuer identity is snapshotted onto the *receipt* at reconciliation; what
    // the pledge owns is what the donor was shown when they gave.
    expect(stored?.tierName).toBe("1-Week Nutrition & Kibble Fund");
    expect(stored?.currency).toBe("MYR");
  });

  it("links the audit entry to the pledge row it describes", async () => {
    const result = await submitDonationPledgeAction(basePledge);

    const pledgeLog = getAuditLogs(10).find((l) => l.action === "DONATION_PLEDGED");
    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);

    expect(pledgeLog?.entity).toBe("DonationPledge");
    expect(pledgeLog?.entityId).toBe(result.data!.pledgeRef);
    expect((pledgeLog?.details as Record<string, unknown>).pledgeId).toBe(stored?.id);
  });

  it("records nothing at all when validation fails", async () => {
    const result = await submitDonationPledgeAction({
      ...basePledge,
      amountMYR: 1, // below the RM 5 minimum
    });

    expect(result.success).toBe(false);
    expect(await listDonations()).toHaveLength(0);
  });

  it("refuses the unsupported card rail without recording anything", async () => {
    const result = await submitDonationPledgeAction({
      ...basePledge,
      paymentMethod: "card",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/card payments are not available/i);
    expect(await listDonations()).toHaveLength(0);
  });
});

/**
 * The form has always rendered the tax identifier with a required marker while the
 * schema accepted its absence, so a donor could be handed a receipt that announces
 * itself as tax-deductible and carries nothing to deduct against. `wantsTaxReceipt`
 * is what makes the marker true, and these pin the three states it has.
 */
describe("LHDN Section 44(6) relief is opt-in, and opting in requires an identifier", () => {
  const pledge = {
    donorName: "Nurul Huda binti Ahmad",
    donorEmail: "nurul.huda@example.com",
    tierId: "vaccine" as const,
    amountMYR: 50,
    // `DonationPledgeInput` is the schema's output type, where every `.default()`
    // field is required. The action's callers spell these out for the same reason.
    frequency: "one_time" as const,
    paymentMethod: "duitnow_qr" as const,
  };

  it("rejects a claimed receipt with no tax identifier, naming the field", () => {
    const result = donationPledgeSchema.safeParse({ ...pledge, wantsTaxReceipt: true });

    expect(result.success).toBe(false);
    const issue = result.error!.issues[0];
    expect(issue.path).toEqual(["taxIdOrIc"]);
    expect(issue.message).toMatch(/NRIC, passport or SSM number is required/);
  });

  it("rejects a whitespace-only identifier, which a trim check would otherwise pass", () => {
    const result = donationPledgeSchema.safeParse({
      ...pledge,
      wantsTaxReceipt: true,
      taxIdOrIc: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual(["taxIdOrIc"]);
  });

  it("accepts a claimed receipt that carries one", () => {
    const result = donationPledgeSchema.safeParse({
      ...pledge,
      wantsTaxReceipt: true,
      taxIdOrIc: "920512-10-5432",
    });

    expect(result.success).toBe(true);
    expect(result.data!.taxIdOrIc).toBe("920512-10-5432");
  });

  it("still accepts a gift that declines relief, with no identifier at all", () => {
    const result = donationPledgeSchema.safeParse({ ...pledge, wantsTaxReceipt: false });
    expect(result.success).toBe(true);
  });

  it("leaves every pre-existing caller working — the flag is optional, not defaulted", () => {
    // `DonationPledgeInput` is `z.infer`, the schema's *output* type, where a
    // `.default()` field is required. Had this been `.default(false)`, every existing
    // call site would have stopped compiling for a flag it has no opinion about.
    const result = donationPledgeSchema.safeParse(pledge);

    expect(result.success).toBe(true);
    expect(result.data!.wantsTaxReceipt).toBeUndefined();
  });

  it("records a gift that declined relief — the pledge queue stays complete", async () => {
    const result = await submitDonationPledgeAction({ ...pledge, wantsTaxReceipt: false });

    // Declining relief must not create a gift the shelter never recorded: the
    // ledger is the shelter's record of money received, not of claims made. What
    // changed in 2026-09-22 is *when* the receipt half of that record is written.
    expect(result.success).toBe(true);
    expect(result.data!.pledgeRef).toMatch(/^HFS-GFT-\d{8}-\d{6}$/);

    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);
    expect(stored?.taxIdOrIc).toBeUndefined();
    expect(await listDonations()).toHaveLength(0);
  });

  it("hands the donor the message, not a serialised ZodError", async () => {
    const result = await submitDonationPledgeAction({ ...pledge, wantsTaxReceipt: true });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NRIC, passport or SSM number is required/);
    // The regression this guards: `err.message` on a Zod 4 error is JSON.
    expect(result.error).not.toMatch(/^\s*\[/);
    expect(await listDonations()).toHaveLength(0);
  });
});
