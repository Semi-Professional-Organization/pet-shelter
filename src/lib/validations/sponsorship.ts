import { z } from "zod";
import {
  donationTierEnum,
  donationFrequencyEnum,
  paymentMethodEnum,
} from "@/lib/validations/donation";
import { MIN_SPONSORSHIP_SEN, MAX_SPONSORSHIP_SEN } from "@/lib/domain/petSponsorship";
import { formatMYR, senFromRinggit } from "@/lib/domain/money";

/**
 * A supporter's commitment to fund one animal's care.
 *
 * Money crosses this boundary as ringgit, matching `donationPledgeSchema` — the
 * form collects ringgit and `senFromRinggit` is the single conversion point on
 * the server. Keeping the two pledge forms the same shape means a reader does
 * not have to remember which one takes sen.
 */
export const petSponsorshipSchema = z.object({
  // Requiring an id lets the server bind the submitted name to an authoritative pet: the
  // database row when one is configured (a fixture id without a row is refused), the in-memory
  // store when none is.
  petId: z
    .string()
    .trim()
    .min(1, "Please choose the animal you would like to sponsor")
    .max(64, "That is not an animal reference"),
  petName: z
    .string()
    .trim()
    .min(1, "Please choose the animal you would like to sponsor")
    .max(100, "Pet name is too long"),

  sponsorName: z
    .string()
    .trim()
    .min(2, "Sponsor name must be at least 2 characters")
    .max(100, "Sponsor name is too long"),
  sponsorEmail: z
    .string()
    .email("Please provide a valid email address so we can confirm your sponsorship"),
  sponsorPhone: z.string().max(25, "Phone number is too long").optional().or(z.literal("")),

  tierId: donationTierEnum.default("vaccine"),
  tierName: z.string().max(120).optional(),
  frequency: donationFrequencyEnum.default("one_time"),

  amountMYR: z.coerce
    .number({ message: "Sponsorship amount must be a number" })
    .min(
      MIN_SPONSORSHIP_SEN / 100,
      `Minimum sponsorship amount is ${formatMYR(MIN_SPONSORSHIP_SEN)}`
    )
    .max(
      MAX_SPONSORSHIP_SEN / 100,
      `Maximum single sponsorship amount is ${formatMYR(MAX_SPONSORSHIP_SEN)}`
    )
    .refine((amount) => {
      try {
        senFromRinggit(amount);
        return true;
      } catch {
        return false;
      }
    }, "Sponsorship amount must use at most two decimal places"),

  paymentMethod: paymentMethodEnum.default("duitnow_qr"),
  /**
   * Public Sponsor Wall opt-in, captured at checkout.
   *
   * Recorded against this commitment rather than against a supporter account, because
   * checkout is guest-only: most supporters have no account at the moment they give. The
   * account inherits the answer when the commitment is claimed, in `registerSponsorAction`.
   */
  displayOnWall: z.boolean().default(false),

  taxIdOrIc: z.string().max(30, "Tax ID / IC / SSM number is too long").optional().or(z.literal("")),
  notes: z.string().max(500, "Note to the shelter must be under 500 characters").optional().or(z.literal("")),
});

/**
 * What a caller *sends*. `z.input`, not `z.infer`: fields carrying `.default()`
 * (`frequency`, `paymentMethod`, `displayOnWall`) are optional on the way in and
 * guaranteed on the way out. `z.infer` is the output type, which would force every caller
 * to restate every default.
 */
export type PetSponsorshipInput = z.input<typeof petSponsorshipSchema>;

/** The validated commitment, with every default resolved. */
export type PetSponsorshipParsed = z.output<typeof petSponsorshipSchema>;

/**
 * Payment rails the shelter can actually settle.
 *
 * `card` is accepted by the enum because the column records what the supporter
 * chose, but refused at the action boundary: there is no payment processor, and
 * a form that collected card details it cannot process would be worse than one
 * that says so.
 */
export const ENABLED_PAYMENT_METHODS = ["duitnow_qr", "online_banking"] as const;

export function isPaymentMethodEnabled(method: string): boolean {
  return (ENABLED_PAYMENT_METHODS as readonly string[]).includes(method);
}

/**
 * The reference a supporter was handed at checkout, as a coordinator submits it back.
 *
 * Checked at the action boundary because Server Action arguments arrive deserialised
 * and unchecked, and Prisma's `where: { pledgeRef }` accepts a filter *object* as
 * well as a string — an unvalidated argument could match every row. A pledge
 * reference is a plain string, and this makes it one before anything reads it.
 */
export const pledgeRefSchema = z
  .string({ message: "A pledge reference must be text" })
  .trim()
  .min(1, "A pledge reference is required")
  .max(64, "That is not a pledge reference");

/** Longest reason the audit row keeps for a dismissed pledge: a note, not an essay. */
export const REJECTION_REASON_MAX = 500;

/**
 * Why a coordinator dismissed a pledge. Optional, and refused rather than truncated
 * when it is over length or not text, so the audit row never carries a note the
 * coordinator did not write. The queue's input shares `REJECTION_REASON_MAX`.
 */
export const rejectionReasonSchema = z
  .string({ message: "The reason must be text" })
  .trim()
  .max(REJECTION_REASON_MAX, `The reason must be ${REJECTION_REASON_MAX} characters or fewer`)
  .nullish();
