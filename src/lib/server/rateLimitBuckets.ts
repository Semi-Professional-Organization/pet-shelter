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
 * The count is capped at `cap` so a flood cannot walk it towards int4 overflow.
 */
export async function spendRateLimitBucket(
  hashedKey: string,
  windowMs: number,
  cap: number
): Promise<{ count: number; retryAfterSeconds: number }> {
  const rows = await prisma.$queryRaw<{ count: number; retryAfterSeconds: number }[]>`
    INSERT INTO "rate_limit_buckets" AS b ("key", "count", "expiresAt")
    VALUES (${hashedKey}, 1, now() + ${windowMs}::int * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN b."expiresAt" <= now() THEN 1 ELSE LEAST(b."count" + 1, ${cap}::int) END,
      "expiresAt" = CASE WHEN b."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE b."expiresAt" END
    RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM (b."expiresAt" - now()))))::int AS "retryAfterSeconds"`;

  const row = rows[0];
  if (!row) throw new Error("rate_limit_buckets upsert returned no row");
  return { count: Number(row.count), retryAfterSeconds: Number(row.retryAfterSeconds) };
}

/** Deletes every bucket whose window has ended. */
export async function sweepExpiredRateLimitBuckets(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "expiresAt" < now()`;
}
