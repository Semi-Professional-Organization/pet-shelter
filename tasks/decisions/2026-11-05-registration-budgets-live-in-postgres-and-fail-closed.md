# Registration budgets live in Postgres and fail closed

**Decided:** 2026-11-05

Settles `open/the-registration-rate-limiter-is-per-process.md` (#213). The owner approved the plan
on #213: hold the `register:ip:` and `register:email:` budgets in a Postgres table, not Redis, and
refuse registration when that table cannot be read.

- **Postgres, not Redis.** Neon is already in place; a second store is a second secret, a second
  outage and a second bill for a few rows a minute.
- **A new async function, not a changed `checkRateLimit`.** `checkRateLimit` is synchronous and has
  sixteen callers. A database call cannot be synchronous, so `checkSharedRateLimit`
  (`src/lib/security/sharedRateLimit.ts`) takes the same arguments and the same success shape (plus an outage member),
  and only registration moves to it. `checkAddressRateLimit` takes `{ shared: true }`. The other
  budgets stay per-process until someone needs them shared (#263, volunteer applications, is
  expected to be the next).
- **Fails closed, with its own message.** With a `DATABASE_URL`, any error reading the budget
  refuses the request and says "temporarily unavailable". It never falls back to the per-process
  `Map`: that fallback is the unbounded state this exists to end, and a caller who can slow the
  database would choose it. With no `DATABASE_URL` there is no shared state to hold, so it uses the
  `Map`; that is development and the unit tiers.
- **A fixed window, not a sliding one.** One row per key, advanced by one upsert, so the check is a
  single statement and atomic. The cost is a possible 2x burst across a window boundary, recorded as
  a `ceiling:`.
- **Keys are HMAC-SHA256 digests under `SESSION_SECRET`.** The table never holds the email or
  address a budget is named for, and a plain hash would not do: every IPv4 address can be hashed
  in seconds. Rotating the secret resets every budget.
- **An outage has its own result.** `checkSharedRateLimit` answers `{ success: false, unavailable:
  true }` with no `retryAfterSeconds`, so a caller that builds a "wait N seconds" message does not
  type-check until it handles the outage.
- **No per-instance cache in front of the row.** One was tried in review to keep a flood on one key
  off the database, and removed: it outlived the row it copied. Every check is one upsert.

Ordering is a constraint, not a preference: the table must exist in production before the code
deploys, or every registration is refused.
