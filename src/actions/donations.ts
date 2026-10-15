"use server";

import { ZodError } from "zod";
import {
  donationPledgeSchema,
  giftRefSchema,
  DonationPledgeDTO,
  DonationPledgeInput,
  DonationReceiptDTO,
} from "@/lib/validations/donation";
import {
  REJECTION_REASON_MAX,
  rejectionReasonSchema,
} from "@/lib/validations/sponsorship";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { sendDonationPledgeEmail, sendDonationReceiptEmail } from "@/lib/email";
import { findSponsorshipTier } from "@/lib/domain/sponsorshipTiers";
import { currentIssuerIdentity } from "@/lib/domain/shelterIdentity";
import { formatMYR, ringgitFromSen, senFromRinggit } from "@/lib/domain/money";
import { generateGiftRef } from "@/lib/domain/donationPledge";
import { reconciliationNotice } from "@/lib/domain/petSponsorship";
import { DONATION_RECORDING_UNCONFIRMED_MESSAGE } from "@/lib/domain/contributionFailure";
import {
  DonationRecord,
  ReceiptIssuanceError,
  listDonationsOrThrow,
} from "@/lib/server/donationLedger";
import {
  DonationPledgeRecord,
  DonationPledgeWriteError,
  listPendingDonationPledges,
  recordDonationPledge,
  rejectPendingDonationPledge,
  settleDonationPledge,
} from "@/lib/server/donationPledgeLedger";
import { getVerifiedSession, requirePermission } from "@/lib/security/dal";
import {
  assertAuthorized,
  isAuthorizationError,
  PERMISSIONS,
  ROLES,
} from "@/lib/security/rbac";
import type { SessionUser } from "@/lib/security/session";
import { scheduleAfterResponse } from "@/lib/scheduleAfterResponse";

/**
 * Renders an issued receipt for the donor-facing confirmation and the emailed PDF.
 *
 * Converts the ledger's exact integer sen back to a ringgit `number` at this
 * boundary — and only here — so the existing `DonationReceiptDTO` contract, the
 * email template, and the CSV export keep working unchanged while the stored value
 * stays exact. See `src/lib/domain/money.ts` for why the two representations differ.
 */
function toReceiptDTO(record: DonationRecord): DonationReceiptDTO {
  return {
    receiptNumber: record.receiptNumber,
    date: new Date(record.issuedAt).toLocaleDateString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    donorName: record.donorName,
    donorEmail: record.donorEmail,
    donorPhone: record.donorPhone,
    tierId: record.tierId,
    tierName: record.tierName,
    amountMYR: ringgitFromSen(record.amountSen),
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    targetPetName: record.targetPetName,
    taxIdOrIc: record.taxIdOrIc,
    notes: record.notes,
    taxDeductibleRef: record.taxDeductibleRef,
    shelterRegistrationNo: record.shelterRegistrationNo,
  };
}

/** Normalises an optional free-text field: trimmed, or absent if empty. */
function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** What the donor is handed at checkout. Carries no receipt number, by design. */
function toPledgeDTO(record: DonationPledgeRecord): DonationPledgeDTO {
  return {
    pledgeRef: record.pledgeRef,
    donorName: record.donorName,
    donorEmail: record.donorEmail,
    tierId: record.tierId,
    tierName: record.tierName,
    amountMYR: ringgitFromSen(record.amountSen),
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    targetPetName: record.targetPetName,
    status: record.status,
    reconciliationNotice: reconciliationNotice(record.frequency, record.paymentMethod),
  };
}

/**
 * Server Action: records a general gift a supporter says they have sent.
 *
 * ## What changed on 2026-09-22, and why
 *
 * This action used to issue an official LHDN Section 44(6) receipt here, from the
 * form submission alone. Nothing had observed a bank statement at that point — the
 * donor was shown a DuitNow QR and told us they paid — so a public form minted
 * statutory tax documents for money the shelter had not received. Anyone could
 * produce one. `tasks/decisions/2026-09-22-general-gifts-become-pending-until-
 * reconciled.md` records the fix; the fix is that this function no longer touches
 * the receipt series at all.
 *
 * What it writes is a `PENDING_PAYMENT` row and an `HFS-GFT` reference for the
 * donor to quote on their transfer. `reconcileDonationPledgeAction` is the only
 * path to a receipt, and it runs when a coordinator has matched the money.
 *
 * ## Ordering is still load-bearing
 *
 *   1. validate → 2. rate-limit → 3. persist the pledge → 4. audit → 5. email
 *
 * If step 3 does not return a confirmed outcome, steps 4 and 5 never start. A lost
 * commit acknowledgement cannot prove rollback, so the donor is told the outcome is
 * unconfirmed and to check with the shelter before retrying, rather than being
 * invited to submit the same gift twice. Pledges never fall back to memory when
 * Postgres is configured.
 */
export async function submitDonationPledgeAction(
  input: DonationPledgeInput
): Promise<{ success: boolean; data?: DonationPledgeDTO; error?: string }> {
  try {
    const validated = donationPledgeSchema.parse(input);

    if (validated.paymentMethod === "card") {
      return {
        success: false,
        error:
          "Card payments are not available yet. Please choose DuitNow QR or a direct bank transfer.",
      };
    }

    // 1. Rate limiting: max 20 donation submissions per 5 minutes per donor email.
    const rateLimit = checkRateLimit(
      `donate:${validated.donorEmail.toLowerCase()}`,
      20,
      300000
    );
    if (!rateLimit.success) {
      return {
        success: false,
        error: `Too many submissions. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
      };
    }

    // 2. Resolve the tier name, snapshotting it onto the pledge so a later rename
    //    of the sponsorship catalog cannot alter what the donor was shown — and so
    //    the receipt drawn from this row at reconciliation says the same thing.
    const matchedTier = findSponsorshipTier(validated.tierId);
    const tierName =
      optionalText(validated.tierName) ?? matchedTier?.name ?? "Custom Rescue Donation";

    // 3. Record the claim. `senFromRinggit` rejects sub-sen precision outright
    //    rather than rounding an amount that will appear on a tax document later.
    let record: DonationPledgeRecord;
    try {
      record = await recordDonationPledge({
        donorName: validated.donorName.trim(),
        donorEmail: validated.donorEmail.trim().toLowerCase(),
        donorPhone: optionalText(validated.donorPhone),
        taxIdOrIc: optionalText(validated.taxIdOrIc),
        tierId: validated.tierId,
        tierName,
        amountSen: senFromRinggit(validated.amountMYR),
        currency: "MYR",
        frequency: validated.frequency,
        paymentMethod: validated.paymentMethod,
        targetPetName: optionalText(validated.targetPetName),
        notes: optionalText(validated.notes),
        pledgeRef: generateGiftRef(),
      });
    } catch (err) {
      if (err instanceof DonationPledgeWriteError) {
        console.error("[Donation Pledge] Write failed:", err.cause ?? err);
        return { success: false, error: DONATION_RECORDING_UNCONFIRMED_MESSAGE };
      }
      throw err;
    }

    // 4. Audit trail. `DONATION_PLEDGED`, not `DONATION_RECEIVED`: the money has
    //    not been received. The distinction is not cosmetic — `isReceiptAuditRow`
    //    in `src/lib/domain/receiptAuditRow.ts`, which every receipt view shares,
    //    classifies an entry as a receipt when its action is `DONATION_RECEIVED`,
    //    its entity is `DonationReceipt`, *or* its details carry a non-empty
    //    `receiptNumber`. This entry trips none of the three, which is what keeps
    //    an unreconciled gift out of the LHDN CSV fallback.
    recordAuditLog({
      actorId: "donor_public",
      actorEmail: record.donorEmail,
      actorRole: "DONOR",
      action: "DONATION_PLEDGED",
      entity: "DonationPledge",
      entityId: record.pledgeRef,
      details: {
        pledgeId: record.id,
        pledgeRef: record.pledgeRef,
        donorName: record.donorName,
        amountMYR: ringgitFromSen(record.amountSen),
        amountSen: record.amountSen as number,
        tierId: record.tierId,
        tierName: record.tierName,
        frequency: record.frequency,
        paymentMethod: record.paymentMethod,
        targetPetName: record.targetPetName,
        status: record.status,
      },
    });

    const pledge = toPledgeDTO(record);

    // 5. Email dispatch stays non-blocking: the pledge is already durable, so a
    //    Resend outage must not fail a gift that was genuinely recorded. The
    //    acknowledgement is tax-neutral — it says in both halves that it is not a
    //    receipt — because `isTaxClaimable` gates the claim copy on a receipt that
    //    does not exist yet.
    scheduleAfterResponse(() => sendDonationPledgeEmail(pledge));

    return { success: true, data: pledge };
  } catch (err: unknown) {
    // A ZodError's `.message` is `JSON.stringify(issues)`. Returning it put a JSON
    // array in front of the donor, which was survivable only because every rule the
    // form could break was already blocked by a `required` attribute. The
    // `wantsTaxReceipt` rule is conditional, so the browser cannot express it and
    // this path became reachable in ordinary use. Surface the first issue's message,
    // which is written for the donor, rather than the serialised error.
    if (err instanceof ZodError) {
      return {
        success: false,
        error: err.issues[0]?.message ?? "Please check the donation details and try again.",
      };
    }

    const errorMsg =
      err instanceof Error ? err.message : "Failed to process donation pledge";
    return { success: false, error: errorMsg };
  }
}

// ---------------------------------------------------------------------------
// Staff reconciliation: the only path from a gift to a receipt
// ---------------------------------------------------------------------------

/** One row of the coordinator's general-gift queue. */
export interface PendingDonationPledgeDTO {
  pledgeRef: string;
  donorName: string;
  donorEmail: string;
  tierName: string;
  /** Preformatted in MYR here so the client never re-derives money from sen. */
  amountDisplay: string;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  /** The donor's free-text dedication, if they named an animal. */
  targetPetName?: string;
  /** ISO-8601 UTC, as stored. Rendered in Asia/Kuala_Lumpur at the edge. */
  createdAt: string;
}

export type PendingDonationPledgesResult =
  | { success: true; data: PendingDonationPledgeDTO[]; hasMore: boolean; error?: never }
  | { success: false; error: string; data?: never; hasMore?: never };

const PENDING_PLEDGE_PAGE_SIZE = 200;

/** `PENDING_PAYMENT` → "pending payment", for a sentence a coordinator reads. */
function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

/** The one message for a reference that names nothing, whatever shape it arrived in. */
const NO_SUCH_PLEDGE = "No donation pledge found for that reference";

/**
 * Server Action: the general gifts awaiting a coordinator's confirmation.
 *
 * The read half of reconciliation, and the twin of `listPendingSponsorshipsAction`.
 * Without it this table would fill up and nothing could ever empty it — the exact
 * shape of `tasks/open/sponsor-portal-is-inert-until-reconciliation-is-reachable.md`,
 * where a guarded reconciliation action existed for months with no caller and every
 * commitment stayed pending.
 *
 * Guarded through `requirePermission`, which re-reads the member's live role and
 * status, so a coordinator suspended in /admin/members loses this screen on their
 * next request rather than when their cookie expires. `RECONCILE_SPONSORSHIPS`
 * rather than a new capability: it is one person matching one bank statement, and
 * splitting the permission would mean a coordinator who can settle a sponsorship
 * but not the gift on the line above it.
 *
 * The guard sits inside the `try`, as in `fetchAuditLogsAction`: a production build
 * masks a thrown Server Action error into an opaque digest, so a thrown denial
 * reached the page indistinguishable from an outage. Returned, it arrives as the
 * guard's own message and the page can say who may not do this.
 *
 * `taxIdOrIc` is deliberately absent from the DTO and from the ledger's projection:
 * a coordinator confirming that a transfer landed does not need the donor's tax
 * identifier to do it.
 */
export async function listPendingDonationPledgesAction(): Promise<PendingDonationPledgesResult> {
  try {
    await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);

    const rows = await listPendingDonationPledges(PENDING_PLEDGE_PAGE_SIZE + 1);
    return {
      success: true,
      hasMore: rows.length > PENDING_PLEDGE_PAGE_SIZE,
      data: rows.slice(0, PENDING_PLEDGE_PAGE_SIZE).map((row) => ({
        pledgeRef: row.pledgeRef,
        donorName: row.donorName,
        donorEmail: row.donorEmail,
        tierName: row.tierName,
        amountDisplay: formatMYR(row.amountSen),
        frequency: row.frequency,
        paymentMethod: row.paymentMethod,
        targetPetName: row.targetPetName,
        createdAt: row.createdAt,
      })),
    };
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };

    // Surfaced, never swallowed into an empty list: an empty queue reads as "every
    // donor has been settled", and a coordinator who believes that stops looking.
    console.error("[Donation Reconciliation] Pending queue read failed:", err);
    return {
      success: false,
      error:
        "We could not load the pending gifts. This is a read failure, not an empty queue — do not treat it as nothing to do.",
    };
  }
}

export type ReconcileDonationPledgeResult =
  | {
      success: true;
      outcome: "reconciled" | "already_reconciled";
      receiptNumber: string;
      error?: never;
    }
  | { success: false; error: string; outcome?: never; receiptNumber?: never };

/**
 * Server Action: a coordinator confirms the transfer for a gift has landed.
 *
 * **This is the only path that turns a general gift into a statutory document.**
 * The receipt is drawn through `settleDonationPledge`, from the same gapless
 * per-month series as every other receipt, *inside the transaction* that moves the
 * pledge to `ACTIVE`. Two coordinators confirming at once therefore produce one
 * receipt, and the one who lost is handed the number that exists rather than
 * minting a second one for the same money — the unique index on
 * `donation_pledges.receiptNumber` is the backstop if the guard is ever changed.
 *
 * Idempotent by outcome, not by hope: a second confirmation of a settled gift
 * returns `already_reconciled` with the original number and issues nothing. A
 * dismissed gift cannot be confirmed at all.
 *
 * `DONATION_RECEIVED` is written here rather than at submission, which is where it
 * used to fire. That action string is an interface — `useAuditLogController`,
 * `AuditLogViewer` and `exportCsv` all classify a donation by it — and moving it
 * means those three now count money the shelter has actually received.
 */
export async function reconcileDonationPledgeAction(
  pledgeRef: string
): Promise<ReconcileDonationPledgeResult> {
  let session: SessionUser;
  try {
    session = await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };
    throw err;
  }

  const ref = giftRefSchema.safeParse(pledgeRef);
  if (!ref.success) return { success: false, error: NO_SUCH_PLEDGE };

  let outcome;
  try {
    outcome = await settleDonationPledge(ref.data, currentIssuerIdentity(), session.email);
  } catch (err) {
    if (err instanceof ReceiptIssuanceError) {
      // The ledger folds every failure inside the transaction into this one error,
      // and an outage that only ever reaches a coordinator as "try again" is an
      // outage nobody investigates.
      console.error("[Donation Reconciliation] Settle failed:", err.cause ?? err);
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
      error: `Gift ${ref.data} is ${statusLabel(outcome.currentStatus)} and cannot be reconciled`,
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
    action: "DONATION_RECEIVED",
    entity: "Donation",
    entityId: donation.receiptNumber,
    details: {
      donationId: donation.id,
      receiptNumber: donation.receiptNumber,
      pledgeRef: record.pledgeRef,
      donorName: donation.donorName,
      donorEmail: donation.donorEmail,
      amountMYR: ringgitFromSen(donation.amountSen),
      amountSen: donation.amountSen as number,
      tierId: donation.tierId,
      tierName: donation.tierName,
      frequency: donation.frequency,
      paymentMethod: donation.paymentMethod,
      targetPetName: donation.targetPetName,
      // No `taxIdOrIc`, on purpose, and the same as the sponsorship lane. The
      // identifier is an NRIC; it lives on the `Donation` row, which is where the
      // statutory export reads it, and copying it into `AuditLog.metadata` stores
      // personal data a second time in a table with a different retention story.
      // See `tasks/decisions/2026-10-13-an-nric-is-not-copied-into-the-audit-log.md`.
    },
  });

  scheduleAfterResponse(() => sendDonationReceiptEmail(toReceiptDTO(donation)));

  return {
    success: true,
    outcome: "reconciled",
    receiptNumber: donation.receiptNumber,
  };
}

export type RejectDonationPledgeResult =
  | { success: true; error?: never }
  | { success: false; error: string };

/**
 * Server Action: a coordinator dismisses a gift no transfer ever backed.
 *
 * The other exit from the queue. Without it an unpaid or bogus claim would sit in
 * `PENDING_PAYMENT` forever, in front of every coordinator, every day. Nothing is
 * issued and nothing is emailed: a dismissed claim is not a gift and earns no
 * receipt.
 *
 * Both arguments are validated before anything is written. They arrive deserialised
 * and unchecked, and a bad one has to fail *before* the row flips: an error after it
 * would leave the pledge cancelled with no audit row. The ledger writes the
 * transition and the audit row in one transaction; this action reports uncertainty
 * if it cannot confirm that transaction's outcome.
 */
export async function rejectDonationPledgeAction(
  pledgeRef: string,
  reason?: string | null
): Promise<RejectDonationPledgeResult> {
  let session: SessionUser;
  try {
    session = await requirePermission(PERMISSIONS.RECONCILE_SPONSORSHIPS);
  } catch (err) {
    if (isAuthorizationError(err)) return { success: false, error: err.message };
    throw err;
  }

  const ref = giftRefSchema.safeParse(pledgeRef);
  if (!ref.success) return { success: false, error: NO_SUCH_PLEDGE };

  const note = rejectionReasonSchema.safeParse(reason);
  if (!note.success) {
    return {
      success: false,
      error:
        note.error.issues[0]?.message ??
        `Please keep the reason under ${REJECTION_REASON_MAX} characters`,
    };
  }

  let outcome;
  try {
    outcome = await rejectPendingDonationPledge(ref.data, {
      actorId: session.id,
      actorEmail: session.email,
      actorRole: session.role,
      reason: note.data || null,
    });
  } catch (err) {
    // The transition and its audit share a transaction, but a lost commit
    // acknowledgement cannot prove whether that transaction committed.
    console.error("[Donation Reconciliation] Dismiss failed:", err);
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
      error: `Gift ${ref.data} has already been reconciled as receipt ${outcome.receiptNumber} and cannot be dismissed`,
    };
  }
  if (outcome.status === "not_pending") {
    return {
      success: false,
      error: `Gift ${ref.data} is already ${statusLabel(outcome.currentStatus)}`,
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// The statutory export
// ---------------------------------------------------------------------------

/**
 * Upper bound on one export. Not a page size — the export is a single statutory
 * document and paging it would put the truncation back where nobody sees it.
 */
const RECEIPT_EXPORT_LIMIT = 1000;

/**
 * The LHDN receipts export, served from the donation ledger.
 *
 * ## Why this exists
 *
 * The export used to be assembled in the browser from `fetchAuditLogsAction(250)` —
 * the 250 most recent audit rows *of any kind*. Pet edits, logins and application
 * approvals consume that budget, so on a shelter with ordinary admin traffic older
 * receipts fell off the annual return while the UI reported success. The export
 * engine predates the ledger: it landed 2026-08-16, `donationLedger.ts` on
 * 2026-08-27, the `Donation` model on 2026-08-29. It read the audit trail because
 * that was the only source of donation data at the time.
 *
 * ## Unreconciled gifts cannot appear here, structurally
 *
 * This reads `donations`, which holds issued receipts and nothing else. A gift
 * awaiting a coordinator lives in `donation_pledges` and has no receipt number at
 * all, so it cannot reach an annual return however this query is later changed.
 * That is deliberately a property of where the rows live rather than of a `where`
 * clause somebody has to remember — before 2026-09-22 the whole defect was that
 * unverified money looked exactly like verified money once it was in this table.
 *
 * ## An outage must not read as "no donations"
 *
 * The read goes through `listDonationsOrThrow`, not `listDonations`. The latter
 * returns `[]` on any read failure, so a Neon outage would arrive here as a
 * successful, empty statutory return — indistinguishable from a shelter that took
 * no donations, and wrong in a way nobody downstream can detect.
 *
 * ## Truncation is observed, not inferred
 *
 * We ask the ledger for one row more than we will return. `records.length > bounded`
 * is then a fact about the data rather than a guess from `length === limit`, which
 * cannot tell a full page from an exact fit. The caller is expected to surface
 * `truncated` — a receipt missing from a tax filing is the defect this replaces,
 * and moving the cap without reporting it would only change the number at which
 * the same silence begins.
 *
 * Returns `DonationReceiptDTO`, mapped by the same `toReceiptDTO` the receipt email
 * uses, so the two cannot disagree about what a receipt says. The exact integer sen
 * becomes ringgit at that one boundary.
 */
export async function fetchDonationReceiptsAction(
  limit = RECEIPT_EXPORT_LIMIT
): Promise<{
  success: boolean;
  data?: DonationReceiptDTO[];
  truncated?: boolean;
  error?: string;
}> {
  try {
    const session = await getVerifiedSession();
    assertAuthorized(session, [ROLES.ADMIN, ROLES.COORDINATOR]);

    // A non-finite limit crosses the RPC boundary as easily as a good one, and
    // NaN propagates silently all the way to `{success: true, data: []}` — a clean
    // "no donations" answer to a malformed request, on a tax export.
    const bounded = Number.isFinite(limit)
      ? Math.min(Math.max(1, Math.floor(limit)), RECEIPT_EXPORT_LIMIT)
      : RECEIPT_EXPORT_LIMIT;
    const records = await listDonationsOrThrow(bounded + 1);

    return {
      success: true,
      data: records.slice(0, bounded).map(toReceiptDTO),
      truncated: records.length > bounded,
    };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to read the donation ledger";
    return { success: false, error: msg };
  }
}
