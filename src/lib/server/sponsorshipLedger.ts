import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  ReceiptIssuanceError,
  drawAndInsert,
  isLedgerPersistent,
  issueReceiptInMemory,
  withReceiptTransaction,
  type DonationDraft,
  type DonationRecord,
} from "@/lib/server/donationLedger";
import type { StatutoryIssuerIdentity } from "@/lib/domain/shelterIdentity";
import type { SponsorshipTierId } from "@/types/sponsorship";
import { formatMYR, Sen, senFromInteger } from "@/lib/domain/money";
import {
  persistAuditLog,
  recordAuditLog,
  type AuditEntryInput,
} from "@/lib/domain/auditLog";
import {
  DEFAULT_SPONSORSHIP_GOAL_SEN,
  PetSponsorshipSummary,
  SponsorshipAggregateRow,
  SponsorshipStatus,
  generatePledgeRef,
  summarizePetSponsorships,
} from "@/lib/domain/petSponsorship";
import { uniqueViolationOn } from "@/lib/server/uniqueViolation";

/**
 * Repository for supporters' care commitments.
 *
 * ## Two declared modes, not a try/catch fallback
 *
 * The same contract `donationLedger.ts` documents, and `isLedgerPersistent()` is
 * imported from it rather than re-derived so the two can never disagree about
 * which mode the process is in:
 *
 * - `DATABASE_URL` set — Postgres is authoritative and an unconfirmed write
 *   propagates. No in-memory fallback can pretend it succeeded.
 * - `DATABASE_URL` unset — the in-memory ledger is authoritative. This is a
 *   deliberate configuration (local dev, unit tests), not a degraded database.
 *
 * The distinction matters here more than usual: reconciliation issues a receipt.
 * If a commit acknowledgement is lost, the caller must surface that uncertainty
 * and read back before retrying; silently switching stores is never an answer.
 */

export interface SponsorshipRecord {
  id: string;
  petId: string | null;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  sponsorPhone?: string;
  userId?: string | null;
  /** Sponsor Wall consent as given at this checkout. */
  displayOnWall?: boolean;
  tierId: string;
  tierName: string;
  frequency: "one_time" | "monthly";
  amountSen: Sen;
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  status: SponsorshipStatus;
  pledgeRef: string;
  receiptNumber?: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  taxIdOrIc?: string;
  notes?: string;
}

export type SponsorshipDraft = Omit<
  SponsorshipRecord,
  "id" | "status" | "receiptNumber" | "createdAt"
>;

export class SponsorshipWriteError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SponsorshipWriteError";
    this.cause = cause;
  }
}

/** Postgres foreign key violation — an optional relation no longer has a row. */
const FK_VIOLATION = "P2003";

function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === FK_VIOLATION
  );
}

// ---------------------------------------------------------------- memory mode

let memorySponsorships: SponsorshipRecord[] = [];
let memorySerial = 0;

/** Test-only. Wired into the global `beforeEach` alongside the donation ledger. */
export function resetSponsorshipLedger(): void {
  memorySponsorships = [];
  memorySerial = 0;
}

/** Diagnostic read of the in-memory ledger. */
export function memorySponsorshipCount(): number {
  return memorySponsorships.length;
}

// --------------------------------------------------------------------- writes

/**
 * Records a commitment as `PENDING_PAYMENT`.
 *
 * Nothing here has verified that money moved, which is why this allocates a
 * pledge reference and never a receipt number.
 */
export async function recordSponsorshipPledge(
  draft: SponsorshipDraft,
  options?: { now?: Date }
): Promise<SponsorshipRecord> {
  const when = options?.now ?? new Date();

  if (!isLedgerPersistent()) {
    memorySerial += 1;
    const record: SponsorshipRecord = {
      ...draft,
      id: `mem-spn-${String(memorySerial).padStart(6, "0")}`,
      status: "PENDING_PAYMENT",
      receiptNumber: null,
      createdAt: when.toISOString(),
    };
    memorySponsorships = [record, ...memorySponsorships];
    return record;
  }

  const data = {
    petId: draft.petId,
    petName: draft.petName,
    sponsorName: draft.sponsorName,
    sponsorEmail: draft.sponsorEmail,
    sponsorPhone: draft.sponsorPhone ?? null,
    userId: draft.userId ?? null,
    displayOnWall: draft.displayOnWall ?? false,
    tierId: draft.tierId,
    tierName: draft.tierName,
    frequency: draft.frequency,
    amountSen: draft.amountSen as number,
    paymentMethod: draft.paymentMethod,
    status: "PENDING_PAYMENT",
    pledgeRef: draft.pledgeRef,
    taxIdOrIc: draft.taxIdOrIc ?? null,
    notes: draft.notes ?? null,
    createdAt: when,
  };

  try {
    return toRecord(await prisma.petSponsorship.create({ data }));
  } catch (err) {
    // A reference collision is not a failed write, and must not be reported as an
    // unconfirmed one. `pledgeRef` is a 6-digit random scoped to a UTC day on a
    // unique column, so two supporters on a busy day can draw the same serial —
    // roughly a 2% chance per day at ~200 pledges. Until 2026-10-13 that fell
    // through to `SponsorshipWriteError`, which told the supporter the outcome was
    // unknown and not to retry: the commitment was lost for want of a second draw.
    //
    // "unnamed" counts as a collision for the reason `donationPledgeLedger` gives:
    // this insert never sets `receiptNumber`, so NULL cannot collide and the
    // reference is the only unique the statement can violate. One redraw only; a
    // second collision is not a coincidence.
    if (uniqueViolationOn(err, "pledgeRef") !== false) {
      try {
        return toRecord(
          await prisma.petSponsorship.create({
            data: { ...data, pledgeRef: generatePledgeRef(when) },
          })
        );
      } catch (retryErr) {
        throw new SponsorshipWriteError(
          "Could not record the sponsorship after a reference collision",
          retryErr
        );
      }
    }

    if (isForeignKeyViolation(err) && (draft.petId || draft.userId)) {
      try {
        // Both relations are optional and can disappear independently. Read the
        // referents after the failed insert instead of assuming every P2003 names
        // the pet: an account can be deleted between checkout identity resolution
        // and this write. Only the missing relation is cleared, so a fixture pet
        // does not discard a valid sponsor link (or vice versa).
        const [pet, sponsor] = await Promise.all([
          draft.petId
            ? prisma.pet.findUnique({ where: { id: draft.petId }, select: { id: true } })
            : null,
          draft.userId
            ? prisma.sponsor.findUnique({ where: { id: draft.userId }, select: { id: true } })
            : null,
        ]);
        const retryData = {
          ...data,
          petId: pet ? draft.petId : null,
          userId: sponsor ? draft.userId : null,
        };

        if (retryData.petId !== data.petId || retryData.userId !== data.userId) {
          return toRecord(await prisma.petSponsorship.create({ data: retryData }));
        }
      } catch (retryError) {
        throw new SponsorshipWriteError("Could not record the sponsorship", retryError);
      }
    }
    throw new SponsorshipWriteError("Could not record the sponsorship", err);
  }
}

export type ReconcileOutcome =
  | { status: "reconciled"; record: SponsorshipRecord }
  | { status: "already_reconciled"; receiptNumber: string }
  /** The row exists but left `PENDING_PAYMENT` without a receipt: dismissed or withdrawn. */
  | { status: "not_pending"; currentStatus: SponsorshipStatus }
  | { status: "not_found" };

/** What a caller is told about a row that has already left `PENDING_PAYMENT`. */
function settledOutcome(
  record: SponsorshipRecord
): Extract<ReconcileOutcome, { status: "already_reconciled" | "not_pending" }> {
  // The receipt is the discriminator, not the status. A commitment that was settled
  // and later withdrawn by its supporter (`cancelSponsorshipForUser`) is CANCELLED
  // *with* a receipt, and that receipt is what a coordinator needs to be told about.
  return record.receiptNumber
    ? { status: "already_reconciled", receiptNumber: record.receiptNumber }
    : { status: "not_pending", currentStatus: record.status };
}

/** The columns a transition out of `PENDING_PAYMENT` writes. */
interface PendingTransition {
  status: "ACTIVE" | "CANCELLED";
  receiptNumber?: string;
  reconciledAt?: Date;
  reconciledBy?: string;
  cancelledAt?: Date;
}

type TransitionOutcome =
  | { status: "transitioned"; record: SponsorshipRecord }
  | { status: "not_pending"; record: SponsorshipRecord }
  | { status: "not_found" };

/** Prisma accepts string filter objects at runtime, so types alone cannot protect this boundary. */
function assertPledgeRefString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError("pledgeRef must be a string");
  }
}

/**
 * Moves a commitment out of `PENDING_PAYMENT`, guarded on that source state.
 *
 * In Postgres this is a conditional UPDATE and the read-back of the row, in one
 * transaction — `tx` when the caller already holds one, its own otherwise — so a
 * caller is never told "still pending" about a row that has just flipped. Two
 * coordinators, or two serverless instances, racing on the same pledge produce
 * exactly one winner, and the loser is told what the row has become rather than
 * writing over it. Guarding on an in-process value instead would be no guard at
 * all: that value is empty on every other instance.
 *
 * The memory branch guards on the same status and projects the same columns onto
 * the record — `SponsorshipRecord` carries `status` and `receiptNumber`; the
 * timestamps and actor are Postgres-only — so the two modes cannot disagree about
 * a pledge that has already left the queue.
 *
 * Assert the runtime value before it reaches Prisma: its `where` input also accepts
 * filter objects, which are broader than the exact-reference semantics promised here.
 */
async function transitionPending(
  pledgeRef: string,
  data: PendingTransition,
  tx?: Prisma.TransactionClient
): Promise<TransitionOutcome> {
  assertPledgeRefString(pledgeRef);

  if (!isLedgerPersistent()) {
    const index = memorySponsorships.findIndex((row) => row.pledgeRef === pledgeRef);
    if (index < 0) return { status: "not_found" };

    const current = memorySponsorships[index];
    if (current.status !== "PENDING_PAYMENT") return { status: "not_pending", record: current };

    const record: SponsorshipRecord = {
      ...current,
      status: data.status,
      ...(data.receiptNumber !== undefined ? { receiptNumber: data.receiptNumber } : {}),
    };
    memorySponsorships[index] = record;
    return { status: "transitioned", record };
  }

  const db: Prisma.TransactionClient = tx ?? prisma;
  const [updated] = await db.petSponsorship.updateManyAndReturn({
    where: { pledgeRef, status: "PENDING_PAYMENT" },
    data,
  });

  if (updated) return { status: "transitioned", record: toRecord(updated) };

  const row = await db.petSponsorship.findUnique({ where: { pledgeRef } });
  if (!row) return { status: "not_found" };

  return { status: "not_pending", record: toRecord(row) };
}

/**
 * Attaches an already-issued receipt number and moves the commitment to `ACTIVE`.
 *
 * For a number issued elsewhere — the offline demo seed. A coordinator's
 * confirmation goes through `settleSponsorship`, which draws the number itself in
 * the same transaction as the transition, so a lost race can never leave a receipt
 * attached to nothing.
 */
export async function reconcileSponsorship(
  pledgeRef: string,
  receiptNumber: string,
  reconciledBy: string,
  options?: { now?: Date }
): Promise<ReconcileOutcome> {
  if (isLedgerPersistent()) {
    throw new Error(
      "reconcileSponsorship is an offline-only helper; persistent reconciliation must use settleSponsorship."
    );
  }

  const when = options?.now ?? new Date();

  const outcome = await transitionPending(pledgeRef, {
    status: "ACTIVE",
    receiptNumber,
    reconciledAt: when,
    reconciledBy,
  });

  if (outcome.status === "transitioned") return { status: "reconciled", record: outcome.record };
  if (outcome.status === "not_pending") return settledOutcome(outcome.record);
  return outcome;
}

export type SettleOutcome =
  | { status: "reconciled"; record: SponsorshipRecord; donation: DonationRecord }
  | Exclude<ReconcileOutcome, { status: "reconciled" }>;

/**
 * Confirms a pledge and issues its Section 44(6) receipt as one unit of work.
 *
 * Guard first, draw second, write third, all inside the transaction that draws the
 * serial. The conditional `PENDING_PAYMENT → ACTIVE` update takes the row lock; a
 * loser sees zero rows and has written nothing, so only the winner reaches the
 * receipt series, which is the same gapless monthly series every other receipt is
 * drawn from. Until 2026-09-14 the action issued first and guarded second, and a
 * lost race left a statutory document nobody could withdraw.
 *
 * The receipt draft is built from the row *after* the guard, so what is printed is
 * what was locked.
 */
export async function settleSponsorship(
  pledgeRef: string,
  issuer: StatutoryIssuerIdentity,
  reconciledBy: string,
  options?: { now?: Date }
): Promise<SettleOutcome> {
  const when = options?.now ?? new Date();

  if (!isLedgerPersistent()) {
    const index = memorySponsorships.findIndex((row) => row.pledgeRef === pledgeRef);
    if (index < 0) return { status: "not_found" };

    const current = memorySponsorships[index];
    if (current.status !== "PENDING_PAYMENT") return settledOutcome(current);

    // The guard, the draw and the write with no await between them. In a
    // single-threaded process that is the whole transaction, and it is why
    // `issueReceiptInMemory` is synchronous.
    const donation = issueReceiptInMemory(receiptDraftFor(current, issuer), when);
    const record: SponsorshipRecord = {
      ...current,
      status: "ACTIVE",
      receiptNumber: donation.receiptNumber,
    };
    memorySponsorships[index] = record;
    return { status: "reconciled", record, donation };
  }

  try {
    return await withReceiptTransaction(async (tx): Promise<SettleOutcome> => {
      const guard = await transitionPending(
        pledgeRef,
        { status: "ACTIVE", reconciledAt: when, reconciledBy },
        tx
      );
      if (guard.status === "not_found") return guard;
      if (guard.status === "not_pending") return settledOutcome(guard.record);

      const donation = await drawAndInsert(tx, receiptDraftFor(guard.record, issuer), when);
      const row = await tx.petSponsorship.update({
        where: { pledgeRef },
        data: { receiptNumber: donation.receiptNumber },
      });
      return { status: "reconciled", record: toRecord(row), donation };
    });
  } catch (err) {
    // The loser of a slow race waits on the winner's row lock, and can wait past
    // the transaction's own limit. It would then report an issuance failure for a
    // pledge the winner has just settled. Read the row once more before saying so.
    if (err instanceof ReceiptIssuanceError) {
      const now = await prisma.petSponsorship
        .findUnique({
          where: { pledgeRef },
          select: { receiptNumber: true, reconciledBy: true },
        })
        .catch(() => null);
      // A different actor's receipt proves this attempt lost a race. The same
      // actor could instead be observing its own commit after the acknowledgement
      // was lost, which is not enough evidence to report a confirmed outcome.
      // ceiling: an operation id stored with the row would distinguish same-actor
      // retries; add one if reconciliation must recover automatically after lost ACKs.
      if (now?.receiptNumber && now.reconciledBy !== reconciledBy) {
        return { status: "already_reconciled", receiptNumber: now.receiptNumber };
      }
    }
    throw err;
  }
}

/** The receipt a commitment earns, snapshotting what the pledge recorded. */
function receiptDraftFor(
  record: SponsorshipRecord,
  issuer: StatutoryIssuerIdentity
): DonationDraft {
  return {
    donorName: record.sponsorName,
    donorEmail: record.sponsorEmail,
    donorPhone: record.sponsorPhone,
    taxIdOrIc: record.taxIdOrIc,
    tierId: record.tierId as SponsorshipTierId,
    tierName: record.tierName,
    amountSen: record.amountSen,
    currency: "MYR",
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    targetPetName: record.petName,
    notes: record.notes,
    taxDeductibleRef: issuer.taxDeductibleRef,
    shelterRegistrationNo: issuer.shelterRegistrationNo,
  };
}

export type RejectOutcome =
  | { status: "rejected"; record: SponsorshipRecord }
  | Exclude<ReconcileOutcome, { status: "reconciled" }>;

export interface RejectSponsorshipCommand {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  reason: string | null;
  now?: Date;
}

function rejectionAuditEntry(
  record: SponsorshipRecord,
  command: RejectSponsorshipCommand
): AuditEntryInput {
  return {
    actorId: command.actorId,
    actorEmail: command.actorEmail,
    actorRole: command.actorRole,
    action: "SPONSORSHIP_REJECTED",
    entity: "PetSponsorship",
    entityId: record.pledgeRef,
    details: {
      pledgeRef: record.pledgeRef,
      reason: command.reason,
      petName: record.petName,
      sponsorEmail: record.sponsorEmail,
      amountSen: record.amountSen as number,
      amountDisplay: formatMYR(record.amountSen),
    },
  };
}

/**
 * A coordinator dismisses a claim that no transfer ever backed.
 *
 * `PENDING_PAYMENT → CANCELLED`, through the same guard as reconciliation, so a
 * pledge cannot be dismissed once its receipt exists, nor reconciled once it was
 * dismissed. `CANCELLED` rather than a new state: the schema's terminal states are
 * `CANCELLED` and `EXPIRED`, only `CANCELLED` has a timestamp column, and a dismissed
 * claim is told apart from a withdrawn commitment by `receiptNumber`, which a
 * dismissed one never had.
 *
 * Who dismissed it and why go to the audit log, not to `notes`: `notes` is the
 * supporter's own checkout text, and it is copied onto the receipt.
 */
export async function rejectPendingSponsorship(
  pledgeRef: string,
  command: RejectSponsorshipCommand
): Promise<RejectOutcome> {
  const when = command.now ?? new Date();

  if (!isLedgerPersistent()) {
    const outcome = await transitionPending(pledgeRef, {
      status: "CANCELLED",
      cancelledAt: when,
    });

    if (outcome.status === "transitioned") {
      recordAuditLog(rejectionAuditEntry(outcome.record, command));
      return { status: "rejected", record: outcome.record };
    }
    if (outcome.status === "not_pending") return settledOutcome(outcome.record);
    return outcome;
  }

  return prisma.$transaction(async (tx): Promise<RejectOutcome> => {
    const outcome = await transitionPending(
      pledgeRef,
      { status: "CANCELLED", cancelledAt: when },
      tx
    );

    if (outcome.status === "transitioned") {
      await persistAuditLog(tx, rejectionAuditEntry(outcome.record, command));
      return { status: "rejected", record: outcome.record };
    }
    if (outcome.status === "not_pending") return settledOutcome(outcome.record);
    return outcome;
  });
}

// ---------------------------------------------------------------------- reads

/** Care-cost target for one animal, falling back to the shelter-wide default. */
export async function resolveGoalSen(petId: string): Promise<Sen> {
  if (!isLedgerPersistent()) return DEFAULT_SPONSORSHIP_GOAL_SEN;

  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { sponsorshipGoalSen: true },
  });

  if (pet?.sponsorshipGoalSen && pet.sponsorshipGoalSen > 0) {
    return senFromInteger(pet.sponsorshipGoalSen);
  }

  const settings = await prisma.shelterSettings.findUnique({
    where: { id: "default-settings" },
    select: { defaultSponsorshipGoalSen: true },
  });

  return settings?.defaultSponsorshipGoalSen && settings.defaultSponsorshipGoalSen > 0
    ? senFromInteger(settings.defaultSponsorshipGoalSen)
    : DEFAULT_SPONSORSHIP_GOAL_SEN;
}

/** The public supporter count and funding total for one animal. */
export async function summarizeSponsorshipsForPet(
  petId: string
): Promise<PetSponsorshipSummary> {
  const goalSen = await resolveGoalSen(petId);

  if (!isLedgerPersistent()) {
    const rows: SponsorshipAggregateRow[] = memorySponsorships
      .filter((row) => row.petId === petId)
      .map((row) => ({
        sponsorEmail: row.sponsorEmail,
        amountSen: row.amountSen,
        status: row.status,
      }));
    return summarizePetSponsorships(petId, rows, goalSen);
  }

  // Only ACTIVE rows are read: a pending claim is not funding, and filtering in
  // the query keeps an unbounded pile of stale pledges off the wire.
  const rows = await prisma.petSponsorship.findMany({
    where: { petId, status: "ACTIVE" },
    select: { sponsorEmail: true, amountSen: true, status: true },
  });

  return summarizePetSponsorships(
    petId,
    rows.map((row) => ({
      sponsorEmail: row.sponsorEmail,
      amountSen: senFromInteger(row.amountSen),
      status: row.status as SponsorshipStatus,
    })),
    goalSen
  );
}

/**
 * Live commitments to one animal, for contacting the people behind them.
 *
 * `summarizeSponsorshipsForPet` answers "how much has been raised" and selects
 * only the columns that question needs. This answers "who should hear about this
 * animal", so it returns whole records — and it is a separate query rather than a
 * widening of that one, because a funding total has no business carrying donor
 * contact details around with it.
 *
 * ACTIVE only: a pledge that has not been reconciled is somebody claiming to have
 * paid, not a supporter. `take` bounds the read, since a popular animal should
 * not drag an unbounded list into memory to produce a capped mailing.
 */
export async function listActiveSponsorshipsForPet(
  petId: string,
  take = 500
): Promise<SponsorshipRecord[]> {
  if (!isLedgerPersistent()) {
    return memorySponsorships.filter(
      (row) => row.petId === petId && row.status === "ACTIVE"
    );
  }

  const rows = await prisma.petSponsorship.findMany({
    where: { petId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take,
  });

  return rows.map(toRecord);
}

/**
 * Every commitment still awaiting a coordinator's confirmation, oldest first.
 *
 * Oldest first, deliberately: this is a work queue, and the supporter who has been
 * waiting longest for their receipt is the one who should be settled next. Every
 * other list in this module is newest-first because those are activity feeds.
 *
 * A read failure propagates rather than returning `[]`. The same asymmetry
 * `donationLedger.listDonationsOrThrow` documents applies with more force here: an
 * empty queue is a *claim* that every supporter has been paid out, and a coordinator
 * who believes it stops looking. Being told the read failed is strictly better.
 */
export async function listPendingSponsorships(take = 200): Promise<SponsorshipRecord[]> {
  if (!isLedgerPersistent()) {
    return (
      memorySponsorships
        .filter((row) => row.status === "PENDING_PAYMENT")
        // The same order the Postgres branch asks for, and the `id` tiebreak is
        // what makes it total. `memorySponsorships` is newest-first because
        // `recordSponsorshipPledge` prepends, and two pledges recorded in the same
        // millisecond compare equal on `createdAt`, so a stable sort on that alone
        // kept the array's order and the queue came out backwards — a unit test
        // recording three pledges in a loop hit it every time. Memory ids are
        // zero-padded serials, so here the tiebreak is exactly insertion order.
        .sort(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
        )
        .slice(0, take)
        // The same shape as the Postgres branch, whose `select` leaves the tax
        // identifier out. A copy, never a delete: the stored pledge still needs it
        // for the receipt `settleSponsorship` prints.
        .map((row) => ({ ...row, taxIdOrIc: undefined }))
    );
  }

  // ceiling: `id` is a cuid, so the tiebreak is deterministic but only roughly
  // insertion order across processes. Give PetSponsorship a monotonic sequence if
  // the shelter ever needs the queue exact within a millisecond.
  //
  // An explicit projection, because this is the one read that handles every pending
  // supporter at once and `taxIdOrIc` is an NRIC nothing downstream of it wants.
  // `listPendingSponsorshipsAction` drops it from its DTO, but dropping it there
  // still pulls it out of Postgres into server memory, where a query log or an
  // error dump can carry it. An allow-list rather than `omit`, so a sensitive column
  // added to the table later stays unread here until someone selects it on purpose.
  const rows = await prisma.petSponsorship.findMany({
    where: { status: "PENDING_PAYMENT" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      petId: true,
      petName: true,
      sponsorName: true,
      sponsorEmail: true,
      sponsorPhone: true,
      userId: true,
      displayOnWall: true,
      tierId: true,
      tierName: true,
      frequency: true,
      amountSen: true,
      paymentMethod: true,
      status: true,
      pledgeRef: true,
      receiptNumber: true,
      notes: true,
      createdAt: true,
    },
  });

  return rows.map(toRecord);
}

/** Looks a commitment up by the reference the supporter was given. */
export async function findSponsorshipByPledgeRef(
  pledgeRef: string
): Promise<SponsorshipRecord | null> {
  if (!isLedgerPersistent()) {
    return memorySponsorships.find((row) => row.pledgeRef === pledgeRef) ?? null;
  }

  const row = await prisma.petSponsorship.findUnique({ where: { pledgeRef } });
  return row ? toRecord(row) : null;
}

// ------------------------------------------------------- supporter-account reads
//
// The sponsor portal needs to see a supporter's own commitments. These live here
// rather than in `sponsorRepository.ts` because this module owns `pet_sponsorships`;
// a second module querying the same table is how two sources of truth start.

/** Every commitment claimed by a supporter account. */
export async function listSponsorshipsByUserId(
  userId: string
): Promise<SponsorshipRecord[]> {
  if (!isLedgerPersistent()) {
    return memorySponsorships.filter((row) => row.userId === userId);
  }

  const rows = await prisma.petSponsorship.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRecord);
}

/** Every commitment made under an email address, claimed or not. */
export async function listSponsorshipsByEmail(
  sponsorEmail: string
): Promise<SponsorshipRecord[]> {
  const normalised = sponsorEmail.trim().toLowerCase();

  if (!isLedgerPersistent()) {
    return memorySponsorships.filter(
      (row) => row.sponsorEmail.toLowerCase() === normalised
    );
  }

  const rows = await prisma.petSponsorship.findMany({
    where: { sponsorEmail: normalised },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRecord);
}

/**
 * Attaches every unclaimed commitment made under `sponsorEmail` to a supporter account.
 *
 * Guarded on `userId: null`, so a second claim cannot move a commitment that already
 * belongs to someone. Returns how many moved.
 */
export async function claimSponsorshipsForUser(
  userId: string,
  sponsorEmail: string
): Promise<number> {
  const normalised = sponsorEmail.trim().toLowerCase();

  if (!isLedgerPersistent()) {
    let claimed = 0;
    memorySponsorships = memorySponsorships.map((row) => {
      if (row.sponsorEmail.toLowerCase() === normalised && !row.userId) {
        claimed += 1;
        return { ...row, userId };
      }
      return row;
    });
    return claimed;
  }

  const { count } = await prisma.petSponsorship.updateMany({
    where: { sponsorEmail: normalised, userId: null },
    data: { userId },
  });
  return count;
}

/**
 * Cancels a supporter's own recurring commitment.
 *
 * Scoped to `userId` as well as `pledgeRef`, so a reference in a request cannot reach
 * another supporter's row, and guarded on `ACTIVE` so a cancelled commitment is not
 * cancelled twice.
 */
export async function cancelSponsorshipForUser(
  userId: string,
  pledgeRef: string,
  options?: { now?: Date }
): Promise<SponsorshipRecord | null> {
  assertPledgeRefString(pledgeRef);
  const when = options?.now ?? new Date();

  if (!isLedgerPersistent()) {
    const index = memorySponsorships.findIndex(
      (row) =>
        row.pledgeRef === pledgeRef && row.userId === userId && row.status === "ACTIVE"
    );
    if (index < 0) return null;
    const record: SponsorshipRecord = {
      ...memorySponsorships[index],
      status: "CANCELLED",
    };
    memorySponsorships[index] = record;
    return record;
  }

  const { count } = await prisma.petSponsorship.updateMany({
    where: { pledgeRef, userId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: when },
  });
  if (count === 0) return null;

  const row = await prisma.petSponsorship.findUnique({ where: { pledgeRef } });
  return row ? toRecord(row) : null;
}

// ---------------------------------------------------------------------- shape

interface SponsorshipRow {
  id: string;
  petId: string | null;
  petName: string;
  sponsorName: string;
  sponsorEmail: string;
  sponsorPhone: string | null;
  userId: string | null;
  displayOnWall: boolean;
  tierId: string;
  tierName: string;
  frequency: string;
  amountSen: number;
  paymentMethod: string;
  status: string;
  pledgeRef: string;
  receiptNumber: string | null;
  /**
   * Optional so a read may leave it out of its `select`, as the coordinator queue
   * does — see `listPendingSponsorships`. The receipt path must not: `settleSponsorship`
   * copies it onto the statutory receipt from the row it locks.
   */
  taxIdOrIc?: string | null;
  notes: string | null;
  createdAt: Date;
}

function toRecord(row: SponsorshipRow): SponsorshipRecord {
  return {
    id: row.id,
    petId: row.petId,
    petName: row.petName,
    sponsorName: row.sponsorName,
    sponsorEmail: row.sponsorEmail,
    sponsorPhone: row.sponsorPhone ?? undefined,
    userId: row.userId,
    displayOnWall: row.displayOnWall,
    tierId: row.tierId,
    tierName: row.tierName,
    frequency: row.frequency === "monthly" ? "monthly" : "one_time",
    amountSen: senFromInteger(row.amountSen),
    paymentMethod: row.paymentMethod as SponsorshipRecord["paymentMethod"],
    status: row.status as SponsorshipStatus,
    pledgeRef: row.pledgeRef,
    receiptNumber: row.receiptNumber,
    createdAt: row.createdAt.toISOString(),
    taxIdOrIc: row.taxIdOrIc ?? undefined,
    notes: row.notes ?? undefined,
  };
}
