import { z } from "zod";
import { DONATION_DEDICATION_MAX_LENGTH, isGiftRef } from "@/lib/domain/donationPledge";

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
    .email("Please provide a valid email address"),
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
  // The donor's own dedication, free text. Bounded here and nothing more: it is
  // deliberately never checked against the catalogue, because it is the donor's
  // note and not a pet reference. The staff queue and the donor's confirmation and
  // emails label it that way; raw audit details still show the `targetPetName` key
  // (tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md).
  targetPetName: z
    .string()
    .max(DONATION_DEDICATION_MAX_LENGTH, "Dedication is too long")
    .optional()
    .or(z.literal("")),
  paymentMethod: paymentMethodEnum.default("duitnow_qr"),
  // No tax identifier and no relief opt-in. The shelter is not a registered society
  // and cannot issue a tax receipt (owner, 2026-11-05; #239), so an NRIC
  // collected here would be personal data with no purpose. Zod strips unknown keys,
  // so a stale client that still sends `taxIdOrIc` has it dropped, not stored.
  notes: z
    .string()
    .max(500, "Note to shelter must be under 500 characters")
    .optional()
    .or(z.literal("")),
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
 * official `HFS-DON-*` tax receipt number. What they get now is a claim
 * reference to quote on their transfer, and the acknowledgement follows
 * reconciliation — so there is no field here for a receipt number to be
 * smuggled into.
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

/** A numbered acknowledgement, as the export and the acknowledgement email read it. */
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
  notes?: string;
}
