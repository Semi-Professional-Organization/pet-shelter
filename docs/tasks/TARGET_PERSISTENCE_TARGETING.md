# Target — Persistence Targeting

**Date**: 2026-08-28
**Branch**: `feat/tnrm-rehabilitation`
**Predecessor**: `TARGET_SCHEMA_TYPE_INTEGRITY.md` §2.1 — the live-Postgres verification stream
**Baseline at authoring**: `npx tsc --noEmit` clean · `npm run lint` 0 errors · `npm test` 537/537

> **Scope**: one question, asked of every code path that opens a database connection — *which
> database is this, and does the rest of the codebase agree?*
>
> The predecessor stream found that `npm run db:push` and `npm run db:seed` resolved **different
> databases** and both exited 0, with the push landing on a hosted Neon branch marked
> `NEON_BRANCH=production`. That specific pair is fixed (`prisma/env.ts`). What is not fixed is the
> **class** of defect: several modules independently decide what "no database configured" means, and
> they decide it differently. Every remaining item below is an instance of that disagreement.
>
> This is deliberately not a normalisation or typing target. `TARGET_SCHEMA_TYPE_INTEGRITY.md` P-A
> through P-D still hold and are still ranked correctly; they are about what the columns *are*. This
> one is about whether the connection is pointed anywhere real.

---

## 1. 🔴 Why this is next

The predecessor target's §2 carried a standing warning that the donation ledger had **never been
verified against real Postgres**. Closing it surfaced something worse than an unverified path: the
codebase contains **three different answers** to "is there a database?", and they contradict.

| Module | How it decides | Result when `DATABASE_URL` is unset |
|---|---|---|
| `src/lib/server/donationLedger.ts:isLedgerPersistent` | `Boolean(process.env.DATABASE_URL)` | in-memory ledger |
| `src/lib/server/prisma.ts:13` | invents `postgresql://…@localhost:5432/…` | tries to connect to localhost |
| `src/lib/persistenceMode.ts` | `STRICT_PERSISTENCE === "true"` | rethrows or falls back to fixtures |

A Tier-3 integration test written today inherits all three at once. That is not a hypothetical: it
is exactly how a probe intended to exercise Postgres can pass while touching an array in-process,
which is the failure the whole Tier-3 design exists to prevent.

None of this produces a type error or a test failure today. It produces **confident wrong answers**,
which is the same category the predecessor target was written for.

---

## 2. ✅ What landed in the predecessor stream — do not redo

| Landed | Where |
|---|---|
| One env/URL resolver shared by the Prisma CLI and the seed | `prisma/env.ts` |
| Seed refuses a non-local target (`ALLOW_REMOTE_SEED=true` overrides) | `prisma/env.ts`, `prisma/seed.ts` |
| Localhost-pinned commands that never read `.env.local` | `db:up`, `db:down`, `db:push:local`, `db:seed:local`, `test:db` |
| Tier 3b — the only suites that talk to real Postgres | `tests/integration/db/`, `vitest.config.mts` |
| Probes refuse a non-local host before opening a connection | `tests/integration/db/support/database.ts` |
| Snapshot rationale on `AdoptionApplication` / `AuditLog` (P-E) | `prisma/schema.prisma` |

⚠️ **The Tier-3b suites have never been run green.** They are written, wired, and verified to *fail
correctly* when no database is present — that is a different claim from "the ledger is verified
against Postgres", which remains open. See §3 P-0.

---

## 3. The work, ranked

### P-0 — Run the Tier-3b suites 🔴

Everything else here is speculative until this runs. The harness exists; the run does not.

```
npm run db:up
npm run db:push:local && npm run db:seed:local
npm run test:db
```

**Blocked on the environment, not the code.** Docker Desktop 29.3.1 is installed and its backend
starts, but every `wsl` invocation returns `Wsl/CallMsi/Install/REGDB_E_CLASSNOTREG`, and the only
Docker context is `desktop-linux`, which requires WSL2. No native Postgres on the host either —
nothing on `:5432`, no service, no `psql`. Repair needs an **elevated** shell (`wsl --update`, or
`wsl --install --no-distribution`) and a Docker Desktop restart. Windows 11 **Home** rules out the
Hyper-V backend.

Expect the first green run to find real defects. Two are worth predicting so they are not mistaken
for flakes:

- `Pet.galleryImages` and `tags` are `String[]`. Prisma's array handling over `@prisma/adapter-pg`
  is the least-exercised part of this schema.
- `receiptScopeFor` computes the month in `Asia/Kuala_Lumpur` while `issuedAt` is stored UTC. The
  probe pins a fixed instant, so a mismatch surfaces as a scope assertion rather than intermittently.

### P-1 — `prisma.ts` invents a database that nobody asked for 🔴

> **Closed 2026-10-20.** With no `DATABASE_URL`, `src/lib/server/prisma.ts` now hands out an
> offline client that refuses every query with P1001 and opens no socket
> (`tasks/decisions/2026-10-20-no-database-url-means-no-database.md`). The record below is the
> state at authoring. `prisma/env.ts` still falls back to localhost for the CLI and seed.

```ts
src/lib/server/prisma.ts:13   process.env.DATABASE_URL ||
                              "postgresql://postgres:postgrespassword@localhost:5432/pet_shelter?schema=public"
```

This is the root of the table in §1. The fallback silently converts "no database configured" into
"connect to localhost", which is a **different statement**, and it disagrees with
`isLedgerPersistent()` sitting one directory away. The consequences compound:

- Offline mode is not actually offline. It opens a pool and waits on a refused connection.
- A Tier-3 test with no `DATABASE_URL` fails against `localhost:5432` rather than reporting that no
  database was configured — indistinguishable from a genuine schema failure.
- The same literal is now written in **three** places (`prisma.ts:13`, `prisma/env.ts`,
  `docker-compose.yml`). Two are deduplicated; this one cannot import from `prisma/` because it is
  app runtime and `prisma/` is excluded from `tsconfig.json`.

Recommended: make the absence of `DATABASE_URL` explicit rather than papered over. Export
`isDatabaseConfigured()` from a single module, have the ledger and the repositories both read it,
and construct the client lazily so that no pool is opened when nothing is configured.

### P-2 — ✅ Resolved by the concurrent session, hours after this was written 🟢

**Original finding:** `vitest.config.mts` gave the `integration` project `STRICT_PERSISTENCE: "true"`
and **no** `DATABASE_URL`. Combined with P-1, the first real integration test written into that lane
would connect to `localhost:5432`, fail, and — because strict mode rethrows — go red for an
environmental reason indistinguishable from a code defect. The open question was what Tier 3 is
*for*: strict-mode semantics with no database, or a second DB-backed lane. It could not be both.

**It is now the first.** The concurrent session answered it while this document was being written,
and answered it better than the framing above:
`tests/integration/support/prismaDouble.ts` doubles the Prisma **client**, so Tier 3a asserts the
behaviours strict mode exists for — a failing query must propagate rather than silently serve
fixtures — without any server. Three suites now use it (`auditLogFlush`, `rbacAuthorization`,
`softDeleteFiltering`); `npm run test:integration` is 4 files / 40 tests green.

The resulting split is the right one, and both halves now name each other in their module comments:

| Tier | Location | Prisma | Needs a server |
|---|---|---|---|
| 3a | `tests/integration/*.test.ts` | doubled client | no |
| 3b | `tests/integration/db/**` | real client | **yes** — fails if absent |

**What still stands from this finding:** `tests/setup/integrationEnv.ts` loads `.env.local`, and it
is registered on **Tier 3b only**. Keep it that way. On a developer machine `.env.local` names the
Neon production branch, and `assertProbeTargetIsLocal()` in
`tests/integration/db/support/database.ts` is the only thing between a destructive suite and that
branch. Adding that setup file to Tier 3a would hand it a production `DATABASE_URL` it has no guard
for, and P-1's fabricated-localhost fallback would hide the mistake rather than surface it.

### P-3 — The append-only guarantee is documentation, not enforcement 🟠

`prisma/sql/donation_append_only.sql` is referenced in `prisma/schema.prisma`, in
`src/lib/server/donationLedger.ts`, and in two task docs. **Nothing applies it.** There is no
migration, no `db:push` hook, no seed step, and no npm script that runs it — confirmed by grep across
the tree.

So the `Donation` model comment's claim that deployments "want the guarantee enforced below the ORM
too" describes a file that has never been executed. For a statutory receipt series that is the gap
between a policy and a control. An auditor cannot rely on "there is no delete export" when the
database will happily accept one.

Recommended: an idempotent `db:harden:local` script that applies the trigger, run after
`db:push:local`, plus a Tier-3b probe asserting that a `DELETE` on `donations` is rejected. Cheap,
and it converts a comment into a tested property.

### P-4 — `.env.example` teaches the hazard 🟡

The template presents a Neon URL as the primary `DATABASE_URL` and mentions local Postgres only as an
inline aside. A developer following it lands exactly where the predecessor stream started: a hosted
production branch configured as the default target of every database command.

Recommended: lead with the local Docker URL, demote Neon to a clearly-labelled deployment section,
and state the `ALLOW_REMOTE_SEED` / `ALLOW_REMOTE_DB_TESTS` escape hatches so they are discoverable
before someone needs them at 2am.

### P-5 — `docker-compose.yml` declares an obsolete `version` key 🟡

`version: "3.8"` at line 1. Compose v5 (installed here) ignores it and warns. Harmless, one line,
and it is the first output anyone sees when running `npm run db:up` — delete it.

---

## 4. ⚠️ The real decisions

**1. Does offline mode stay a first-class mode?**
Recommended: **yes, but declared rather than inferred.** The app is designed to run with no database,
and `docs/architecture/LAYERS.md` L-B2 treats that as a feature. The defect is not the fallback, it
is that three modules infer it from three different signals. One `isDatabaseConfigured()`, read
everywhere, keeps the feature and removes the disagreement.

**2. Is the localhost fallback in `prisma.ts` removed or kept?**
Recommended: **removed.** It is the only one of the three that fabricates a connection target. Its
convenience — `npm run dev` working with no `.env` — is better served by an explicit startup message
naming the database, or by the absence of one.

**3. Does Tier 3 get a database, or lose `STRICT_PERSISTENCE`?**
Deliberate, not automatic. Both are defensible; what is not defensible is the current state, where
the flag promises strictness against a database that was never provided.

**4. Is the append-only trigger applied in development, or only in deployment?**
Recommended: **development too.** A control that is only ever enabled in production is a control
nobody has tested. Applying it locally is what makes the P-3 probe meaningful.

---

## 5. Step plan

Ordered so that each step is verifiable when it lands:

1. **P-0** — clear the WSL blocker, then run Tier 3b. Everything below is speculative until this is
   green, and it may reorder the rest.
2. **P-5** — delete the `version` key. One line, removes noise from every subsequent `db:up`.
3. **P-3** — `db:harden:local` + the rejected-`DELETE` probe. Small, and it exercises the Tier-3b
   harness a second time.
4. **P-1** — single `isDatabaseConfigured()`; drop the fabricated URL; lazy client construction.
   Sweep the ledger and the repositories onto it.
5. ~~**P-2**~~ — already resolved; nothing to do but keep `integrationEnv.ts` off Tier 3a.
6. **P-4** — rewrite `.env.example` last, so it documents the world as it then is.

> **A note on this document's own staleness.** P-2 was resolved by the concurrent session *within
> hours* of being written, and this file had to be corrected before anyone acted on it. Re-run the
> §1 and §3 claims against the tree before starting any item here — on this branch a target's
> baseline has a shelf life measured in hours, not days.

## 6. Acceptance criteria

- `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npm run test:all` green.
- `npm run test:db` **green**, not merely failing-correctly — the claim §2 leaves open is closed.
- Exactly one module decides whether a database is configured, and the ledger, the repositories, and
  the test tiers all read it. A grep for the hardcoded localhost URL returns `prisma/env.ts` and
  `docker-compose.yml` only.
- A `DELETE` against `donations` is rejected **by the database**, demonstrated by a test.
- With no `DATABASE_URL` set, nothing opens a connection pool, and the reason is logged once.

## 7. Out of scope

- **P-A / P-B / P-C / P-D** from `TARGET_SCHEMA_TYPE_INTEGRITY.md`. Still correctly ranked there;
  this target does not touch column types. P-C remains time-critical for the reason given there.
- **Migrations.** The project uses `db push` deliberately, and `TARGET_SCHEMA_TYPE_INTEGRITY.md` P-B
  depends on there being no migration history yet. Do not start one to solve P-3 — apply the trigger
  as a script.
- **Replacing Neon.** The hosted branch is fine; aiming *development tooling* at it by default was
  the defect, and that is fixed.
- **CI.** No workflow exists in this repo yet. Tier 3b is designed to be CI-ready — it fails rather
  than skips — but wiring a runner is a separate piece of work.

## 8. ⚠️ Coordination

`feat/tnrm-rehabilitation` has an **active concurrent writer**. During the predecessor stream it
landed `00692eb`, `fdf851f`, `0bf5e09`, `71687c1`, `1597a43`, and was simultaneously mid-refactor on
`src/lib/security/adminSession.ts` (`verifyAdminSession` → principal, +95 lines) with
`tests/unit/softDeleteAndAuth.test.ts` red, plus new component suites under `tests/components/`.

Practical rules learned the hard way there:

- It commits with `git add -A`. Stage targeted paths and check `git diff --cached` in a **separate**
  call before committing, or its in-flight work rides along in your commit.
- Its `npm install` churn makes `package.json` and `package-lock.json` transiently unparseable.
  Re-read before patching, and patch keys individually rather than rewriting the file.
- It converges on the same designs independently — it added `test:db` and the project-scoped
  `test:all` while the predecessor stream was adding them. Check before building; you may only need
  to correct a detail rather than author the thing.

P-1 and P-2 both touch `vitest.config.mts` and `src/lib/server/`, which that session is active in.
Confirm it has stopped before starting either.
