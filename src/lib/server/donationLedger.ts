import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { Sen, senFromInteger } from "@/lib/domain/money";
import type { SponsorshipTierId } from "@/types/sponsorship";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Persistence for issued LHDN tax receipts.
 *
 * ## Why this is not a dual-layer repository
 *
 * `src/lib/server/` wraps every Prisma call in try/catch and falls back to the JSON
 * fixtures in `src/data/`. That is the right design for **reference data** — pets,
 * FAQs, rehab needs — because such data has an authoritative committed fixture, so
 * serving it from memory is degraded but truthful.
 *
 * A donation is not reference data. It is a record that an external event occurred:
 * money moved. There cannot be a fixture for an event that has not happened yet, so
 * "fall back to the fixture" has no meaning here, and swallowing a failed write
 * would hand a donor an official, tax-deductible receipt number for a record that
 * exists nowhere durable. That is the failure this module refuses to have.
 *
 * The fallback is therefore replaced by an explicitly **declared mode**, chosen by
 * configuration rather than by whether an error happened to be thrown:
 *
 * - `DATABASE_URL` set — Postgres is authoritative. A failed write propagates, the
 *   Server Action reports failure, and no receipt is issued. Losing a donation
 *   record silently is strictly worse than telling the donor to retry.
 * - `DATABASE_URL` unset — the in-memory ledger is authoritative. This is the
 *   documented offline mode the whole project runs and tests in, and it stays fully
 *   functional: numbering is still gapless, just per-process.
 *
 * The distinction matters because those two situations are not the same event. A
 * missing `DATABASE_URL` is a deliberate configuration. A configured database that
 * rejects a write is a fault, and faults on statutory records must be loud.
 *
 * ## Append-only
 *
 * There is no update or delete export, by design. See the `Donation` model comment
 * in `prisma/schema.prisma`; corrections are issued as new offsetting records.
 */

/** A receipt as issued and persisted. Amounts are exact integer sen. */
export interface DonationRecord {
  id: string;
  receiptNumber: string;
  sequenceScope: string;
  sequenceValue: number;
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
  targetPetName?: string;
  notes?: string;
  taxDeductibleRef: string;
  shelterRegistrationNo: string;
  /** ISO-8601 instant. Always UTC; render in Asia/Kuala_Lumpur at the edges. */
  issuedAt: string;
}

/** Everything a caller supplies. The ledger owns id, numbering, and timestamp. */
export type DonationDraft = Omit<
  DonationRecord,
  "id" | "receiptNumber" | "sequenceScope" | "sequenceValue" | "issuedAt"
>;

export class ReceiptIssuanceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ReceiptIssuanceError";
    this.cause = cause;
  }
}

const RECEIPT_PREFIX = "HFS-DON";

/** Minimum width of the serial. Wider numbers are allowed; see `formatReceiptNumber`. */
const SERIAL_WIDTH = 4;

/**
 * True when a real database is configured. Mirrors the offline detection already
 * used by `src/lib/prisma.ts`, so the two cannot disagree about which mode we are in.
 */
export function isLedgerPersistent(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The numbering scope a receipt issued at `when` belongs to, e.g. "HFS-DON-202608".
 *
 * Computed in **Asia/Kuala_Lumpur**, not UTC. Which month a receipt falls in is a
 * local-calendar question with tax consequences, and `toISOString().slice(0, 7)`
 * gets it wrong for eight hours of every day: a donation at 07:00 MYT on 1 September
 * is 23:00 UTC on 31 August, and would be filed into the previous month's series.
 */
export function receiptScopeFor(when: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(when);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${RECEIPT_PREFIX}-${year}${month}`;
}

/**
 * Renders a scope and serial as a receipt number.
 *
 * Pads to four digits but does **not** truncate past them: a shelter that issues
 * more than 9,999 receipts in one month gets a wider number rather than a wrapped
 * one. A wrap would mint a duplicate receipt number, which is the single worst
 * thing this module could do.
 */
export function formatReceiptNumber(scope: string, serial: number): string {
  return `${scope}-${String(serial).padStart(SERIAL_WIDTH, "0")}`;
}

// ---------------------------------------------------------------------------
// In-memory ledger (offline mode)
// ---------------------------------------------------------------------------

const memoryCounters = new Map<string, number>();
let memoryDonations: DonationRecord[] = [];
let memorySeq = 0;

/**
 * Clears the in-memory ledger. Test-only, and registered below so the global
 * `beforeEach` in `tests/setup/nextMocks.ts` runs it: receipt serials must not
 * leak between tests and make assertions order-dependent.
 */
export function resetDonationLedger(): void {
  memoryCounters.clear();
  memoryDonations = [];
  memorySeq = 0;
}

registerStateReset("donationLedger", resetDonationLedger);

/**
 * The offline branch of issuance. **Synchronous by design.**
 *
 * A caller whose guard, draw and write have to happen in one tick — the
 * sponsorship ledger's memory branch — has no other way to be atomic in a
 * single-threaded process: a promise here would hand a concurrent caller a window
 * between the guard and the draw. Refuses to run when a database is configured, so
 * it cannot become a way around `withReceiptTransaction`.
 */
export function issueReceiptInMemory(draft: DonationDraft, when: Date): DonationRecord {
  if (isLedgerPersistent()) {
    throw new Error(
      "issueReceiptInMemory is the offline branch; with DATABASE_URL set, draw inside withReceiptTransaction."
    );
  }

  const scope = receiptScopeFor(when);
  const serial = (memoryCounters.get(scope) ?? 0) + 1;
  memoryCounters.set(scope, serial);
  memorySeq += 1;

  const record: DonationRecord = {
    ...draft,
    id: `mem-don-${String(memorySeq).padStart(6, "0")}`,
    receiptNumber: formatReceiptNumber(scope, serial),
    sequenceScope: scope,
    sequenceValue: serial,
    issuedAt: when.toISOString(),
  };

  memoryDonations = [record, ...memoryDonations];
  return record;
}

// ---------------------------------------------------------------------------
// Postgres ledger
// ---------------------------------------------------------------------------

/** The models whose unique constraints a concurrent draw can genuinely trip. */
const RETRYABLE_MODELS = new Set(["ReceiptSequence", "Donation"]);

/**
 * A unique-constraint violation on the receipt series itself — the counter row or
 * a `donations` unique — which is the only collision the retry exists for.
 *
 * Scoped by model, which Prisma reports in `meta.modelName` (measured on this
 * client against PostgreSQL 18: `"Donation"`, `"ReceiptSequence"`,
 * `"PetSponsorship"`). A caller's own row inside the same transaction can trip a
 * unique too — `PetSponsorship.receiptNumber` — and retrying that would draw the
 * same serial again after the rollback and collide again, deterministically,
 * reported as a concurrency retry that never happened. A model-less P2002 is
 * not enough evidence to spend the retry on this narrow recovery path.
 */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { modelName?: unknown } };
  if (code !== "P2002") return false;
  const modelName = meta?.modelName;
  return typeof modelName === "string" && RETRYABLE_MODELS.has(modelName);
}

interface DonationRow {
  id: string;
  receiptNumber: string;
  sequenceScope: string;
  sequenceValue: number;
  donorName: string;
  donorEmail: string;
  donorPhone: string | null;
  taxIdOrIc: string | null;
  tierId: string;
  tierName: string;
  amountSen: number;
  currency: string;
  frequency: string;
  paymentMethod: string;
  targetPetName: string | null;
  notes: string | null;
  taxDeductibleRef: string;
  shelterRegistrationNo: string;
  issuedAt: Date;
}

function toRecord(row: DonationRow): DonationRecord {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    sequenceScope: row.sequenceScope,
    sequenceValue: row.sequenceValue,
    donorName: row.donorName,
    donorEmail: row.donorEmail,
    donorPhone: row.donorPhone ?? undefined,
    taxIdOrIc: row.taxIdOrIc ?? undefined,
    tierId: row.tierId as SponsorshipTierId,
    tierName: row.tierName,
    amountSen: senFromInteger(row.amountSen),
    currency: row.currency,
    frequency: row.frequency as DonationRecord["frequency"],
    paymentMethod: row.paymentMethod as DonationRecord["paymentMethod"],
    targetPetName: row.targetPetName ?? undefined,
    notes: row.notes ?? undefined,
    taxDeductibleRef: row.taxDeductibleRef,
    shelterRegistrationNo: row.shelterRegistrationNo,
    issuedAt: row.issuedAt.toISOString(),
  };
}

/**
 * Draws the next serial and writes the receipt, both through `tx`.
 *
 * The `upsert` takes a row-level write lock on the scope's counter, so concurrent
 * donors queue rather than race. Because the increment and the insert share a
 * transaction, an insert that fails rolls the counter back too — which is precisely
 * what a bare `SEQUENCE` cannot do, and what makes the series gapless.
 *
 * Exported for a caller that has a row of its own to write in the same transaction:
 * the sponsorship ledger guards a pledge, then draws its receipt, then attaches the
 * number, and either all three commit or none do. Call it only inside
 * `withReceiptTransaction`, which owns the transaction, the retry and the error
 * contract; this function owns only the draw.
 */
export async function drawAndInsert(
  tx: Prisma.TransactionClient,
  draft: DonationDraft,
  when: Date
): Promise<DonationRecord> {
  const scope = receiptScopeFor(when);

  const counter = await tx.receiptSequence.upsert({
    where: { scope },
    create: { scope, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });

  const row = await tx.donation.create({
    data: {
      receiptNumber: formatReceiptNumber(scope, counter.lastValue),
      sequenceScope: scope,
      sequenceValue: counter.lastValue,
      donorName: draft.donorName,
      donorEmail: draft.donorEmail,
      donorPhone: draft.donorPhone ?? null,
      taxIdOrIc: draft.taxIdOrIc ?? null,
      tierId: draft.tierId,
      tierName: draft.tierName,
      amountSen: draft.amountSen,
      currency: draft.currency,
      frequency: draft.frequency,
      paymentMethod: draft.paymentMethod,
      targetPetName: draft.targetPetName ?? null,
      notes: draft.notes ?? null,
      taxDeductibleRef: draft.taxDeductibleRef,
      shelterRegistrationNo: draft.shelterRegistrationNo,
      issuedAt: when,
    },
  });

  return toRecord(row);
}

/**
 * Interactive-transaction limits for the receipt series.
 *
 * Prisma's defaults are 2 s to start and 5 s to finish. A settler that loses a
 * race waits on the winner's row lock inside that window, and a managed Postgres
 * waking from idle can take several seconds before the winner even begins
 * (`prisma.ts` allows a 10 s connect for the same reason). Generous rather than
 * tight: a timeout here leaves the caller unable to confirm the commit outcome,
 * which must be surfaced as uncertainty rather than as a safe retry.
 */
const RECEIPT_TRANSACTION = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Runs `work` in the transaction a receipt is drawn in.
 *
 * Whatever `work` writes commits with the receipt, and a throw from `work` rolls the
 * serial and the receipt row back with it — so a caller that guards first, draws
 * second and writes third has done all three or none. Every failure comes back as
 * `ReceiptIssuanceError`: the caller could not confirm the transaction outcome.
 * PostgreSQL rolls back an ordinary transaction failure, but a lost commit
 * acknowledgement means the application cannot prove that from the error alone.
 *
 * Two writers creating the same scope row concurrently, or drawing the same serial,
 * trip the unique index; one retry re-runs `work` against the now-existing counter.
 * A second failure is not a race, so it propagates.
 *
 * @throws {ReceiptIssuanceError} when the transaction outcome could not be
 *   confirmed. The caller must surface that uncertainty rather than pretending
 *   either success or a safe retry.
 */
export async function withReceiptTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(work, RECEIPT_TRANSACTION);
  } catch (err) {
    if (isUniqueViolation(err)) {
      try {
        return await prisma.$transaction(work, RECEIPT_TRANSACTION);
      } catch (retryErr) {
        throw new ReceiptIssuanceError(
          "Could not allocate a receipt number after a concurrent-issuance retry.",
          retryErr
        );
      }
    }
    throw new ReceiptIssuanceError("Could not confirm the receipt transaction outcome.", err);
  }
}

/**
 * Issues a receipt, allocating the next gapless number in its month's series.
 *
 * @param draft The donation to record.
 * @param options.now Injectable clock. Defaults to the current instant; tests pass
 *   a fixed date so receipt numbers and month scoping are deterministic.
 * @throws {ReceiptIssuanceError} when the configured database does not confirm the
 *   write outcome. The caller must surface the uncertainty rather than prompting
 *   a duplicate attempt.
 */
export async function issueDonationReceipt(
  draft: DonationDraft,
  options?: { now?: Date }
): Promise<DonationRecord> {
  const when = options?.now ?? new Date();

  if (!isLedgerPersistent()) {
    return issueReceiptInMemory(draft, when);
  }

  return withReceiptTransaction((tx) => drawAndInsert(tx, draft, when));
}

/**
 * Lists issued receipts, newest first.
 *
 * Reads follow the same declared-mode rule as writes, but a failed *read* against a
 * configured database returns nothing rather than throwing: an unavailable admin
 * report is an inconvenience, whereas an unrecorded donation is data loss. The
 * asymmetry is deliberate and mirrors the read/write split in `handlePersistenceError`.
 */
export async function listDonations(limit = 200): Promise<DonationRecord[]> {
  try {
    return await listDonationsOrThrow(limit);
  } catch (err) {
    console.warn(
      "[Donation Ledger] Receipt listing failed:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * The same read, with the swallow removed. **Use this for the statutory export.**
 *
 * `listDonations` above returns `[]` on any read failure, which is right for a
 * dashboard: a panel that renders empty during a Neon outage is degraded, and the
 * next refresh fixes it. It is wrong for the LHDN export, where an empty result is
 * not a degraded view but a *claim* — that the shelter received no donations — and
 * it is indistinguishable from the truthful version of that claim. An operator
 * filing an annual return cannot tell the two apart, and the failure is silent on
 * both sides.
 *
 * So the export reads through here and reports the failure instead. This is the
 * read half of the asymmetry the model comment describes, split by *consequence of
 * being wrong* rather than by caller.
 */
export async function listDonationsOrThrow(limit = 200): Promise<DonationRecord[]> {
  if (!isLedgerPersistent()) {
    return memoryDonations.slice(0, limit);
  }

  const rows = await prisma.donation.findMany({
    orderBy: { issuedAt: "desc" },
    take: limit,
  });
  return rows.map(toRecord);
}

/** Looks up a single receipt by its human-facing number. */
export async function findDonationByReceiptNumber(
  receiptNumber: string
): Promise<DonationRecord | null> {
  if (!isLedgerPersistent()) {
    return memoryDonations.find((d) => d.receiptNumber === receiptNumber) ?? null;
  }

  try {
    const row = await prisma.donation.findUnique({ where: { receiptNumber } });
    return row ? toRecord(row) : null;
  } catch (err) {
    console.warn(
      "[Donation Ledger] Receipt lookup failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
