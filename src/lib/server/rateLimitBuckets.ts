import { prisma } from "./prisma";

/**
 * The `rate_limit_buckets` table, for `checkSharedRateLimit`
 * (`src/lib/security/sharedRateLimit.ts`), which owns the policy: hashing the
 * key, failing closed, and when to sweep. Errors propagate; nothing here falls
 * back to memory.
 */

/**
 * Spends one hit of `hashedKey`'s fixed window and returns the count after it.
 *
 * One upsert, so concurrent callers on separate connections serialise on the
 * row and cannot both read "under budget". Postgres evaluates every SET
 * expression against the row as it was, so both CASEs see the same old
 * `expiresAt`; RETURNING sees the row as written. Time is the database's
 * `now()`, so instance clocks never disagree about a window.
 *
 * `now()` is each transaction's start, so a caller that began before the row's
 * writer can see slightly more than the window left; `retryAfterSeconds` is
 * clamped to the window so nobody is told to wait 61 seconds for a 60-second one.
 *
 * ceiling: no statement timeout of its own. A database that accepts the
 * connection and then stalls holds the request until the function's own limit
 * instead of failing closed at once. Recorded in
 * `tasks/open/the-shared-rate-limit-writes-on-every-attempt.md`.
 *
 * The count is capped at `cap` so a flood cannot walk it towards int4 overflow.
 * `cap` must be a positive int4; `checkSharedRateLimit` passes `limit + 1`.
 */
export async function spendRateLimitBucket(
  hashedKey: string,
  windowMs: number,
  cap: number
): Promise<{ count: number; retryAfterSeconds: number }> {
  const rows = await prisma.$queryRaw<{ count: number; retryAfterSeconds: number }[]>`
    INSERT INTO "rate_limit_buckets" AS b ("key", "count", "expiresAt")
    VALUES (${hashedKey}, 1, now() + make_interval(secs => ${windowMs / 1000}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN b."expiresAt" <= now() THEN 1 ELSE LEAST(b."count" + 1, ${cap}::int) END,
      "expiresAt" = CASE WHEN b."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE b."expiresAt" END
    RETURNING "count",
      LEAST(CEIL(${windowMs / 1000}::double precision), GREATEST(1, CEIL(EXTRACT(EPOCH FROM (b."expiresAt" - now())))))::int
        AS "retryAfterSeconds"`;

  const row = rows[0];
  // A thrown error is what makes the caller fail closed: a missing or
  // non-integer count must never reach `count > limit` (`NaN > limit` is false).
  // `Number.isInteger` does not coerce, so null and strings are rejected too.
  if (!row || !Number.isInteger(row.count) || !Number.isInteger(row.retryAfterSeconds)) {
    throw new Error("rate_limit_buckets upsert returned no usable row");
  }
  return { count: row.count, retryAfterSeconds: row.retryAfterSeconds };
}

/** Deletes every bucket whose window has ended. */
export async function sweepExpiredRateLimitBuckets(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "expiresAt" < now()`;
}
