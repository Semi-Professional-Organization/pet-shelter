import { z } from "zod";
import { isGiftRef } from "@/lib/domain/donationPledge";

export const donationTierEnum = z.enum([
  "kibble",
  "vaccine",
  "spay_neuter",
  "emergency_medical",
  "custom",
]);

export const donationFrequencyEnum = z.enum(["one_time", "monthly"]);
export const paymentMethodEnum = z.enum(["duitnow_qr", "online_banking", "card"]);

export const donationPledgeSchema = z.object({
  donorName: z
    .string()
    .min(2, "Donor name must be at least 2 characters")
    .max(100, "Donor name is too long"),
  donorEmail: z
    .string()
    .email("Please provide a valid email address for receipt dispatch"),
  donorPhone: z
    .string()
    .max(25, "Phone number is too long")
    .optional()
    .or(z.literal("")),
  tierId: donationTierEnum.default("vaccine"),
  tierName: z.string().optional(),
  amountMYR: z.coerce
    .number({ message: "Donation amount must be a number" })
    .min(5, "Minimum donation amount is RM 5.00")
    .max(100000, "Maximum single donation amount is RM 100,000.00"),
  frequency: donationFrequencyEnum.default("one_time"),
  targetPetName: z
    .string()
    .max(100, "Pet dedication name is too long")
    .optional()
    .or(z.literal("")),
  paymentMethod: paymentMethodEnum.default("duitnow_qr"),
  /**
   * The donor intends to claim Section 44(6) relief on this gift.
   *
   * Deliberately **not persisted**. `Donation.taxIdOrIc` already records whether an
   * issued receipt carries a claimable identifier, so a column here would be a
   * second, divergible answer to one question. This flag decides which fields the
   * form requires and nothing else, which is why it lives in the validator rather
   * than in the ledger.
   *
   * `z.boolean()`, not `z.coerce.boolean()`: coercion is `Boolean(value)`, so the
   * string `"false"` would arrive as `true` and silently require a tax number from
   * a donor who declined one.
   *
   * `.optional()`, not `.default(false)`: `DonationPledgeInput` is `z.infer`, which
   * is the schema's *output* type, and a defaulted field is required there. That
   * would have made every existing caller — `useSponsorshipController` among them —
   * fail to compile for a flag they have no opinion about. Absent means the donor
   * did not ask for relief, which is what the form did before this field existed.
   */
  wantsTaxReceipt: z.boolean().optional(),
  taxIdOrIc: z
    .string()
    .max(30, "Tax ID / IC / SSM number is too long")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(500, "Note to shelter must be under 500 characters")
    .optional()
    .or(z.literal("")),
}).superRefine((pledge, ctx) => {
  // Every gift is recorded either way, and every *reconciled* gift earns a receipt —
  // the ledger is the shelter's complete record of money received, so opting out of
  // relief must not create a donation the series never saw. What the flag changes is
  // whether that receipt can actually be claimed: without an identifier it is a
  // thank-you, not a tax document. Marking the field required in the form while
  // accepting it as absent here is how a donor ends up holding a "tax-deductible"
  // receipt they cannot file.
  //
  // Since 2026-09-22 the receipt is issued at reconciliation rather than at
  // submission, so the identifier collected here is snapshotted onto the pending
  // pledge and copied onto the receipt when a coordinator confirms the transfer.
  if (!pledge.wantsTaxReceipt) return;

  if (!pledge.taxIdOrIc || pledge.taxIdOrIc.trim() === "") {
    ctx.addIssue({
      code: "custom",
      path: ["taxIdOrIc"],
      message:
        "An NRIC, passport or SSM number is required for a Section 44(6) tax-exemption receipt.",
    });
  }
});

export type DonationPledgeInput = z.infer<typeof donationPledgeSchema>;

/**
 * The reference a donor was handed at checkout, as a coordinator submits it back.
 *
 * Checked at the action boundary for the reason `pledgeRefSchema` gives in
 * `sponsorship.ts`: Server Action arguments arrive deserialised and unchecked, and
 * Prisma's `where: { pledgeRef }` accepts a filter *object* as readily as a string,
 * so an unvalidated argument could match every row rather than one.
 */
export const giftRefSchema = z
  .string({ message: "A pledge reference must be text" })
  .trim()
  .min(1, "A pledge reference is required")
  .max(64, "That is not a pledge reference")
  // Stricter than the sponsorship twin, which checks only length. This series has
  // exactly one producer, `generateGiftRef`, so the shape is knowable — and the
  // check is what stops a receipt number pasted into the queue's reference field
  // reaching Prisma and coming back as an unhelpful "not found".
  .refine(isGiftRef, "That is not a pledge reference");

/**
 * What the donor sees the moment the donation form completes.
 *
 * Deliberately not a `DonationReceiptDTO`. Until 2026-09-22 this flow returned
 * one, which meant a supporter who had sent nothing walked away holding an
 * official `HFS-DON-*` Section 44(6) number. What they get now is a claim
 * reference to quote on their transfer, and the receipt follows reconciliation —
 * so there is no field here for a receipt number to be smuggled into, and none of
 * the tax-claim copy `isTaxClaimable` gates has anything to render from.
 */
export interface DonationPledgeDTO {
  pledgeRef: string;
  donorName: string;
  donorEmail: string;
  tierId: z.infer<typeof donationTierEnum>;
  tierName: string;
  amountMYR: number;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  targetPetName?: string;
  /** Always `PENDING_PAYMENT` here; a receipt follows reconciliation. */
  status: string;
  /** What the donor is told happens next, given how they said they would pay. */
  reconciliationNotice: string;
}

export interface DonationReceiptDTO {
  receiptNumber: string;
  date: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  tierId: z.infer<typeof donationTierEnum>;
  tierName: string;
  amountMYR: number;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  targetPetName?: string;
  taxIdOrIc?: string;
  notes?: string;
  taxDeductibleRef: string;
  shelterRegistrationNo: string;
}
