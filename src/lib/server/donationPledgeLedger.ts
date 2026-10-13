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
import { generateGiftRef, type DonationPledgeStatus } from "@/lib/domain/donationPledge";

/**
 * Repository for general gifts awaiting reconciliation.
 *
 * ## What this table is for
 *
 * A supporter fills in the public donation form, is shown a DuitNow QR or the
 * shelter's bank details, and tells us they paid. That is all the application
 * knows. Until 2026-09-22 `submitDonationPledgeAction` treated it as proof and
 * allocated an official `HFS-DON-*` Section 44(6) receipt on the spot, so a public
 * form minted tax documents for money nobody had counted. This module holds the
 * gift in `PENDING_PAYMENT` until a coordinator matches the transfer, and the
 * receipt is drawn at that boundary and nowhere else.
 *
 * ## Why the gift is not a pending `Donation`
 *
 * `Donation` is an issued receipt: append-only, and production enforces that below
 * the ORM with `donations_no_mutation` (`prisma/sql/donation_append_only.sql`,
 * applied 2026-09-21). A pending row written there could never be updated to carry
 * its receipt number — the trigger refuses every UPDATE — so the design would fail
 * in production and pass everywhere else. `PetSponsorship` made the same call for
 * the same reason, and this module is deliberately its twin.
 *
 * The happy consequence: the statutory export reads `donations`, so an
 * unreconciled gift is invisible to an LHDN return by construction. No reader has
 * a filter to forget.
 *
 * ## Two declared modes, not a try/catch fallback
 *
 * The contract `donationLedger.ts` documents, with `isLedgerPersistent()` imported
 * from it rather than re-derived so the three ledgers cannot disagree about which
 * mode the process is in. `DATABASE_URL` set means Postgres is authoritative and an
 * unconfirmed write propagates; unset means the in-memory ledger is, which is the
 * documented offline mode the project tests in.
 */

/** A gift as recorded, and — once reconciled — the receipt it earned. */
export interface DonationPledgeRecord {
  id: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  taxIdOrIc?: string;
  tierId: SponsorshipTierId;
  tierName: string;
  amountSen: Sen;
  currency: string;
  frequency: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  status: DonationPledgeStatus;
  targetPetName?: string;
  notes?: string;
  pledgeRef: string;
  receiptNumber?: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Everything a caller supplies. The ledger owns id, status, receipt and timestamp. */
export type DonationPledgeDraft = Omit<
  DonationPledgeRecord,
  "id" | "status" | "receiptNumber" | "createdAt"
>;

export class DonationPledgeWriteError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DonationPledgeWriteError";
    this.cause = cause;
  }
}

// ---------------------------------------------------------------- memory mode

let memoryPledges: DonationPledgeRecord[] = [];
let memorySerial = 0;

/**
 * Clears the in-memory ledger. Test-only, and wired into the global `beforeEach`
 * in `tests/setup/nextMocks.ts` alongside the donation and sponsorship ledgers, so
 * pledge references and queue order do not leak between suites.
 */
export function resetDonationPledgeLedger(): void {
  memoryPledges = [];
  memorySerial = 0;
}

/** Diagnostic read of the in-memory ledger. */
export function memoryDonationPledgeCount(): number {
  return memoryPledges.length;
}

// --------------------------------------------------------------------- writes

interface PledgeRow {
  id: string;
  donorName: string;
  donorEmail: string;
  donorPhone: string | null;
  taxIdOrIc?: string | null;
  tierId: string;
  tierName: string;
  amountSen: number;
  currency: string;
  frequency: string;
  paymentMethod: string;
  status: string;
  targetPetName: string | null;
  notes: string | null;
  pledgeRef: string;
  receiptNumber: string | null;
  createdAt: Date;
}

function toRecord(row: PledgeRow): DonationPledgeRecord {
  return {
    id: row.id,
    donorName: row.donorName,
    donorEmail: row.donorEmail,
    donorPhone: row.donorPhone ?? undefined,
    taxIdOrIc: row.taxIdOrIc ?? undefined,
    tierId: row.tierId as SponsorshipTierId,
    tierName: row.tierName,
    amountSen: senFromInteger(row.amountSen),
    currency: row.currency,
    frequency: row.frequency as DonationPledgeRecord["frequency"],
    paymentMethod: row.paymentMethod as DonationPledgeRecord["paymentMethod"],
    status: row.status as DonationPledgeStatus,
    targetPetName: row.targetPetName ?? undefined,
    notes: row.notes ?? undefined,
    pledgeRef: row.pledgeRef,
    receiptNumber: row.receiptNumber,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Records a gift as `PENDING_PAYMENT`.
 *
 * Nothing here has verified that money moved, which is why this allocates a
 * pledge reference and never a receipt number. That sentence is the whole point
 * of the module; if a future change makes it untrue, the defect this table was
 * built to fix is back.
 */
export async function recordDonationPledge(
  draft: DonationPledgeDraft,
  options?: { now?: Date }
): Promise<DonationPledgeRecord> {
  const when = options?.now ?? new Date();

  if (!isLedgerPersistent()) {
    memorySerial += 1;
    const record: DonationPledgeRecord = {
      ...draft,
      id: `mem-gift-${String(memorySerial).padStart(6, "0")}`,
      status: "PENDING_PAYMENT",
      receiptNumber: null,
      createdAt: when.toISOString(),
    };
    memoryPledges = [record, ...memoryPledges];
    return record;
  }

  try {
    return toRecord(await createPledgeRow(draft, draft.pledgeRef, when));
  } catch (err) {
    // A reference collision is the one failure here that is not a failure. The
    // series is a 6-digit random scoped to a UTC day, so two gifts on a busy day
    // can draw the same number: ~200 gifts gives roughly a 2% chance per day.
    // Reported as an unconfirmed write, that costs a real donor their submission
    // *and* tells them not to retry. A fresh reference and one retry fixes it,
    // and a second collision is not a coincidence, so it propagates.
    if (isPledgeRefCollision(err)) {
      try {
        return toRecord(await createPledgeRow(draft, generateGiftRef(when), when));
      } catch (retryErr) {
        throw new DonationPledgeWriteError(
          "Could not record the donation pledge after a reference collision",
          retryErr
        );
      }
    }
    // Everything else is genuinely a failure. Unlike `recordSponsorshipPledge`
    // there is no foreign-key recovery to attempt: this table has no relations.
    throw new DonationPledgeWriteError("Could not record the donation pledge", err);
  }
}

/**
 * The columns a unique violation names, or `[]` when the error does not say.
 *
 * Read from where this client actually puts them. On Prisma 7 with
 * `@prisma/adapter-pg` a P2002 carries **no** `meta.target`: the runtime builds
 * the error as `{ driverAdapterError }`, and the adapter parses the columns out of
 * Postgres's own `Key ("pledgeRef")=(...) already exists` detail into
 * `driverAdapterError.cause.constraint.fields`. Measured by reading
 * `node_modules/@prisma/client/runtime/client.js` and
 * `node_modules/@prisma/adapter-pg/dist/index.js` on 2026-10-13, after a review
 * found the earlier version of this guard discriminating on a key that is never
 * set — its column test was dead code, and its test passed on a fabricated shape.
 *
 * `meta.target` is still read, as an array or as an index name, because that is
 * what the query-engine clients before the driver adapters emitted and what a
 * future one may emit again. Postgres quotes a mixed-case identifier in the
 * detail line, so a field can arrive as `"pledgeRef"` with the quotes on; callers
 * match by substring for that reason.
 */
function uniqueViolationColumns(meta: unknown): string[] {
  if (typeof meta !== "object" || meta === null) return [];
  const { target, driverAdapterError } = meta as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
  };

  const fromAdapter = driverAdapterError?.cause?.constraint?.fields;
  const raw = Array.isArray(fromAdapter)
    ? fromAdapter
    : Array.isArray(target)
      ? target
      : typeof target === "string"
        ? [target]
        : [];
  return raw.filter((c): c is string => typeof c === "string");
}

/**
 * True when a failed `donationPledge.create` should be retried with a fresh
 * reference.
 *
 * Two rules, in this order:
 *
 * 1. **The error names its columns** — retry only if one of them is `pledgeRef`.
 *    The table's other unique is `receiptNumber`, and retrying *that* with a new
 *    reference would write a second row for money that already has a receipt.
 * 2. **The error names nothing** — retry. `createPledgeRow` never sets
 *    `receiptNumber`, so it inserts NULL, and Postgres unique indexes do not
 *    collide on NULL: a P2002 from that one statement can only be the reference.
 *    Refusing here would put back the silent hole this predicate exists to close,
 *    on the one path no local test tier reaches.
 *
 * Rule 2 is only safe while rule 2's premise holds. **If this insert ever gains a
 * `receiptNumber`, or the table a third unique, rule 2 must go** — an unnamed
 * violation could then be any of them.
 *
 * Not gated on `meta.modelName`, unlike `isUniqueViolation` in `donationLedger.ts`,
 * which guards a retry around a transaction writing several tables. Here the
 * call site is the discriminator: this wraps one `create` and nothing else.
 */
function isPledgeRefCollision(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: unknown };
  if (code !== "P2002") return false;

  const columns = uniqueViolationColumns(meta);
  if (columns.length === 0) return true;
  return columns.some((c) => c.includes("pledgeRef"));
}

/** The insert itself, so the collision retry can re-run it with a new reference. */
async function createPledgeRow(
  draft: DonationPledgeDraft,
  pledgeRef: string,
  when: Date
) {
  return prisma.donationPledge.create({
      data: {
        donorName: draft.donorName,
        donorEmail: draft.donorEmail,
        donorPhone: draft.donorPhone ?? null,
        taxIdOrIc: draft.taxIdOrIc ?? null,
        tierId: draft.tierId,
        tierName: draft.tierName,
        amountSen: draft.amountSen as number,
        currency: draft.currency,
        frequency: draft.frequency,
        paymentMethod: draft.paymentMethod,
        status: "PENDING_PAYMENT",
        targetPetName: draft.targetPetName ?? null,
        notes: draft.notes ?? null,
        pledgeRef,
        createdAt: when,
      },
    });
}

// --------------------------------------------------------------- transitions

export type SettleGiftOutcome =
  | { status: "reconciled"; record: DonationPledgeRecord; donation: DonationRecord }
  | { status: "already_reconciled"; receiptNumber: string }
  /** The row exists but left `PENDING_PAYMENT` without a receipt: dismissed. */
  | { status: "not_pending"; currentStatus: DonationPledgeStatus }
  | { status: "not_found" };

/** What a caller is told about a row that has already left `PENDING_PAYMENT`. */
function settledOutcome(
  record: DonationPledgeRecord
): Extract<SettleGiftOutcome, { status: "already_reconciled" | "not_pending" }> {
  // The receipt is the discriminator, not the status: what a coordinator needs to
  // be told about a row they cannot settle is the number that already exists.
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
  | { status: "transitioned"; record: DonationPledgeRecord }
  | { status: "not_pending"; record: DonationPledgeRecord }
  | { status: "not_found" };

/**
 * Prisma accepts string filter objects at runtime, so types alone cannot protect
 * this boundary — `{ not: "" }` as a `pledgeRef` would match every row rather than
 * one. Server Action arguments arrive deserialised and unchecked, so the runtime
 * value is asserted before it reaches a `where`.
 */
function assertGiftRefString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError("pledgeRef must be a string");
  }
}

/**
 * Moves a gift out of `PENDING_PAYMENT`, guarded on that source state.
 *
 * In Postgres this is a conditional UPDATE and the read-back, in one transaction —
 * `tx` when the caller already holds one, its own otherwise — so a caller is never
 * told "still pending" about a row that has just flipped. Two coordinators, or two
 * serverless instances, racing on the same gift produce exactly one winner, and the
 * loser is told what the row has become rather than writing over it. Guarding on an
 * in-process value instead would be no guard at all: that value is empty on every
 * other instance.
 *
 * The memory branch guards on the same status and projects the same columns, so the
 * two modes cannot disagree about a gift that has already left the queue.
 */
async function transitionPending(
  pledgeRef: string,
  data: PendingTransition,
  tx?: Prisma.TransactionClient
): Promise<TransitionOutcome> {
  assertGiftRefString(pledgeRef);

  if (!isLedgerPersistent()) {
    const index = memoryPledges.findIndex((row) => row.pledgeRef === pledgeRef);
    if (index < 0) return { status: "not_found" };

    const current = memoryPledges[index];
    if (current.status !== "PENDING_PAYMENT") return { status: "not_pending", record: current };

    const record: DonationPledgeRecord = {
      ...current,
      status: data.status,
      ...(data.receiptNumber !== undefined ? { receiptNumber: data.receiptNumber } : {}),
    };
    memoryPledges[index] = record;
    return { status: "transitioned", record };
  }

  const db: Prisma.TransactionClient = tx ?? prisma;
  const [updated] = await db.donationPledge.updateManyAndReturn({
    where: { pledgeRef, status: "PENDING_PAYMENT" },
    data,
  });

  if (updated) return { status: "transitioned", record: toRecord(updated) };

  const row = await db.donationPledge.findUnique({ where: { pledgeRef } });
  if (!row) return { status: "not_found" };

  return { status: "not_pending", record: toRecord(row) };
}

/** The receipt a gift earns, snapshotting what the donor supplied at checkout. */
function receiptDraftFor(
  record: DonationPledgeRecord,
  issuer: StatutoryIssuerIdentity
): DonationDraft {
  return {
    donorName: record.donorName,
    donorEmail: record.donorEmail,
    donorPhone: record.donorPhone,
    taxIdOrIc: record.taxIdOrIc,
    tierId: record.tierId,
    tierName: record.tierName,
    amountSen: record.amountSen,
    currency: record.currency,
    frequency: record.frequency,
    paymentMethod: record.paymentMethod,
    targetPetName: record.targetPetName,
    notes: record.notes,
    taxDeductibleRef: issuer.taxDeductibleRef,
    shelterRegistrationNo: issuer.shelterRegistrationNo,
  };
}

/**
 * Confirms a gift and issues its Section 44(6) receipt as one unit of work.
 *
 * Guard first, draw second, write third, all inside the transaction that draws the
 * serial — the ordering `settleSponsorship` arrived at on 2026-09-14 after the
 * reverse order left a statutory document attached to nothing. The conditional
 * `PENDING_PAYMENT → ACTIVE` update takes the row lock; a loser sees zero rows and
 * has written nothing, so only the winner reaches the receipt series, which is the
 * same gapless monthly series every other receipt is drawn from.
 *
 * The receipt draft is built from the row *after* the guard, so what is printed is
 * what was locked.
 *
 * **This is the only path in the application that turns a general gift into a
 * receipt.** `recordDonationPledge` deliberately has no way to do it.
 *
 * ## The receipt is dated when it is issued, not when the gift was made
 *
 * `when` defaults to now, so `issuedAt` and the month the serial is drawn from
 * both follow the confirmation rather than the transfer. A gift sent on 30
 * December and matched on 2 January is receipted in January, and a donor cannot
 * file it against the year they actually paid. `settleSponsorship` has behaved
 * this way since 2026-09-14 and this is deliberately its twin.
 *
 * Back-dating to `DonationPledge.createdAt` would be worse, not better: the
 * serial is gapless *per month*, so writing a January confirmation into
 * December's series would grow a month that has already been filed. A correct
 * fix needs the value date from the bank statement and a policy for receipts
 * that cross a tax year — a decision for the shelter, not a default for this
 * function to pick.
 *
 * ceiling: receipts are dated at confirmation. If year-end gifts must carry the
 * transfer date, take the value date as an argument here and decide what the
 * series does across a year boundary before changing anything.
 */
export async function settleDonationPledge(
  pledgeRef: string,
  issuer: StatutoryIssuerIdentity,
  reconciledBy: string,
  options?: { now?: Date }
): Promise<SettleGiftOutcome> {
  const when = options?.now ?? new Date();

  // Above the mode branch, not inside it. `transitionPending` asserts too, but on
  // the Postgres path it runs *inside* `withReceiptTransaction`, whose catch-all
  // turns every non-unique-violation into `ReceiptIssuanceError` — so a
  // programming error would reach the coordinator as "we could not confirm
  // whether reconciliation completed", an outage message for a bad argument, and
  // the two storage modes would disagree about the type of the failure.
  assertGiftRefString(pledgeRef);

  if (!isLedgerPersistent()) {
    const index = memoryPledges.findIndex((row) => row.pledgeRef === pledgeRef);
    if (index < 0) return { status: "not_found" };

    const current = memoryPledges[index];
    if (current.status !== "PENDING_PAYMENT") return settledOutcome(current);

    // The guard, the draw and the write with no await between them. In a
    // single-threaded process that is the whole transaction, and it is why
    // `issueReceiptInMemory` is synchronous.
    const donation = issueReceiptInMemory(receiptDraftFor(current, issuer), when);
    const record: DonationPledgeRecord = {
      ...current,
      status: "ACTIVE",
      receiptNumber: donation.receiptNumber,
    };
    memoryPledges[index] = record;
    return { status: "reconciled", record, donation };
  }

  try {
    return await withReceiptTransaction(async (tx): Promise<SettleGiftOutcome> => {
      const guard = await transitionPending(
        pledgeRef,
        { status: "ACTIVE", reconciledAt: when, reconciledBy },
        tx
      );
      if (guard.status === "not_found") return guard;
      if (guard.status === "not_pending") return settledOutcome(guard.record);

      const donation = await drawAndInsert(tx, receiptDraftFor(guard.record, issuer), when);
      const row = await tx.donationPledge.update({
        where: { pledgeRef },
        data: { receiptNumber: donation.receiptNumber },
      });
      return { status: "reconciled", record: toRecord(row), donation };
    });
  } catch (err) {
    // The loser of a slow race waits on the winner's row lock, and can wait past
    // the transaction's own limit. It would then report an issuance failure for a
    // gift the winner has just settled. Read the row once more before saying so.
    if (err instanceof ReceiptIssuanceError) {
      const now = await prisma.donationPledge
        .findUnique({
          where: { pledgeRef },
          select: { receiptNumber: true, reconciledBy: true },
        })
        .catch(() => null);
      // A different actor's receipt proves this attempt lost a race. The same actor
      // could instead be observing its own commit after the acknowledgement was
      // lost, which is not enough evidence to report a confirmed outcome — so that
      // case still surfaces as uncertainty, and the coordinator reloads the queue.
      // ceiling: an operation id stored with the row would distinguish same-actor
      // retries. `settleSponsorship` carries the identical ceiling; close both
      // together if reconciliation must ever recover automatically after a lost ACK.
      if (now?.receiptNumber && now.reconciledBy !== reconciledBy) {
        return { status: "already_reconciled", receiptNumber: now.receiptNumber };
      }
    }
    throw err;
  }
}

export type RejectGiftOutcome =
  | { status: "rejected"; record: DonationPledgeRecord }
  | Exclude<SettleGiftOutcome, { status: "reconciled" }>;

export interface RejectDonationPledgeCommand {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  reason: string | null;
  now?: Date;
}

function rejectionAuditEntry(
  record: DonationPledgeRecord,
  command: RejectDonationPledgeCommand
): AuditEntryInput {
  return {
    actorId: command.actorId,
    actorEmail: command.actorEmail,
    actorRole: command.actorRole,
    action: "DONATION_PLEDGE_REJECTED",
    entity: "DonationPledge",
    entityId: record.pledgeRef,
    details: {
      pledgeRef: record.pledgeRef,
      reason: command.reason,
      donorEmail: record.donorEmail,
      amountSen: record.amountSen as number,
      amountDisplay: formatMYR(record.amountSen),
    },
  };
}

/**
 * A coordinator dismisses a gift that no transfer ever backed.
 *
 * `PENDING_PAYMENT → CANCELLED`, through the same guard as reconciliation, so a
 * gift cannot be dismissed once its receipt exists, nor reconciled once it was
 * dismissed. Nothing is issued and nothing is emailed: a dismissed claim is not a
 * gift and earns no receipt.
 *
 * Who dismissed it and why go to the audit log, not to `notes`: `notes` is the
 * donor's own checkout text, and it is copied onto the receipt. The transition and
 * its audit row share a transaction, so the queue cannot lose the record of why a
 * gift left it.
 *
 * The audit row carries no `receiptNumber` key, deliberately. `useAuditLogController`
 * and `exportCsv` both classify any entry whose details contain one as a donation
 * receipt, and a dismissed gift appearing in the LHDN CSV fallback would be the
 * original defect wearing a different hat.
 */
export async function rejectPendingDonationPledge(
  pledgeRef: string,
  command: RejectDonationPledgeCommand
): Promise<RejectGiftOutcome> {
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

  return prisma.$transaction(async (tx): Promise<RejectGiftOutcome> => {
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

/**
 * Every gift still awaiting a coordinator's confirmation, oldest first.
 *
 * Oldest first, deliberately: this is a work queue, and the donor who has been
 * waiting longest for their receipt is the one to settle next.
 *
 * A read failure propagates rather than returning `[]`, the asymmetry
 * `donationLedger.listDonationsOrThrow` documents. An empty queue is a *claim* that
 * every donor has been settled, and a coordinator who believes it stops looking.
 */
export async function listPendingDonationPledges(
  take = 200
): Promise<DonationPledgeRecord[]> {
  if (!isLedgerPersistent()) {
    return (
      memoryPledges
        .filter((row) => row.status === "PENDING_PAYMENT")
        // The same total order the Postgres branch asks for. `memoryPledges` is
        // newest-first because `recordDonationPledge` prepends, and two gifts
        // recorded in the same millisecond compare equal on `createdAt`, so a
        // stable sort on that alone would keep the array's order and hand back the
        // queue backwards. Memory ids are zero-padded serials, so the `id` tiebreak
        // here is exactly insertion order.
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .slice(0, take)
        // The same shape as the Postgres branch, whose `select` leaves the tax
        // identifier out. A copy, never a delete: the stored pledge still needs it
        // for the receipt `settleDonationPledge` prints.
        .map((row) => ({ ...row, taxIdOrIc: undefined }))
    );
  }

  // An explicit projection, for the reason `listPendingSponsorships` gives: this is
  // the one read that handles every pending donor at once, and `taxIdOrIc` is an
  // NRIC that confirming a bank transfer does not need. Dropping it from the DTO
  // alone would still pull it into server memory, where a query log or an error
  // dump can carry it. An allow-list rather than `omit`, so a sensitive column
  // added to the table later stays unread here until someone selects it on purpose.
  const rows = await prisma.donationPledge.findMany({
    where: { status: "PENDING_PAYMENT" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      donorName: true,
      donorEmail: true,
      donorPhone: true,
      tierId: true,
      tierName: true,
      amountSen: true,
      currency: true,
      frequency: true,
      paymentMethod: true,
      status: true,
      targetPetName: true,
      notes: true,
      pledgeRef: true,
      receiptNumber: true,
      createdAt: true,
    },
  });

  return rows.map(toRecord);
}

/** Looks a gift up by the reference the donor was given. */
export async function findDonationPledgeByRef(
  pledgeRef: string
): Promise<DonationPledgeRecord | null> {
  assertGiftRefString(pledgeRef);

  if (!isLedgerPersistent()) {
    return memoryPledges.find((row) => row.pledgeRef === pledgeRef) ?? null;
  }

  const row = await prisma.donationPledge.findUnique({ where: { pledgeRef } });
  return row ? toRecord(row) : null;
}
