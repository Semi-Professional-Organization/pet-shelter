import { generateContributionRef } from "@/lib/domain/contributionRef";

/**
 * The lifecycle of a general gift between "a supporter filled in the form" and
 * "the shelter has the money".
 *
 * `PENDING_PAYMENT` is where every gift starts. The donor was shown a DuitNow QR
 * or the shelter's bank details and told us they paid; nothing has looked at a
 * bank statement. Until 2026-09-22 the donation form skipped this state entirely
 * and minted an official tax receipt from that assertion alone, which
 * meant anyone could produce a tax document from a public form without sending a
 * cent.
 *
 * Narrower than `SponsorshipStatus` on purpose. A sponsorship can also be
 * `EXPIRED`, because a standing monthly commitment can lapse; a one-off gift
 * either arrives or does not, so there is no state for it to lapse into and no
 * code that would ever write one.
 */
export type DonationPledgeStatus = "PENDING_PAYMENT" | "ACTIVE" | "CANCELLED";

export const DONATION_PLEDGE_STATUSES: readonly DonationPledgeStatus[] = [
  "PENDING_PAYMENT",
  "ACTIVE",
  "CANCELLED",
] as const;

/**
 * The longest dedication a gift may carry. Both the donation form and the schema cut
 * a longer one to this through `normaliseDedication`, so the two cannot disagree.
 */
export const DONATION_DEDICATION_MAX_LENGTH = 100;

/**
 * A dedication as one line: format characters (zero-width, bidi overrides) are removed,
 * every run of whitespace or control characters becomes a single space, then it is
 * trimmed and capped. A newline would otherwise start a line of its own in the
 * plain-text emails, where it can pose as a field of the mail, and a right-to-left
 * override would reorder what staff read. The cap never leaves half of a surrogate pair.
 * ceiling: removing `\p{Cf}` also removes the zero-width joiner, so a joined emoji
 * sequence is stored as its separate emoji.
 */
export function normaliseDedication(value: string): string {
  let text = value
    .replace(/\p{Cf}/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim()
    .slice(0, DONATION_DEDICATION_MAX_LENGTH);
  if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text.trimEnd();
}

/**
 * Reference handed to the donor at checkout, to quote on their transfer.
 *
 * Prefixed `HFS-GFT`: unlike `HFS-DON`, because a claim is not a receipt, and
 * unlike the sponsorship series `HFS-PLG`, because the two live in different
 * tables with separate unique indexes. Distinct prefixes make a cross-queue
 * collision impossible rather than merely unlikely, and tell a coordinator which
 * queue to open from the bank statement alone.
 */
export function generateGiftRef(now: Date = new Date()): string {
  return generateContributionRef("GFT", now);
}

/**
 * True for a reference this application could have issued for a general gift.
 *
 * Enforced at the action boundary by `giftRefSchema` in
 * `src/lib/validations/donation.ts`, which is what rejects a malformed reference
 * before it reaches Prisma. A shape check, not an existence check: a well-formed
 * reference naming no row still comes back "not found". The ledger's own
 * `assertGiftRefString` is the separate, narrower guard — it defends the `where`
 * clause against a non-string, which Prisma would read as a filter object.
 */
export function isGiftRef(value: string): boolean {
  return /^HFS-GFT-\d{8}-\d{6}$/.test(value);
}
