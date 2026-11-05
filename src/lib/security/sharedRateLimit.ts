import { spendRateLimitBucket, sweepExpiredRateLimitBuckets } from "@/lib/server/rateLimitBuckets";
import { scheduleAfterResponse } from "@/lib/scheduleAfterResponse";
import { signPayload } from "./crypto";
import { checkRateLimit, type RateLimitResult } from "./rateLimit";

/**
 * What a shared check answers. The `unavailable` member means the budget could
 * not be read: the caller must refuse, and should say "try later", not "too
 * many". It carries no `retryAfterSeconds` on purpose, so a call site that
 * builds a "wait N seconds" message does not type-check until it handles the
 * outage first.
 */
export type SharedRateLimitResult = RateLimitResult | { success: false; unavailable: true };

/** Share of calls that also sweep expired rows. */
const SWEEP_PROBABILITY = 0.02;

/**
 * The row key for a budget name: an HMAC under the server secret, so a copy of
 * the table cannot be reversed by hashing every IPv4 address or a list of staff
 * emails. Rotating `SESSION_SECRET` only resets the budgets.
 */
export function rateLimitKeyDigest(key: string): string {
  return signPayload(`rate-limit-bucket\u0000${key}`);
}

/**
 * A rate limit held in Postgres, so every server instance spends the same budget.
 *
 * `checkRateLimit` is a per-process `Map`: on Vercel each warm instance counts
 * separately, so a caller spread across instances is not bounded by it. This
 * keeps the same arguments and success shape, but the count lives in
 * `rate_limit_buckets` and is advanced by one atomic upsert
 * (`spendRateLimitBucket`), so callers on different instances cannot both read
 * "under budget".
 *
 * **Fails closed.** With a `DATABASE_URL` configured, any error reading the
 * budget refuses with `{ success: false, unavailable: true }`. It never falls back to the
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
 * ceiling: every check is one upsert, refused or not, so a flood costs one
 * write per request. Fine at this shelter's volume; a per-instance memory of
 * refusals was tried and removed in review (it outlived the row it copied).
 *
 * ceiling: expired rows are swept by about one call in fifty, so the table holds
 * at most the keys touched in the last window plus the unswept tail. Measured by
 * nothing yet; at this shelter's registration volume it is a few rows.
 *
 * ceiling: a production deploy with no `DATABASE_URL` takes the in-memory path,
 * and with it the per-process bound this replaces: a code guessed there stays
 * guessed. Every hosted deploy of this app sets `DATABASE_URL`; refusing
 * registration without one would need its own decision.
 *
 * ceiling: the address budget is keyed on the whole address, so a caller who
 * can rotate through an IPv6 prefix draws a fresh budget per address
 * (`tasks/open/address-budgets-key-the-whole-ipv6-address.md`).
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<SharedRateLimitResult> {
  // `DATABASE_URL`, not `isDatabasePersistent()`: the strict integration tier
  // sets STRICT_PERSISTENCE with no database, and there the in-memory budget is
  // the one under test. The ledgers choose their storage the same way.
  if (!process.env.DATABASE_URL) return checkRateLimit(key, limit, windowMs);

  const hashedKey = rateLimitKeyDigest(key);

  try {
    const { count, retryAfterSeconds } = await spendRateLimitBucket(hashedKey, windowMs, limit + 1);

    // After the response, so no caller waits on it. A failed sweep costs only
    // table size; the next one retries it.
    if (Math.random() < SWEEP_PROBABILITY) scheduleAfterResponse(sweepExpiredRateLimitBuckets);

    if (count > limit) return { success: false, remaining: 0, retryAfterSeconds };
    return { success: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch (err) {
    // The key is left out: it is built from an email or an address.
    console.error(
      "[security/rateLimit] Shared rate limit unavailable; refusing the request:",
      err instanceof Error ? err.message : err
    );
    return { success: false, unavailable: true };
  }
}
