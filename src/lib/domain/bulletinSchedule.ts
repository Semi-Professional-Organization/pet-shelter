/**
 * When a published bulletin becomes visible.
 *
 * A notice date in the future SCHEDULES the notice: it stays off the public
 * feeds until that day. Before this existed the feed had no `publishedAt <= now`
 * predicate and sorted `publishedAt` descending, while `/` and `/pets` show two
 * notices — so a clinic announcement dated for next month published at once and
 * took the top unpinned slot above every notice posted today, urgent ones
 * included, for weeks, with nothing on screen saying why.
 *
 * "Today" is the shelter's day, in `Asia/Kuala_Lumpur`, the zone the rest of
 * this codebase renders in (`src/lib/server/donationLedger.ts` explains why for
 * receipts). UTC would be wrong in a way staff would hit: Malaysia is UTC+8, so
 * between midnight and 08:00 local the UTC date is still yesterday, and an
 * overnight volunteer's urgent notice — which the form dates *today*, local —
 * would stay hidden for up to eight hours.
 *
 * Pure and dependency-free so the admin table can badge a notice "Scheduled"
 * with exactly the rule the server applies.
 */

const SHELTER_TIME_ZONE = "Asia/Kuala_Lumpur";

/** The shelter's calendar day as `YYYY-MM-DD`. */
export function shelterToday(now: Date = new Date()): string {
  // `en-CA` formats as YYYY-MM-DD, which is why it is used here rather than for
  // any display reason.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHELTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The shelter's day as the instant `publishedAt` is stored at: midnight UTC of
 * that calendar day. Notice dates are written that way (see `parseNoticeDate`
 * in the repository), so `publishedAt <= this` means "dated today or earlier".
 */
export function shelterTodayAsStoredInstant(now: Date = new Date()): Date {
  return new Date(`${shelterToday(now)}T00:00:00.000Z`);
}

/** True when a published notice is dated after the shelter's today. */
export function isScheduledForLater(publishedAt: string, now: Date = new Date()): boolean {
  return publishedAt > shelterToday(now);
}
