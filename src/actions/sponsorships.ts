"use server";

import { ZodError } from "zod";
import {
  petSponsorshipSchema,
  PetSponsorshipInput,
  isPaymentMethodEnabled,
  pledgeRefSchema,
  rejectionReasonSchema,
} from "@/lib/validations/sponsorship";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { findSponsorshipTier } from "@/lib/domain/sponsorshipTiers";
import { currentIssuerIdentity } from "@/lib/domain/shelterIdentity";
import { formatMYR, ringgitFromSen, senFromRinggit } from "@/lib/domain/money";
import {
  PetSponsorshipSummary,
  emptySponsorshipSummary,
  generatePledgeRef,
  reconciliationNotice,
} from "@/lib/domain/petSponsorship";
import {
  SPONSORSHIP_ANIMAL_NOT_FOUND_MESSAGE,
  SPONSORSHIP_RECORDING_FAILURE_MESSAGE,
  SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE,
  sponsorshipAnimalUnavailableMessage,
} from "@/lib/domain/contributionFailure";
import {
  SponsorshipWriteError,
  listPendingSponsorships,
  recordSponsorshipPledge,
  rejectPendingSponsorship,
  settleSponsorship,
  summarizeSponsorshipsForPet,
} from "@/lib/server/sponsorshipLedger";
import { ReceiptIssuanceError } from "@/lib/server/donationLedger";
import { sendSponsorshipWelcomeEmail, sendDonationReceiptEmail } from "@/lib/email";
import type { SessionUser } from "@/lib/security/session";
import { requirePermission } from "@/lib/security/dal";
import { PERMISSIONS, isAuthorizationError } from "@/lib/security/rbac";
import { getCurrentSponsorSession } from "@/lib/security/sponsorSession";
import { findSponsorById } from "@/lib/server/sponsorRepository";
import { PetStoreUnavailableError, findPetForWriteAsync } from "@/lib/server/petRepository";
import { scheduleAfterResponse } from "@/lib/scheduleAfterResponse";

/** What the supporter sees the moment checkout completes. */
export interface SponsorshipPledgeDTO {
  pledgeRef: string;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  tierId: string;
  tierName: string;
  amountMYR: number;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  /** Always PENDING_PAYMENT here; a receipt follows reconciliation. */
  status: string;
  reconciliationNotice: string;
}

export type CreateSponsorshipResult =
  | { success: true; data: SponsorshipPledgeDTO; error?: never }
  | { success: false; error: string; data?: never };

/**
 * Links checkout only when the signed token, live account and submitted address
 * all identify the same sponsor. Runtime extras such as a forged `userId` never
 * cross this boundary.
 */
async function resolveCheckoutSponsorId(sponsorEmail: string): Promise<string | null> {
  const session = await getCurrentSponsorSession();
  if (!session) return null;

  const sponsor = await findSponsorById(session.sponsorId);
  if (!sponsor) return null;

  const sessionEmail = session.email.trim().toLowerCase();
  const accountEmail = sponsor.email.trim().toLowerCase();
  return sessionEmail === accountEmail && accountEmail === sponsorEmail ? sponsor.id : null;
}

/**
 * Server Action: records a supporter's commitment to fund one animal's care.
 *
 * Ordering mirrors `submitDonationPledgeAction`: validate -> rate-limit ->
 * persist -> audit -> email. If persistence does not return a confirmed outcome,
 * audit and email do not start and the supporter is told to verify before retrying.
 *
 * The one deliberate difference is what comes out the other end. The donation
 * form issues a receipt because that flow treats submission as the gift; a
 * sponsorship is a standing commitment settled by bank transfer, and at this
 * point nothing has checked a bank statement — the supporter was shown a
 * DuitNow QR and told us they paid. So this returns a pledge reference and a
 * welcome email, and the Section 44(6) receipt waits for
 * `reconcilePetSponsorshipAction`.
 */
export async function createPetSponsorshipAction(
  input: PetSponsorshipInput
): Promise<CreateSponsorshipResult> {
  let validated;
  try {
    validated = petSponsorshipSchema.parse(input);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof ZodError
          ? (err.issues[0]?.message ?? "Please check the sponsorship details")
          : err instanceof Error
            ? err.message
            : "Please check the sponsorship details",
    };
  }

  if (!isPaymentMethodEnabled(validated.paymentMethod)) {
    return {
      success: false,
      error:
        "Card payments are not available yet. Please choose DuitNow QR or a direct bank transfer.",
    };
  }

  const sponsorEmail = validated.sponsorEmail.trim().toLowerCase();

  const rateLimit = checkRateLimit(`sponsor:${sponsorEmail}`, 10, 300000);
  if (!rateLimit.success) {
    return {
      success: false,
      error: `Too many sponsorship submissions. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
    };
  }

  const tier = findSponsorshipTier(validated.tierId);
  const tierName = validated.tierName?.trim() || tier?.name || "Custom Sponsorship";
  const amountSen = senFromRinggit(validated.amountMYR);
  const pledgeRef = generatePledgeRef();

  // `findPetForWriteAsync`, not the display reader: a pledge must name an animal the database
  // holds, so an outage throws here rather than answering from the `src/data/pets.json` mirror
  // (`tasks/decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`).
  let pet;
  let sponsorUserId: string | null;
  try {
    [pet, sponsorUserId] = await Promise.all([
      findPetForWriteAsync(validated.petId),
      resolveCheckoutSponsorId(sponsorEmail),
    ]);
  } catch (err) {
    // Both lookups run before any write, so nothing was recorded: the "could not record"
    // message, not the "could not confirm" one.
    // A pet-store outage was already logged by the repository.
    if (!(err instanceof PetStoreUnavailableError)) {
      console.error("[Sponsorship Checkout] Sponsor lookup failed:", err);
    }
    return { success: false, error: SPONSORSHIP_RECORDING_FAILURE_MESSAGE };
  }
  if (!pet) {
    return { success: false, error: SPONSORSHIP_ANIMAL_NOT_FOUND_MESSAGE };
  }
  // Archiving is the shelter's "take this down" action. `getPetById` already refuses an archived
  // animal on the profile; checkout is the path that takes money, so it refuses too (#91).
  if (pet.isArchived) {
    return { success: false, error: sponsorshipAnimalUnavailableMessage(pet.name) };
  }

  let record;
  try {
    record = await recordSponsorshipPledge({
      petId: pet.id,
      petName: pet.name,
      sponsorName: validated.sponsorName.trim(),
      sponsorEmail,
      sponsorPhone: validated.sponsorPhone?.trim() || undefined,
      userId: sponsorUserId,
      tierId: validated.tierId,
      tierName,
      frequency: validated.frequency,
      amountSen,
      paymentMethod: validated.paymentMethod,
      displayOnWall: validated.displayOnWall,
      pledgeRef,
      taxIdOrIc: validated.taxIdOrIc?.trim() || undefined,
      notes: validated.notes?.trim() || undefined,
    });
  } catch (err) {
    if (err instanceof SponsorshipWriteError) {
      return {
        success: false,
        error: SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE,
      };
    }
    throw err;
  }

  recordAuditLog({
    actorId: "sponsor_public",
    actorEmail: sponsorEmail,
    actorRole: "DONOR",
    action: "SPONSORSHIP_PLEDGED",
    entity: "PetSponsorship",
    entityId: record.pledgeRef,
    details: {
      pledgeRef: record.pledgeRef,
      petId: record.petId,
      petName: record.petName,
      sponsorName: record.sponsorName,
      tierId: record.tierId,
      tierName: record.tierName,
      frequency: record.frequency,
      amountSen: record.amountSen as number,
      amountDisplay: formatMYR(record.amountSen),
      paymentMethod: record.paymentMethod,
      status: record.status,
    },
  });

  const dto: SponsorshipPledgeDTO = {
    pledgeRef: record.pledgeRef,
    petName: record.petName,
    sponsorName: record.sponsorName,
    sponsorEmail: record.sponsorEmail,
    tierId: record.tierId,
    tierName: record.tierName,
    amountMYR: ringgitFromSen(record.amountSen),
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    status: record.status,
    reconciliationNotice: reconciliationNotice(record.frequency, record.paymentMethod),
  };

  // The pledge is already durable, so mail failure cannot undo it. Register the
  // promise with the request lifecycle so a serverless instance is not frozen
  // while the acknowledgement is still in flight.
  scheduleAfterResponse(() => sendSponsorshipWelcomeEmail(dto));

  return { success: true, data: dto };
}

/** One row of the coordinator's reconciliation queue. */
export interface PendingSponsorshipDTO {
  pledgeRef: string;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  tierName: string;
  /** Preformatted in MYR here so the client never re-derives money from sen. */
  amountDisplay: string;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  /** ISO-8601 UTC, as stored. Rendered in Asia/Kuala_Lumpur at the edge. */
  createdAt: string;
}

export type PendingSponsorshipsResult =
  | { success: true; data: PendingSponsorshipDTO[]; hasMore: boolean; error?: never }
  | { success: false; error: string; data?: never; hasMore?: never };

const PENDING_SPONSORSHIP_PAGE_SIZE = 200;

/** `PENDING_PAYMENT` → "pending payment", for a sentence a coordinator reads. */
function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

/** The one message for a reference that names nothing, whatever shape it arrived in. */
const NO_SUCH_PLEDGE = "No sponsorship found for that pledge reference";

/**
 * Server Action: the commitments awaiting a coordinator's confirmation.
 *
 * The read half of reconciliation. `reconcilePetSponsorshipAction` has existed and
 * been guarded since PR #6 but nothing called it, so every commitment stayed
 * `PENDING_PAYMENT`, no `receiptNumber` was ever assigned, and the portal's
 * account-claim challenge — which requires one — could never be satisfied by
 * anybody. See `tasks/open/sponsor-portal-is-inert-until-reconciliation-is-reachable.md`.
 *
 * Guarded through `requirePermission`, which re-reads the member's live role and
 * status: a coordinator suspended in /admin/members loses this screen on their
 * next request, not when their cookie expires. `RECONCILE_SPONSORSHIPS` rather
 * than a role list because a capability question survives a role being renamed.
 *
 * The guard sits inside the `try`, as in `fetchAuditLogsAction`. A production build
 * masks a thrown Server Action error into an opaque digest, so a thrown denial reached
 * the page indistinguishable from an outage; returned, it arrives as the guard's own
 * message and the page can say who may not do this.
 *
 * `taxIdOrIc` is deliberately absent from the DTO: a coordinator confirming that a
 * bank transfer landed does not need the supporter's tax identifier to do it, and
 * projecting it here would put a statutory identifier on a screen for no purpose.
 */
export async function listPendingSponsorshipsAction(): Promise<PendingSponsorshipsResult> {
  try {
    await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);

    const rows = await listPendingSponsorships(PENDING_SPONSORSHIP_PAGE_SIZE + 1);
    return {
      success: true,
      hasMore: rows.length > PENDING_SPONSORSHIP_PAGE_SIZE,
      data: rows.slice(0, PENDING_SPONSORSHIP_PAGE_SIZE).map((row) => ({
        pledgeRef: row.pledgeRef,
        petName: row.petName,
        sponsorName: row.sponsorName,
        sponsorEmail: row.sponsorEmail,
        tierName: row.tierName,
        amountDisplay: formatMYR(row.amountSen),
        frequency: row.frequency,
        paymentMethod: row.paymentMethod,
        createdAt: row.createdAt,
      })),
    };
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };

    // Surfaced, never swallowed into an empty list: an empty queue reads as "every
    // supporter has been settled", and a coordinator who believes that stops looking.
    console.error("[Sponsorship Reconciliation] Pending queue read failed:", err);
    return {
      success: false,
      error:
        "We could not load the pending commitments. This is a read failure, not an empty queue — do not treat it as nothing to do.",
    };
  }
}

export type ReconcileSponsorshipResult =
  | {
      success: true;
      outcome: "reconciled" | "already_reconciled";
      receiptNumber: string;
      error?: never;
    }
  | { success: false; error: string; outcome?: never; receiptNumber?: never };

/**
 * Server Action: a coordinator confirms the transfer for a pledge has landed.
 *
 * This is the only path that turns a commitment into a statutory document. The
 * receipt is drawn through `settleSponsorship`, from the same gapless per-month
 * series as every other receipt, *inside the transaction* that moves the pledge to
 * `ACTIVE`. Two coordinators confirming at once therefore produce one receipt, and
 * the one who lost is handed the number that exists. Until 2026-09-14 this action
 * issued first and guarded second, so a lost race left a receipt attached to
 * nothing and a log line asking for an offsetting correction; there is no spare
 * outcome any more.
 *
 * The guard returns its denial for the reason `listPendingSponsorshipsAction`'s
 * does; the rest of the action keeps its own error handling, because "the receipt
 * could not be issued" and "you may not do this" are different sentences.
 */
export async function reconcilePetSponsorshipAction(
  pledgeRef: string
): Promise<ReconcileSponsorshipResult> {
  let session: SessionUser;
  try {
    session = await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };
    throw err;
  }

  const ref = pledgeRefSchema.safeParse(pledgeRef);
  if (!ref.success) return { success: false, error: NO_SUCH_PLEDGE };

  let outcome;
  try {
    outcome = await settleSponsorship(ref.data, currentIssuerIdentity(), session.email);
  } catch (err) {
    if (err instanceof ReceiptIssuanceError) {
      // The ledger folds every failure inside the transaction into this one error,
      // and an outage that only ever reaches a coordinator as "try again" is an
      // outage nobody investigates.
      console.error("[Sponsorship Reconciliation] Settle failed:", err.cause ?? err);
      return {
        success: false,
        error:
          "We could not confirm whether reconciliation completed. Reload the queue before trying again.",
      };
    }
    throw err;
  }

  if (outcome.status === "not_found") {
    return { success: false, error: NO_SUCH_PLEDGE };
  }
  if (outcome.status === "not_pending") {
    return {
      success: false,
      error: `Pledge ${ref.data} is ${statusLabel(outcome.currentStatus)} and cannot be reconciled`,
    };
  }
  if (outcome.status === "already_reconciled") {
    // Settled already, by this coordinator a moment ago or by another. Return the
    // number that exists rather than minting another for the same money.
    return {
      success: true,
      outcome: "already_reconciled",
      receiptNumber: outcome.receiptNumber,
    };
  }

  const { record, donation } = outcome;

  recordAuditLog({
    actorId: session.id,
    actorEmail: session.email,
    actorRole: session.role,
    action: "SPONSORSHIP_RECONCILED",
    entity: "PetSponsorship",
    entityId: ref.data,
    details: {
      pledgeRef: ref.data,
      receiptNumber: donation.receiptNumber,
      petName: record.petName,
      // The block below exists for the LHDN CSV fallback. This row is classified
      // as a donation by `exportCsv` (it carries a `receiptNumber`), and that
      // exporter reads one specific key per column: without them a reconciled
      // sponsorship exported as "Anonymous Donor", with the reconciling
      // coordinator's address as the donor's, RM 0.00 as the amount, and the
      // literals "Rescue Donation" and "DuitNow QR" invented for the rest.
      //
      // `amountMYR` in particular is not optional decoration: it is the *only*
      // amount key that exporter reads, so `amountSen` and `amountDisplay` beside
      // it — which every other reader uses — left the money column reading zero on
      // a document filed with LHDN.
      //
      // No `taxIdOrIc`, on purpose, and the same as the general-gift lane. It is
      // an NRIC; it lives on the `Donation` row, where the statutory export reads
      // it, and is not copied into `AuditLog.metadata`. See
      // `tasks/decisions/2026-10-13-an-nric-is-not-copied-into-the-audit-log.md`.
      sponsorName: record.sponsorName,
      sponsorEmail: record.sponsorEmail,
      amountMYR: ringgitFromSen(record.amountSen),
      tierId: donation.tierId,
      tierName: donation.tierName,
      frequency: donation.frequency,
      paymentMethod: donation.paymentMethod,
      targetPetName: donation.targetPetName,
      amountSen: record.amountSen as number,
      amountDisplay: formatMYR(record.amountSen),
    },
  });

  const receipt = {
    receiptNumber: donation.receiptNumber,
    date: new Date(donation.issuedAt).toLocaleDateString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    donorName: donation.donorName,
    donorEmail: donation.donorEmail,
    donorPhone: donation.donorPhone,
    tierId: donation.tierId,
    tierName: donation.tierName,
    amountMYR: ringgitFromSen(donation.amountSen),
    frequency: donation.frequency,
    paymentMethod: donation.paymentMethod,
    targetPetName: donation.targetPetName,
    taxIdOrIc: donation.taxIdOrIc,
    notes: donation.notes,
    taxDeductibleRef: donation.taxDeductibleRef,
    shelterRegistrationNo: donation.shelterRegistrationNo,
  };
  scheduleAfterResponse(() => sendDonationReceiptEmail(receipt));

  return {
    success: true,
    outcome: "reconciled",
    receiptNumber: donation.receiptNumber,
  };
}

export type RejectSponsorshipResult =
  | { success: true; error?: never }
  | { success: false; error: string };

/**
 * Server Action: a coordinator dismisses a pledge no transfer ever backed.
 *
 * The other exit from the queue. Without it an unpaid or bogus claim sat in
 * `PENDING_PAYMENT` forever, in front of every coordinator, every day. Nothing is
 * issued and nothing is emailed: a dismissed claim is not a gift and earns no
 * receipt. The actor and the reason go to the audit log, which is the record of
 * *why* a pledge left the queue; the row itself records only that it did.
 *
 * Both arguments are validated before anything is written. They arrive
 * deserialised and unchecked, and a bad one has to fail *before* the row flips:
 * an error after it would leave the pledge cancelled with no audit row. The
 * ledger therefore writes the transition and audit row in the same transaction;
 * this action reports uncertainty if it cannot confirm that transaction's outcome.
 */
export async function rejectPetSponsorshipAction(
  pledgeRef: string,
  reason?: string | null
): Promise<RejectSponsorshipResult> {
  let session: SessionUser;
  try {
    session = await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };
    throw err;
  }

  const ref = pledgeRefSchema.safeParse(pledgeRef);
  if (!ref.success) return { success: false, error: NO_SUCH_PLEDGE };

  const note = rejectionReasonSchema.safeParse(reason);
  if (!note.success) {
    return {
      success: false,
      error: note.error.issues[0]?.message ?? "Please check the reason and try again",
    };
  }

  let outcome;
  try {
    outcome = await rejectPendingSponsorship(ref.data, {
      actorId: session.id,
      actorEmail: session.email,
      actorRole: session.role,
      reason: note.data || null,
    });
  } catch (err) {
    // The transition and its audit share a transaction, but a lost commit
    // acknowledgement cannot prove whether that transaction committed.
    console.error("[Sponsorship Reconciliation] Dismiss failed:", err);
    return {
      success: false,
      error:
        "We could not complete or verify that dismissal. Reload the queue before trying again.",
    };
  }

  if (outcome.status === "not_found") {
    return { success: false, error: NO_SUCH_PLEDGE };
  }
  if (outcome.status === "already_reconciled") {
    return {
      success: false,
      error: `Pledge ${ref.data} has already been reconciled as receipt ${outcome.receiptNumber} and cannot be dismissed`,
    };
  }
  if (outcome.status === "not_pending") {
    return {
      success: false,
      error: `Pledge ${ref.data} is already ${statusLabel(outcome.currentStatus)}`,
    };
  }

  return { success: true };
}

/**
 * Server Action: public sponsorship figures for one animal.
 *
 * Read from the client after mount, because `/pets/[id]` is prerendered through
 * `generateStaticParams` — a value read during render would be frozen at build
 * time and would never show a new supporter.
 */
export async function getPetSponsorshipSummaryAction(
  petId: string
): Promise<PetSponsorshipSummary> {
  if (!petId) return emptySponsorshipSummary(petId);

  try {
    return await summarizeSponsorshipsForPet(petId);
  } catch (err) {
    // A figures lookup must never take the profile down with it. Zeroed reads as
    // "no supporters yet", which is the honest degraded answer.
    console.warn(
      "[Sponsorship Summary] Falling back to an empty summary:",
      err instanceof Error ? err.message : err
    );
    return emptySponsorshipSummary(petId);
  }
}
