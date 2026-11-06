# Security controls that read correctly and do nothing

Seven defects found and fixed on `feature/agent-2-security` (2026-09-08), written up for the
property they share rather than for the subsystems they lived in.

**All seven were security controls present in the source, reviewed by a human at some point, and
inert at runtime.** None broke a test when it stopped working. None logged anything. Each was
visible only to an attacker, or only in production, or only on an address family nobody typed.

Two of the seven were introduced *by the fix for the other five*, which is the finding this page
exists for.

---

## 1. The seven

### 1.1 `rejectUnauthorized: false` that was already being ignored

```ts
const isSsl = connectionString.includes("sslmode=require") || connectionString.includes("neon.tech");
ssl: isSsl ? { rejectUnauthorized: false } : undefined,
```

The obvious reading — "certificate verification is disabled" — was **wrong wherever the substring
matched**. `pg` merges the *parsed* connection string over the explicit config
(`node_modules/pg/lib/connection-parameters.js:60`):

```js
config = Object.assign({}, config, parse(config.connectionString))
```

`pg-connection-string` emits `ssl: {}` for `sslmode=require`, which replaced the explicit object
entirely. The setting was inert exactly where it was written to apply.

**The live defect was the opposite one.** Where the substring did *not* match — a hosted URL written
`sslmode=verify-full`, or any non-Neon managed Postgres — `ssl` was `undefined` and the connection
crossed the public internet **unencrypted**. Unverified TLS is bad; no TLS is worse, and it was the
case the sniff handled most quietly.

> **Transferable:** when you pass both `connectionString` and discrete options to `pg`, the string
> wins. Strip the parameter you intend to control, or your explicit option is decoration. Verify
> with `new Client({...}).connectionParameters.ssl` — it resolves the merge without opening a socket.

> **Also:** `pg-connection-string` currently treats `prefer`/`require`/`verify-ca` as aliases for
> `verify-full` and **warns at runtime that this changes** in its v3 / `pg` v9. Code that leans on
> the URL's spelling gets silently downgraded on that upgrade. Code that sets `ssl` explicitly
> does not.

### 1.2 A rate-limit key the attacker chooses

```ts
checkRateLimit(`register:${email}`, 5, 60000);
```

`email` is submitted by the caller, so the budget resets on every request: walking
`STAFF_INVITE_SECRET` needed only a fresh address per guess. `src/lib/security/secrets.ts` had
described this hole in a comment, accurately, and nobody had closed it.

**The specified fix did not work.** `register:${ip}:${email}` was measured throttling **zero** of
twelve invite-code guesses.

> **Transferable:** a rate-limit key containing *any* attacker-supplied component bounds nothing,
> and **adding a second component makes it worse, not better**. A composite key is a *narrower* key:
> more distinct keys, more buckets, more total budget. Widening a key never narrows what it limits.
> The fix is always a *separate* budget whose key holds nothing the caller picks.

Five endpoints had this shape: `loginAction`, `registerAction`, `sponsorLoginAction`,
`registerSponsorAction`, `acceptInvitation`. The last is the sharpest — the emailed token *is* the
credential, and the email beside it reset the budget on every guess.

The per-account key is still worth keeping. It bounds how hard *one* account is attacked. It simply
cannot see the attack that works on a directory: one password tried once against every address in
turn, which never spends a second attempt on any single key.

### 1.3 A session that outlived the account

```ts
// No row: either a demo/in-memory account or a deleted user. Fall through
// to the cookie rather than locking out the seeded demo logins.
if (!member) return session;
```

The comment names the hole and ships it. A member deleted from a **reachable** database kept every
capability their cookie asserted for its full 24 hours — and a `SUPER_ADMIN` cookie keeps asserting
`SUPER_ADMIN`. This inverted the single guarantee the DAL exists to provide.

It could not simply be deleted: the seeded demo logins have no `users` row on a reachable-but-unseeded
database, and removing the fallback locks every local session out of `/admin`.

> **Transferable:** the question to narrow to is not *"is the row missing?"* but *"does anything
> still vouch for this identity?"* — and the authority to ask is whatever authenticated them.

### 1.4 An audit write nobody owned

`recordAuditLog` is synchronous by contract and its Prisma call floated. On a serverless host the
invocation freezes when the response is sent, so the row is lost — in production only, where no test
runs. `after()` from `next/server` hands the promise to the platform's `waitUntil`.

> **Transferable:** `after()` **throws** `` `after` was called outside a request scope `` anywhere
> there is no request — unit tests, seed scripts, module init. Guard it. But guard it *narrowly*:
> a bare `catch {}` also swallows the case where `after()` refused inside a real request, which is
> precisely the failure the control exists to prevent, and returns you to silence.

### 1.5 A host test wrong in both directions *(self-inflicted)*

The fix for §1.1 classified hosts with:

```ts
return h.startsWith("127.") || !h.includes(".");
```

| Host | Classified | Consequence |
|---|---|---|
| `[2001:db8::1]` | internal | **No TLS at all** — an IPv6 literal contains no dot |
| `127.example.com` | internal | A public DNS name read as loopback |
| `10.0.1.5`, `192.168.1.9`, `172.20.0.5` | remote | Private Postgres forced to present a public CA |
| `postgres.default.svc.cluster.local` | remote | Every Kubernetes deployment broken at handshake |

The first row **reintroduced the exact plaintext defect the function was written to remove**, in the
one address family nothing tested.

> **Transferable:** tell the address families apart *before* deciding anything. `!host.includes(".")`
> is not "is a short name" — it is also every IPv6 literal. `startsWith("127.")` is not "is
> loopback" — it is also `127.example.com`. Match literals against the actual private ranges.

### 1.6 A limiter keyed on a header the attacker sets *(self-inflicted)*

The fix for §1.2 read `x-real-ip`, documented in-source as "written by the edge and overwrites
anything the client sent". True of `x-vercel-forwarded-for` **on Vercel**. False of `x-real-ip`
anywhere. This repo ships `docker-compose.yml` and runs `next start`, where nothing overwrites it.

So the budget added to stop an attacker resetting a key was itself keyed on a value the attacker
sets — the §1.2 defect, rebuilt one layer up.

Its fallback was worse. Unattributable callers shared the string `"unknown"`, making the budget a
**site-wide cap**: twenty sign-ins a minute for every user at once, and one person fumbling a
password behind a shared NAT locking out their colleagues.

> **Transferable:** a forwarding header is only as honest as the hop that wrote it. `x-forwarded-for`
> is *appended to*, so a client sending its own puts an attacker-chosen value leftmost. Believe a
> header only when something external vouches for it — the platform (gated on actually running
> there; a client can send that header name too) or explicit operator configuration.
>
> **And: prefer no control to a fake one.** Where no address can be trusted, run no address budget.
> `null` is not a bucket. A limiter that denies service to the people it protects is worse than the
> gap it was covering.

### 1.7 A revocation that could not revoke *(self-inflicted)*

The fix for §1.3 asked `userStore.findUserById`, whose in-memory fallback `ensureInitialized()`
seeds with five hardcoded accounts — `usr-admin-01` among them: SUPER_ADMIN, ACTIVE, with a hash of
a compile-time password. Probed:

```
findUserById("usr-admin-01") -> { found: true, role: "SUPER_ADMIN", status: "ACTIVE" }
```

with no database at all. Deleting that row from production revoked nothing. **The hole was closed
everywhere except the five ids where it mattered most.**

> **Transferable:** a degraded-mode fallback store is an authentication bypass wearing a helpful
> face. Any offline/seed fallback consulted by an authorization path must be refused in production,
> where the reachable database is the only authority. Name the layer that actually enforces the
> boundary — dev behaviour is not proof when production's connection is a different one.

---

## 2. Why none of them failed a test

Each had tests. The tests passed. They passed because they exercised **the cases the author was
thinking about**:

- `sslmode=require`, never an IPv6 literal.
- a deleted *synthetic* id, never a *seeded* one.
- a header assumed trustworthy, never probed for who can write it.

This is not a gap in rigour. Every assertion in the first commit was mutation-tested — reverted to
the wrong fix and observed failing. That is a real and worthwhile discipline, and it is **structurally
incapable** of finding these:

> Mutation testing proves your test discriminates against the fix you *considered*.
> It says nothing about the case you never imagined.

The three self-inflicted defects were all "cases never imagined". They were found by an adversarial
pass over the finished diff, treating the new code as the primary suspect.

---

## 3. The method that worked

**Measure the claim before you build on it.** Every load-bearing belief here was cheap to check and
several were wrong. `pg`'s merge order, `after()`'s out-of-scope behaviour, Node's trust store, the
seeded-id revocation, the host classification — each was a throwaway test that took two minutes and
each changed the design.

**Run the specified fix and watch it fail.** `register:${ip}:${email}` was in the task as written.
Twelve guesses, zero throttled, is an argument no prose can match.

**Establish the baseline before blaming yourself — or absolving yourself.** When ten integration
tests went red, stashing the change and re-running proved they were green before (52/52 vs 42/52).
Without that, "those were probably already failing" is the comfortable and often wrong conclusion.

**Verify a review's findings by probe before accepting *or* dismissing.** Of fifteen raised, the
three serious ones were confirmed by one throwaway test file. That evidence is what made them safe
to act on — and it is equally what would have made a wrong finding safe to reject.

**When a test's premise is the vulnerability, that is a signal.** Three suites here broke on the
§1.3 fix, and one said so in its own header: *"`user.findUnique` resolving null is what makes the
DAL fall through to the cookie's own claims"* — sitting directly under *"Authorization here is real,
not stubbed."* It was not. It was resting on the hole. Fix the fixture at its source, not per suite.

**Enumerate the input space, not the inputs.** For a host classifier: both address families, the
private ranges, and names that merely *resemble* one. For anything reading a request header: who is
permitted to write it, on each deployment shape the repo actually ships.

**Make the dangerous misreading impossible.** `checkAddressRateLimit` returns
`{limited: false} | {limited: true, retryAfterSeconds}` rather than `RateLimitResult | null`
(with `{ shared: true }` it may also answer `{limited: true, unavailable: true}`, an outage). With
seven call sites, a nullable return makes each one decide what `null` means, where reading it as
*denied* locks everyone out and reading it as *allowed* is a silent no-op indistinguishable from a
working limiter. Two mistakes, one character apart. Collapsing to `limited` makes the untrusted case
read exactly as what it is: not limited, this time.

**Stale comments in security code are load-bearing.** `registerAction`'s `staffInviteCode` carried
`@deprecated Ignored` while the function enforced it four lines below — a note a reader trusts
instead of the code, on the only gate in front of applicant PII. And the first fix left the
*identical* stale comment in `secrets.ts`, the file it quoted as its evidence.

---

## 4. What is still unproven

- ~~No connection to Neon has been observed under `rejectUnauthorized: true`.~~ Observed
  2026-09-14, when local e2e runs wrote to the production branch through the strict policy;
  `tasks/decisions/2026-09-16-neon-verifies-under-strict-tls.md`. Local connections only — what the
  Vercel deployment connects to is still unobserved.
- **`checkRateLimit` is a per-process `Map`.** On a serverless host each warm instance counts
  separately, so those budgets do not bound a distributed caller. Registration's two budgets moved
  to shared state on 2026-11-05 (`checkSharedRateLimit`, #213) and fail closed when `DATABASE_URL`
  is set; with none they fall back to the per-process `Map`. The other budgets have not moved.
- **Address budgets require configuration.** With neither `TRUSTED_PROXY_HEADER` nor Vercel's edge,
  none of the five run, and each endpoint's per-email budget is all that remains. Deliberate, pinned
  by tests, and a real operational requirement for self-hosted deployments.

---

## 5. Checklist

Before calling a security control done:

- [ ] Delete the control and watch a test fail. If none does, the control is untested.
- [ ] Check whether the library you configured actually reads your configuration.
- [ ] Name every input the caller controls; none of them may appear in a rate-limit key.
- [ ] Ask who is allowed to write each request header you trust, on every deployment shape shipped.
- [ ] List the fallback stores an authorization path can reach, and what they vouch for offline.
- [ ] Enumerate the input space — both address families, the ranges, the lookalikes.
- [ ] Re-read every comment in the file you touched; a stale one is a defect.
- [ ] Run an adversarial review over your own finished diff, and suspect the new code first.

The last line is the one that mattered. Three of the seven defects on this page were found there and
nowhere else.

---

**Ledger:** `tasks/decisions/2026-09-08-database-tls-is-decided-by-host-not-url-spelling.md` ·
`2026-09-08-a-deleted-member-loses-the-session-not-just-the-row.md` ·
`2026-09-08-rate-limit-keys-carry-no-attacker-supplied-value.md` ·
`2026-09-08-review-corrected-three-of-the-same-days-security-decisions.md` ·
`2026-09-08-every-unauthenticated-auth-endpoint-spends-an-address-budget.md`

**Tests:** `tests/unit/security/authSessionDal.test.ts` — 45 cases, each discriminating one of the
above against the wrong fix.
