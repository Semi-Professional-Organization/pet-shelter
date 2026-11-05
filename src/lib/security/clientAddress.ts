import { isIP } from "node:net";
import { headers } from "next/headers";
import { checkRateLimit } from "./rateLimit";
import { checkSharedRateLimit, type SharedRateLimitResult } from "./sharedRateLimit";

/**
 * Rate limiting by caller address, for the auth endpoints that cannot be
 * bounded by anything the caller supplies.
 *
 * Every unauthenticated auth endpoint here was keyed on the submitted email,
 * which is attacker-supplied: walking a shared secret needs only a fresh
 * address per guess, and a password spray never spends a second attempt on any
 * one key. Bounding either requires a key the caller does not choose.
 *
 * Lives in its own module rather than in `rateLimit.ts`, which the open ledger
 * entry originally proposed. `rateLimit.ts` is a pure sliding-window structure
 * with eight action-module consumers and its own standalone suite; importing
 * `next/headers` into it would make a request-scoped concern reachable from
 * every one of them. Composing the two here keeps that module pure and leaves
 * exactly one copy of the header-trust reasoning.
 */

/**
 * Which request header, if any, carries a client address this deployment may
 * believe. Null means "no trustworthy address is available here".
 *
 * A forwarding header is only as honest as the hop that wrote it. Nothing stops
 * a client from sending `x-real-ip` or `x-forwarded-for` itself, so on a
 * deployment with no proxy overwriting them they are simply attacker-supplied
 * input — and an address budget keyed on attacker-supplied input reproduces the
 * defect it was added to fix. This repo ships a `docker-compose.yml` and runs
 * `next start`, so that is a real deployment shape here, not a hypothetical.
 *
 * Hence: believe a header only when something external vouches for it. Vercel's
 * edge overwrites `x-vercel-forwarded-for` on the way in, which is why it is
 * consulted only when actually running on Vercel — a client can send that name
 * too, anywhere else. Any other topology has to say so with
 * `TRUSTED_PROXY_HEADER`, which is the operator asserting that their proxy
 * overwrites that header rather than appending to it.
 */
function trustedAddressHeader(): string | null {
  const configured = process.env.TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (configured) return configured;
  if (process.env.VERCEL) return "x-vercel-forwarded-for";
  return null;
}

/**
 * The caller's address when it can be trusted, and null when it cannot.
 *
 * Null is not a bucket. An earlier version returned the string `"unknown"` and
 * limited every unattributable caller together, which on any deployment setting
 * none of these headers made the budget a site-wide cap — twenty sign-ins a
 * minute for every user at once, and one person fumbling a password behind a
 * shared address locking out their colleagues. A limiter that denies service to
 * the people it protects is worse than the gap it was covering.
 *
 * The value is parsed as an IP before it is used as a limiter key. `isIP`
 * rejects anything else, which also bounds the key: without it a caller could
 * send a different multi-kilobyte header per request and grow the limiter's Map
 * without limit.
 */
export async function getClientAddress(): Promise<string | null> {
  const header = trustedAddressHeader();
  if (!header) return null;

  try {
    // Leftmost entry: the hop named above overwrites this header, so the first
    // value is the one it wrote rather than one the client prepended.
    const value = (await headers()).get(header)?.split(",")[0]?.trim();
    return value && isIP(value) ? value : null;
  } catch {
    // No request scope (a direct unit-test call).
    return null;
  }
}

/**
 * Whether this caller's address has exhausted `limit` attempts of `name`.
 *
 * Deliberately not `RateLimitResult | null`. A nullable return puts the
 * "no trusted address" case in the caller's hands at five sites, where reading
 * null as *denied* locks everyone out and reading it as *allowed* is a silent
 * no-op that looks identical to a working limiter. Collapsing it to `limited`
 * makes the untrusted case indistinguishable from an under-budget one at the
 * call site, which is what it should be: not limited, this time.
 *
 * ceiling: where no address can be trusted this never limits anything, and the
 * endpoint's per-email budget is all that remains. That is the honest state —
 * an untrustworthy address cannot bound anything — but a self-hosted deployment
 * has to set `TRUSTED_PROXY_HEADER` to get this protection at all.
 *
 * `shared: true` spends the budget in Postgres (`checkSharedRateLimit`), so every
 * server instance counts it together, and refuses with `unavailable` when that
 * budget cannot be read. Registration uses it.
 *
 * ceiling: without `shared`, `checkRateLimit` is a per-process Map, so on a
 * serverless host each warm instance counts separately and a distributed caller
 * is not bounded. Only registration has moved so far (#213).
 */
export async function checkAddressRateLimit(
  name: string,
  limit: number,
  windowMs: number,
  options: { shared?: boolean } = {}
): Promise<{ limited: false } | { limited: true; retryAfterSeconds: number; unavailable?: true }> {
  const address = await getClientAddress();
  if (!address) return { limited: false };

  const key = `${name}:ip:${address}`;
  const result: SharedRateLimitResult = options.shared
    ? await checkSharedRateLimit(key, limit, windowMs)
    : checkRateLimit(key, limit, windowMs);
  if (result.success) return { limited: false };
  return result.unavailable
    ? { limited: true, retryAfterSeconds: result.retryAfterSeconds, unavailable: true }
    : { limited: true, retryAfterSeconds: result.retryAfterSeconds };
}
