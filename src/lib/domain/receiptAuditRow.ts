import { ringgitFromSen, senFromInteger } from "@/lib/domain/money";

/**
 * What an audit row says about a receipted contribution.
 *
 * ## Why this is a domain module
 *
 * Three readers ask the same two questions of an audit row — *is this a receipt?*
 * and *for how much?* — and each used to answer on its own: the audit controller's
 * receipts tab, the audit viewer's badge, and the LHDN CSV fallback. They drifted.
 * The viewer and the controller tested for the *presence* of a `receiptNumber`
 * key while the exporter tested its *truthiness*, so a row could wear a donation
 * badge on screen and be absent from the export; and the exporter read only
 * `amountMYR`, a key reconciled sponsorships never carried, so those rows exported
 * RM 0.00 on a document filed with LHDN.
 *
 * The rules live here, beside `money.ts`, so a fourth reader finds them where it
 * would look, and none of the three imports a presentation module to get them.
 */

/** The fields of an audit entry these rules read. Structural, so any entry fits. */
export interface ReceiptAuditRowLike {
  action: string;
  entity: string;
  details?: unknown;
}

/** An entry's details as a plain record, or an empty one. */
export function auditDetails(entry: { details?: unknown }): Record<string, unknown> {
  return typeof entry.details === "object" && entry.details !== null
    ? (entry.details as Record<string, unknown>)
    : {};
}

/**
 * True when an audit row records an issued receipt.
 *
 * Three ways in, kept because each is a stored string or shape something already
 * written depends on: the action `DONATION_RECEIVED`, the entity
 * `DonationReceipt`, or a `receiptNumber` in the details — which is how a
 * `SPONSORSHIP_RECONCILED` row qualifies.
 *
 * The third is a **truthiness** test, not a key-presence one. A row carrying
 * `receiptNumber: null` or `""` has no receipt, and a `"receiptNumber" in details`
 * check would call it one. This is also what keeps a pending pledge's audit row
 * out of every receipt view: `DONATION_PLEDGED` writes no such key at all.
 */
export function isReceiptAuditRow(entry: ReceiptAuditRowLike): boolean {
  return (
    entry.action === "DONATION_RECEIVED" ||
    entry.entity === "DonationReceipt" ||
    Boolean(auditDetails(entry).receiptNumber)
  );
}

/** A strictly-formatted decimal string, with an optional `RM` and thousands commas. */
const RINGGIT_TEXT = /^(?:RM\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/i;

/**
 * A positive ringgit figure from a number or from text, or `undefined`.
 *
 * Text is matched against an explicit pattern rather than handed to `Number()`,
 * which accepts `"0x10"` and `"1e3"` as amounts and rejects `"1,250.00"` — both
 * wrong for a figure a person may have typed into a backfill.
 */
function ringgitFrom(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;

  const match = RINGGIT_TEXT.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/,/g, "") + (match[2] ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** A positive whole number of sen from a number or a digit string, or `undefined`. */
function senFrom(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : undefined;
  return n !== undefined && Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/**
 * The ringgit amount an audit row's details record, or `undefined` if it has none.
 *
 * `amountSen` first, when it is a positive whole number: it is the exact integer
 * every ledger stores, and `amountMYR` is a float derived from it. Otherwise
 * `amountMYR`. Otherwise nothing.
 *
 * **Zero, negatives and fractions of a sen are "no answer", not an amount.** No
 * receipt is issued for RM 0.00 — the forms refuse anything under RM 5 — so a
 * stored zero is a placeholder, and treating it as authoritative would let a junk
 * `amountSen: 0` mask a real `amountMYR: 250` beside it.
 *
 * Callers must render `undefined` as *unknown*, never as `0.00`: on a tax return
 * "we do not know what this was" and "this was nothing" are different claims, and
 * the second is the more dangerous to assert.
 */
export function resolveAuditAmountMYR(details: Record<string, unknown>): number | undefined {
  const sen = senFrom(details.amountSen);
  if (sen !== undefined) return ringgitFromSen(senFromInteger(sen));
  return ringgitFrom(details.amountMYR);
}

/** A ringgit figure for a CSV cell: two decimals, or empty when unknown. */
export function formatAmountCell(amountMYR: unknown): string {
  const resolved = ringgitFrom(amountMYR);
  return resolved === undefined ? "" : resolved.toFixed(2);
}
