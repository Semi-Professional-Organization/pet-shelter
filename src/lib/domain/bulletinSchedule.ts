/**
 * When a published bulletin becomes visible.
 *
 * A notice date in the future SCHEDULES the notice: it stays off the public
 * feeds until that day. Before this existed the feed had no date predicate and
 * sorted `publishedAt` descending, while `/` and `/pets` show two notices — so a
 * clinic announcement dated for next month published at once and took the top
 * unpinned slot above every notice posted today, urgent ones included.
 *
 * "Today" is the shelter's day, in `Asia/Kuala_Lumpur`, the zone the rest of
 * this codebase renders in (`src/lib/server/donationLedger.ts` explains why for
 * receipts). UTC would be wrong in a way staff would hit: Malaysia is UTC+8, so
 * between midnight and 08:00 local the UTC date is still yesterday.
 *
 * Pure and dependency-free, so the admin table badges a notice "Scheduled" and
 * the form defaults its date with exactly the rule the server applies.
 */

const SHELTER_TIME_ZONE = "Asia/Kuala_Lumpur";

/**
 * Built once, on first use. An `Intl.DateTimeFormat` is an ICU object and not
 * cheap, so constructing one per call cost one per row.
 *
 * Lazily rather than at module scope: on a runtime whose ICU lacks this zone
 * the constructor throws `RangeError`, and at module scope that would fail the
 * *import* — taking down every module that imports this one, the repository
 * included — instead of just the call that needed the date.
 */
let shelterDayFormat: Intl.DateTimeFormat | undefined;
function getShelterDayFormat(): Intl.DateTimeFormat {
  shelterDayFormat ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: SHELTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return shelterDayFormat;
}

/**
 * The shelter's calendar day as `YYYY-MM-DD`.
 *
 * Assembled from `formatToParts`, not from `format()`. The order and separators
 * of a formatted date come from the runtime's locale data, which is not part of
 * the contract: `en-CA` happens to produce `YYYY-MM-DD` in current ICU builds,
 * and if it ever did not, the server would build an Invalid Date (Prisma
 * rejects it, the read fails, every feed empties) and the browser would compare
 * `"2026-…" > "10/14/2026"` and badge every notice Scheduled. `receiptScopeFor`
 * in the donation ledger reads the parts for the same reason.
 */
export function shelterToday(now: Date = new Date()): string {
  const parts = getShelterDayFormat().formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The exclusive upper bound for "dated today or earlier", in the column's terms:
 * midnight UTC at the start of the shelter's *tomorrow*.
 *
 * Exclusive and next-day rather than `<=` today's midnight, because the bound
 * must hold for any instant within a day, not just midnight. Notice dates the
 * form writes are midnight UTC, but the column defaults to `now()`, so a row
 * inserted any other way carries a time of day; `<= midnight` would hide it
 * until tomorrow while the admin badge — which compares day strings — called it
 * live. `< tomorrow's midnight` gives both the same answer.
 */
export function startOfNextShelterDay(now: Date = new Date()): Date {
  const today = new Date(`${shelterToday(now)}T00:00:00.000Z`);
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * True when a published notice is dated after the shelter's today.
 *
 * Pass `today` when checking many rows. Computing it per row is not just slower:
 * a pass that runs across the shelter's midnight would judge earlier rows
 * against yesterday and later rows against today, so one render could badge a
 * notice dated today as scheduled while counting it as live.
 */
export function isScheduledForLater(publishedAt: string, today: string = shelterToday()): boolean {
  // Day strings compare correctly as text because both are `YYYY-MM-DD`.
  return publishedAt.slice(0, 10) > today;
}
