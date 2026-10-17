# Review corrected three of the same day's security decisions

**Decided:** 2026-09-08

Amends, and in two places falsifies, three entries dated the same day:

- `2026-09-08-database-tls-is-decided-by-host-not-url-spelling.md`
- `2026-09-08-a-deleted-member-loses-the-session-not-just-the-row.md`
- `2026-09-08-rate-limit-keys-carry-no-attacker-supplied-value.md`

Those entries stay as written, because they were believed when written. What follows is what an
`xhigh` review found afterwards and what changed. Every claim below was reproduced by probe before
it was accepted; none was taken on the reviewer's word.

## The deleted-member fix did not revoke the accounts that matter

**Falsified.** The prior entry claims a member deleted from a reachable database is refused. It is
not, for the five ids where it matters most. `readFallbackAuthState` calls
`userStore.findUserById`, whose in-memory fallback `ensureInitialized()` seeds with the hardcoded
demo accounts. Probe: `findUserById("usr-admin-01")` returns `{found: true, role: "SUPER_ADMIN",
status: "ACTIVE"}` with no database at all. Deleting that row from production revoked nothing.

The first fix closed the hole everywhere **except** for a hardcoded SUPER_ADMIN whose password is a
compile-time constant. Now: the fallback is refused outright when `NODE_ENV === "production"`. Its
only legitimate subjects — the seeded logins, and accounts `createUser` wrote to memory while
Postgres was down — are development artefacts. In production the reachable database is the sole
authority, which is also the honest answer to *which layer enforces this*.

## The host test was wrong in both directions

**Falsified.** `startsWith("127.") || !host.includes(".")` was too crude to be either safe or
compatible. Probed, all four:

| Host | Old | Now |
|---|---|---|
| `[2001:db8::1]` | **no TLS** — an IPv6 literal has no dot | verified TLS |
| `127.example.com` | no TLS — it starts with `127.` | verified TLS |
| `10.0.1.5`, `192.168.1.9`, `172.20.0.5` | forced public-CA verification | left alone |
| `postgres.default.svc.cluster.local` | forced public-CA verification | left alone |

The first row is the serious one: it **reintroduced the exact plaintext-over-the-internet defect
the function was written to remove**, in the one address family nothing tested. The third and
fourth would have broken every private-network deployment at handshake.

Address families are now told apart before anything is decided, literals are matched against the
private ranges, and `.local`/`.internal`/`.localdomain`/`.home.arpa` are treated as private.
`sslmode=disable` is also honoured now rather than silently overridden — it is the operator saying
so in libpq's own vocabulary, and overriding it stranded a deployment with no log line explaining
why. `sslmode=no-verify` is deliberately **not** honoured; it is the defect being removed.

## `x-real-ip` is not a platform header

**Falsified.** The prior entry and the source both asserted that `x-vercel-forwarded-for` and
`x-real-ip` "are written by the edge and overwrite anything the client sent". True of the first on
Vercel; false of the second anywhere. This repo ships `docker-compose.yml` and runs `next start`,
where nothing overwrites `x-real-ip` and it is simply attacker-supplied input — so the budget
introduced to stop an attacker resetting a key was itself keyed on a value the attacker sets.

Worse, the `"unknown"` fallback put every caller in one bucket. On any deployment setting none of
those headers that is a **shelter-wide cap of twenty sign-ins a minute**, and one person fumbling a
password behind a shared address locks out their colleagues. A limiter that denies service to the
people it protects is worse than the gap it covered.

Now: a header is believed only when something external vouches for it — `x-vercel-forwarded-for`
when `process.env.VERCEL` is set, otherwise whatever `TRUSTED_PROXY_HEADER` names. The value is
parsed with `net.isIP` before it becomes a limiter key, which also bounds the key (an unvalidated
header is an unbounded `Map` growth vector). When no address can be trusted the address budget
**does not run** — null is not a bucket.

**Operational consequence, and it is a real one:** a self-hosted deployment that sets
`TRUSTED_PROXY_HEADER` to nothing gets no address limiting, and the staff invite code is enumerable
again by varying the email. That is the honest state — an untrustworthy address cannot bound
anything — but it means the variable has to be set. Recorded on `getStaffInviteSecret()`, which is
why its 16-character minimum stays.

## The pattern under all three

Every one was a **security control that reads correctly and does nothing**, which is the same shape
as the four defects this branch set out to fix. Two of them were introduced by the fix itself. The
tests written alongside passed in all three cases, because they exercised the paths the author was
thinking about — `sslmode=require` but not IPv6, a deleted synthetic id but not a seeded one, a
spoofable header assumed unspoofable.

What caught them was an adversarial pass over the finished diff, not more care while writing it.
The new cases are in `tests/unit/security/authSessionDal.test.ts`; the production guard and the
login address budget were each mutated away and observed failing.

**Also fixed, from the same review:** `keepAliveUntilSettled` swallowed every `after()` error rather
than the out-of-scope one and now warns otherwise; `memberRowForId` claimed all five seeded ids
resolved to a role when three did not, and synthesised a name that disagreed with `TEST_ADMIN`
where the DAL now overwrites the session's; the Prisma double returned a row missing
`createdAt`/`updatedAt`/`passwordHash` that would `TypeError` in two other readers; and the suite
imported `pg-connection-string`, an undeclared transitive dependency, where `pg`'s own `Client`
resolves the same merge.

**Left open deliberately:** `sponsor-login`, `sponsor-register` and `accept-invite` carry the
identical email-only key. Named in `tasks/open/auth-endpoints-still-keyed-on-the-email-alone.md`
rather than fixed here, because they are outside this task's scope — but the argument this branch
made for also fixing `loginAction` applies to them verbatim.
