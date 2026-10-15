/**
 * The bulletin feed's ordering, as pure logic.
 *
 * It lives in the domain layer rather than inside the repository for the reason
 * `planFaqRenumber` does: the repository's database path delegates ordering to
 * Postgres, so the only way to exercise this rule directly is to have it
 * somewhere a test can call with rows of its own choosing. Ties are the case
 * that matters, and the committed fixture has no two notices on one day.
 *
 * What has to stay in step with the `orderBy` in `getPublicBulletins` and
 * `listBulletinRecords` is **the rule**, not the output: the two paths read
 * different row sets, the database's rows and the committed fixture's. Where
 * the *rule* diverges, an outage silently reorders the feed, which is a worse
 * failure than the outage because nothing reports it.
 * `BULLETIN_FEED_ORDER_BY` below is the shared declaration, and the repository
 * spreads it rather than writing a second literal.
 *
 * `createdAt` is compared as a full ISO instant, which is what
 * `BulletinRecord` carries on both paths. Getting that wrong is what made this
 * tiebreaker dead twice — once by truncating it to a day, once by stamping
 * every fixture row with the same epoch. `freshBulletins` explains what the
 * fixture carries now and why.
 */

export interface BulletinOrderable {
  id: string;
  isPinned: boolean;
  /** `YYYY-MM-DD`. */
  publishedAt: string;
  createdAt: string;
}

/**
 * Descending string compare.
 *
 * Plain `>` compares UTF-16 code units. Be honest about what that buys: it
 * matches Postgres exactly only under `C` collation, and under the usual
 * `en_US.UTF-8` an `ORDER BY id DESC` applies ICU rules that weaken case and
 * punctuation. For the lowercase-alphanumeric cuids this table actually holds,
 * code-unit order and ICU order agree, so the two paths agree in practice.
 *
 * It is still preferred over `localeCompare`, which is locale-sensitive at
 * runtime and so could differ between two machines running this same code. The
 * residual gap is ids outside that character set, which nothing produces today;
 * if one ever does, the tiebreaker should move to a column whose ordering is
 * collation-independent rather than this comment growing another paragraph.
 */
function desc(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/**
 * Pinned first, then newest.
 *
 * Every tiebreaker is DESCENDING, and that is the load-bearing detail.
 * `publishedAt` is a calendar day, so two notices posted the same day are
 * ordinary rather than exceptional. An ascending tiebreaker resolves a tied day
 * to the OLDEST notice, so a feed limited to two items would deterministically
 * drop the one written most recently that day — the exact failure a tiebreaker
 * is added to prevent, made permanent instead of intermittent.
 *
 * `createdAt` before `id` because it says what is meant. `id` is last only to
 * make the order total: two rows can share a millisecond.
 */
export function sortBulletinsForFeed<T extends BulletinOrderable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const byDate = desc(a.publishedAt, b.publishedAt);
    if (byDate !== 0) return byDate;
    const byCreated = desc(a.createdAt, b.createdAt);
    if (byCreated !== 0) return byCreated;
    return desc(a.id, b.id);
  });
}

/**
 * The `orderBy` the Prisma reads use, as one declaration.
 *
 * Exported so the repository cannot spell it differently in two places, and so
 * a test can assert the query and `sortBulletinsForFeed` agree rather than
 * checking each against a hand-copied literal.
 */
export const BULLETIN_FEED_ORDER_BY = [
  { isPinned: "desc" },
  { publishedAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
] as const;
