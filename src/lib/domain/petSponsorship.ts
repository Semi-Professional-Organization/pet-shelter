import { Sen, senFromInteger, sumSen } from "@/lib/domain/money";
import { generateContributionRef } from "@/lib/domain/contributionRef";

/**
 * The lifecycle of a supporter's commitment to fund one animal's care.
 *
 * `PENDING_PAYMENT` is where every commitment starts. The supporter has told us
 * they paid; nothing has checked a bank statement. Treating that as funding
 * would let anyone raise a pet's supporter count from a public form, and would
 * tell honest donors an animal is funded when no money has arrived.
 */
export type SponsorshipStatus = "PENDING_PAYMENT" | "ACTIVE" | "CANCELLED" | "EXPIRED";

export const SPONSORSHIP_STATUSES: readonly SponsorshipStatus[] = [
  "PENDING_PAYMENT",
  "ACTIVE",
  "CANCELLED",
  "EXPIRED",
] as const;

/** Fallback care-cost target, in sen (RM 1,500.00), when an animal has none. */
export const DEFAULT_SPONSORSHIP_GOAL_SEN: Sen = senFromInteger(150000);

/**
 * Smallest custom sponsorship, in sen (RM 10.00).
 *
 * Higher than the RM 5.00 floor on the general `/donate` form on purpose: a
 * sponsorship carries per-supporter reconciliation and receipt work, so it has
 * its own floor rather than raising the floor on one-off giving.
 */
export const MIN_SPONSORSHIP_SEN: Sen = senFromInteger(1000);

/** Largest commitment the public form accepts, in sen (RM 100,000.00). */
export const MAX_SPONSORSHIP_SEN: Sen = senFromInteger(10000000);

/** Only reconciled money counts. See the note on `SponsorshipStatus`. */
export function countsTowardFunding(status: SponsorshipStatus): boolean {
  return status === "ACTIVE";
}

export interface SponsorshipAggregateRow {
  sponsorEmail: string;
  amountSen: Sen;
  status: SponsorshipStatus;
}

/** Public, non-identifying sponsorship figures for one animal. */
export interface PetSponsorshipSummary {
  petId: string;
  /** Distinct supporters with a reconciled commitment. */
  supporterCount: number;
  fundedSen: Sen;
  goalSen: Sen;
  isFullyFunded: boolean;
  /** Progress clamped to 0-100. */
  progressPercent: number;
}

/**
 * Collapses raw sponsorship rows into the figures shown on an animal's profile.
 *
 * Supporters are counted by DISTINCT email, so someone who sponsors the same
 * animal every month is one supporter rather than twelve.
 */
export function summarizePetSponsorships(
  petId: string,
  rows: readonly SponsorshipAggregateRow[],
  goalSen: Sen = DEFAULT_SPONSORSHIP_GOAL_SEN
): PetSponsorshipSummary {
  const reconciled = rows.filter((row) => countsTowardFunding(row.status));

  const supporters = new Set(reconciled.map((row) => row.sponsorEmail.trim().toLowerCase()));
  const fundedSen = sumSen(reconciled.map((row) => row.amountSen));

  // A non-positive target would make every animal "fully funded" on nothing.
  const effectiveGoal = goalSen > 0 ? goalSen : DEFAULT_SPONSORSHIP_GOAL_SEN;

  return {
    petId,
    supporterCount: supporters.size,
    fundedSen,
    goalSen: effectiveGoal,
    isFullyFunded: fundedSen >= effectiveGoal,
    progressPercent: Math.min(100, Math.max(0, Math.round((fundedSen / effectiveGoal) * 100))),
  };
}

/** A zeroed summary — used before the figures load, and when the read fails. */
export function emptySponsorshipSummary(
  petId: string,
  goalSen: Sen = DEFAULT_SPONSORSHIP_GOAL_SEN
): PetSponsorshipSummary {
  return {
    petId,
    supporterCount: 0,
    fundedSen: senFromInteger(0),
    goalSen: goalSen > 0 ? goalSen : DEFAULT_SPONSORSHIP_GOAL_SEN,
    isFullyFunded: false,
    progressPercent: 0,
  };
}

/**
 * Social proof is shown only once someone is actually counted.
 * "Currently sponsored by 0 supporters" is worse than saying nothing.
 */
export function shouldShowSocialProof(summary: PetSponsorshipSummary): boolean {
  return summary.supporterCount > 0;
}

/**
 * Reference handed to the supporter at checkout.
 *
 * Prefixed `HFS-PLG`, deliberately unlike the `HFS-DON` receipt series: a
 * coordinator reconciling a bank statement, or anyone reading the audit log,
 * must be able to tell an unverified claim from an issued receipt at a glance.
 * It is random rather than sequential because, unlike a receipt number, nothing
 * statutory depends on it being gapless.
 *
 * The shape lives in `contributionRef.ts`, shared with the general-gift series
 * `HFS-GFT`, so the two claim references cannot drift apart. Only the prefix
 * differs, and that difference is the whole point.
 */
export function generatePledgeRef(now: Date = new Date()): string {
  return generateContributionRef("PLG", now);
}

/** What the supporter is told happens next, given how they said they would pay. */
export function reconciliationNotice(frequency: string, paymentMethod: string): string {
  if (paymentMethod === "card") {
    return "Card payments are not enabled yet. Please use DuitNow QR or a direct bank transfer.";
  }

  const base =
    "Your official receipt is issued once our coordinator matches your transfer against the shelter's bank statement, usually within 2 working days.";

  return frequency === "monthly"
    ? `${base} This pledge and its receipt cover one transfer only. Contact the shelter before setting up a standing instruction for later monthly transfers.`
    : base;
}
