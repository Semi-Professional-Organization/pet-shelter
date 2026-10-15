/**
 * The reference a supporter is handed at checkout, for money nobody has counted yet.
 *
 * Two flows issue one: a pet sponsorship (`HFS-PLG`) and a general gift
 * (`HFS-GFT`). Both exist for the same reason and must keep the same shape, so
 * there is one generator rather than two that drift. A coordinator reconciling a
 * bank statement reads all three series side by side — the two claim prefixes and
 * the `HFS-DON` receipt series — and the prefix is what tells them apart at a
 * glance. See `src/lib/server/donationLedger.ts` for the receipt series, which is
 * emphatically not this: a receipt number is gapless, sequential and statutory.
 */

/**
 * The claim series a reference belongs to.
 *
 * Deliberately a closed union rather than a `string`: these two values are printed
 * on bank transfer descriptions and matched by eye, and a third series invented at
 * a call site would be indistinguishable from a typo.
 */
export type ContributionSeries = "PLG" | "GFT";

/**
 * A reference for a contribution whose payment has not been verified.
 *
 * Random rather than sequential, because nothing statutory depends on it being
 * gapless — unlike a receipt number, which is drawn from a counter inside the
 * transaction that writes the receipt. A random serial also means the count of
 * pending contributions is not readable from any one reference.
 *
 * The date part is UTC. That is a deliberate difference from `receiptScopeFor`,
 * which computes its month in Asia/Kuala_Lumpur because which month a receipt
 * falls in has tax consequences. Nothing here is filed anywhere, so the simpler
 * rule is the right one — but do not copy this choice back onto a receipt.
 */
export function generateContributionRef(
  series: ContributionSeries,
  now: Date = new Date()
): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const serial = Math.floor(100000 + Math.random() * 900000);
  return `HFS-${series}-${day}-${serial}`;
}
