import { createHash } from "node:crypto";
import { spendRateLimitBucket, sweepExpiredRateLimitBuckets } from "@/lib/server/rateLimitBuckets";
import { checkRateLimit, type RateLimitResult } from "./rateLimit";

/**
 * What a shared check answers. `unavailable` is set only when the budget could
 * not be read: the caller must refuse, and should say "try later", not "too many".
 */
export type SharedRateLimitResult = RateLimitResult & { unavailable?: true };

/** How long a refused-for-outage caller is told to wait. */
const UNAVAILABLE_RETRY_SECONDS = 60;

/** Share of calls that also sweep expired rows. */
const SWEEP_PROBABILITY = 0.02;

/**
 * A rate limit held in Postgres, so every server instance spends the same budget.
 *
 * `checkRateLimit` is a per-process `Map`: on Vercel each warm instance counts
 * separately, so a caller spread across instances is not bounded by it. This
 * keeps the same arguments and result shape, but the count lives in
 * `rate_limit_buckets` and is advanced by one atomic upsert
 * (`spendRateLimitBucket`), so callers on different instances cannot both read
 * "under budget".
 *
 * **Fails closed.** With a `DATABASE_URL` configured, any error reading the
 * budget refuses the request with `unavailable: true`. It never falls back to the
 * per-process `Map`, because that fallback is exactly the unbounded state this
 * exists to end, and an attacker who can slow the database would choose it.
 *
 * With no `DATABASE_URL` (local development, the unit and component tiers) there
 * is no shared state to hold, the app is one process anyway, and every other
 * store already serves memory, so this delegates to `checkRateLimit`.
 *
 * ceiling: a fixed window, not the sliding one `checkRateLimit` keeps, so a
 * caller can spend up to twice `limit` across one window boundary. One row per
 * key holds that in a single statement; a sliding window needs a row per hit.
 * Upgrade path: a two-window weighted count if the 2x burst ever matters.
 *
 * ceiling: expired rows are swept by about one call in fifty, so the table holds
 * at most the keys touched in the last window plus the unswept tail. Measured by
 * nothing yet; at this shelter's registration volume it is a few rows.
 *
 * ceiling: a production deploy with no `DATABASE_URL` takes the in-memory path.
 * Such a deploy keeps every account in memory too, so there is nothing for a
 * guessed invite code to reach that survives a restart.
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<SharedRateLimitResult> {
  if (!process.env.DATABASE_URL) return checkRateLimit(key, limit, windowMs);

  // Hashed so the table never holds the email or address a key is built from.
  const hashedKey = createHash("sha256").update(key).digest("hex");

  try {
    const { count, retryAfterSeconds } = await spendRateLimitBucket(hashedKey, windowMs, limit + 1);

    if (Math.random() < SWEEP_PROBABILITY) {
      // A failed sweep costs only table size; the next one retries it.
      await sweepExpiredRateLimitBuckets().catch(() => {});
    }

    if (count > limit) return { success: false, remaining: 0, retryAfterSeconds };
    return { success: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch (err) {
    // The key is left out: it is built from an email or an address.
    console.error(
      "[security/rateLimit] Shared rate limit unavailable; refusing the request:",
      err instanceof Error ? err.message : err
    );
    return { success: false, remaining: 0, retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS, unavailable: true };
  }
}
