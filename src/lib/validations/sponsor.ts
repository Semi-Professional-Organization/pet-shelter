import { z } from "zod";

/**
 * Matches the receipt numbers `donationLedger.ts` issues: `HFS-DON-YYYYMM-NNNN`, padded
 * to at least four digits and deliberately not truncated beyond them — a shelter issuing
 * more than 9,999 receipts in a month gets a wider serial rather than a wrapped one.
 */
export const RECEIPT_NUMBER_PATTERN = /^HFS-DON-\d{6}-\d{4,}$/;

export const sponsorRegistrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name")
    .max(100, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password is too long"),
  /**
   * Proof that the registrant holds a receipt issued to this email address.
   *
   * Without it, registering with someone else's email would hand over their entire
   * giving history. The receipt number is delivered only in the donor's own e-Receipt
   * email, so possession of one is a workable shared secret until verified-email
   * sign-up exists.
   */
  receiptNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(RECEIPT_NUMBER_PATTERN, "Enter a donation reference in the form HFS-DON-202608-0001"),
  displayOnWall: z.boolean().default(false),
});

export const sponsorLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const wallPreferenceSchema = z.object({
  displayOnWall: z.boolean(),
});

/** What a caller sends: `displayOnWall` carries a default, so it is optional on the way in. */
export type SponsorRegistrationInput = z.input<typeof sponsorRegistrationSchema>;
export type SponsorLoginInput = z.infer<typeof sponsorLoginSchema>;
