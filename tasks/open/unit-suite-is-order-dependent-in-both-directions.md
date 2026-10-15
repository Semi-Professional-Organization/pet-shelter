# The unit suite is order-dependent in both directions, and cannot currently gate anything

**Status:** open · opened 2026-09-22 · worsened 2026-10-13 · found while verifying an unrelated
change

`npm test` does not give the same answer twice. Runs 1–6 are the same 98-file unit project, across
two checkouts, within ninety minutes on 2026-09-22; run 7 is three weeks later:

| # | Tree | Result |
|---|---|---|
| 1 | worktree at `8d36ace` + an unrelated one-line repository fix | `98 passed` · `1580 passed (1580)` |
| 2 | the same worktree, same commit, only docs changed since run 1 | `14 failed \| 84 passed` · `57 failed` |
| 3 | **main checkout on `master`, none of that branch's changes** | `20 failed \| 78 passed` · `54 failed (1582)` |
| 4 | branch tree, all three projects, run by a review sub-agent | `116 files, 1819 tests`, all passed |
| 5 | branch tree merged with `origin/master` after #88 | `8 failed \| 90 passed` · `8 failed (1582)` |
| 6 | **the same merged tree as run 5, four commits of prose later** | `98 passed (98)` · `1582 passed (1582)` |
| 7 | 2026-10-13, branch off `master` `e99ebf8` + a three-line repository fix | **`59 failed \| 40 passed (99)`** · `77 failed (1589)` |
| 8 | 2026-10-14, the #77/#78/#80 branch merged with `master` `e99ebf8` | `16 failed \| 84 passed (100)` · `17 failed (1593)` |

**Run 7 is the worst by a wide margin, and it spread to a second project.** The same tree's
component suite, which gave `170 passed (170)` on 2026-09-22, gave `3 failed | 8 passed` ·
`16 failed (170)` — `SponsorshipModal` and `DonationReceiptIntegrity`. So this is not confined to
the unit project. Every sampled file still passes alone: `tests/unit/prismaEnv.test.ts` → `13
passed (13)`.

**CI passed the same commit.** All seven checks on PR #100 were green, including
`Unit, integration & component tests`, and master's own CI run after the merge was green. Whatever
this is, it does not reproduce on a GitHub runner — which is why a green CI is not evidence that
the local failure is noise, and a red local run is not evidence of a regression. Check the named
files in isolation before believing either.

Runs 5 and 6 are the pair to look at first. Same suite, same machine, same working tree apart from
comments and ledger files that no test imports — `8 failed`, then all green. Nothing was fixed in
between. Whatever this is, it is not in the source.

Run 3 carries none of that branch's changes, so this is on `master`, not on any one branch.

**The failing set is not stable either.** Runs 2 and 3 failed on authorization —
`tests/unit/volunteerForm.test.ts`, `tests/unit/adoption/applicationWorkflow.test.ts`. Run 5
failed on a *disjoint* set, exactly one test in each of eight unrelated files:
`donationQrAudit`, `e2eDatabaseIsolation`, `layerBoundaries`, `rehabNeeds`, `secrets`,
`sqlSafety`, `supporterTier`, `security/publishedStaffPasswords`. One failure per file, across
domains with nothing in common, is the shape of interference rather than of a defect.

**It is order-dependent in both directions, which is the part worth knowing.** Two measurements,
both taken directly:

- The eight files from run 5, re-run together and alone:
  `npx vitest run --project unit <the eight paths>` → **`8 passed (8)` · `156 passed (156)`.**
  They fail only inside the full run.
- `tests/unit/volunteerForm.test.ts`, run alone on *both* trees:
  **`4 failed | 10 passed (14)`.** It fails only *outside* the full run.

So one group needs the full suite to pass and the other needs to avoid it. A single cause is not
obvious and should not be assumed; there may be two.

For the second group there is at least a concrete lead. `volunteerForm.test.ts` mocks
`@/lib/security/session`'s `getCurrentSession`, but `getVolunteerFormLinks` resolves its caller
through `getVerifiedSession()` from `@/lib/security/dal`, which re-reads the member row via
`findUserById` — Prisma first, then the in-memory seed — and returns null when nothing vouches
for the id. The test's id is `user-test-01`, which no seed holds, and the observed error is

    AssertionError: promise rejected "UnauthorizedError: Authentication required…"
     ❯ assertHasPermission src/lib/security/rbac.ts:148:11
     ❯ getVolunteerFormLinks src/actions/settings.ts:126:3

**ASSERTED, not measured:** that explains the isolated failure and does not explain why the full
suite passes it, so it is a lead and not the diagnosis.

Load is the obvious suspect for the first group and is untested. Runs 2, 3 and 5 were taken with
eight concurrent agent sessions on the machine — 70 `node` processes were counted during run 5,
13 of them vitest workers for this one project — and runs 1, 4 and 6 with fewer. Several of the
run-5 files are env-sensitive (`secrets`, `e2eDatabaseIsolation`, `publishedStaffPasswords` all
use `vi.stubEnv`), and `layerBoundaries` is one of the tree-walking guards whose timeout
`vitest.config.mts` already had to raise to 20s for exactly this reason.

**A concrete lead, from a reviewer who hit it on the components project:** its three failures
were all `Hook timed out in 10000ms` inside the shared `beforeEach` in `tests/setup/nextMocks.ts`.
`vitest.config.mts` raises `testTimeout` to 20s for that project and leaves **`hookTimeout` at
its 10s default** — so a slow setup hook fails while the test body it belongs to would still have
had time. That is per-project config, it would bite any suite whose setup hook is slow under
load, and it is the first mechanism proposed here that would produce one failure in each of
several unrelated files.

**Corroborated 2026-10-13, and it is now the leading explanation.** A review sub-agent running
`--project integration --project unit` saw `1668 passed, 13 failed`, and reported **all 13 as
`Hook timed out in 10000ms` at `tests/setup/nextMocks.ts:284`** — the shared `beforeEach`. Three
re-run in isolation passed. That is the predicted signature, at the predicted line, in the
project the lead had not been checked against. It also explains the shape that looked so odd in
run 5: one failure per file across unrelated domains is what a slow shared setup hook produces,
because the hook is the only thing those files have in common.

`nextMocks.ts`'s `beforeEach` imports the repositories dynamically on every test, which is what
makes it slow enough to matter under parallel load — the import is deliberate (a static one would
instantiate Prisma before a test file's own `vi.mock` registers), so the fix is more likely
raising `hookTimeout` than removing the work.

**Observed in `components` and `integration` too, 2026-10-13.** The title says "unit suite"; it is
wider than that. On the bulletins branch (`worktree-bulletins-76`, master merged at `e99ebf8`),
with six other sessions running on the same machine:

| Run | Result |
|---|---|
| `npm run test:all`, a review sub-agent running concurrently | `65 failed \| 1903 passed (1968)` |
| `npm run test:all`, same tree, nothing else changed | `4 failed \| 1964 passed (1968)` |

The second run's four were one test each in four unrelated files, two projects:
`integration/softDeleteFiltering`, `components/home`, `components/PetCard`,
`components/PetChooserCarousel`. **All four pass in isolation** — 25 passed for the three component
files together, 17 for the integration one. So the one-failure-per-file shape this entry already
describes is not confined to the `unit` project, and the recommendation at the bottom applies to
all three.

**CI is green on the same commit, which narrows this to the local environment.** PR #103's run
`38428838326` on `af0fc2c` — the exact tree that gave `65 failed` and then `4 failed` locally —
passed every job: "Unit, integration & component tests" in 2m46s, plus strict-persistence,
Playwright and static analysis. So whatever this is, it does not reproduce on a clean single-job
runner, and the two local readings were both wrong about the code.

It rules out the source and anything in the committed tree, and points at the developer machine:
concurrent sessions sharing one checkout, several vitest processes competing, a shared `.vite`
cache under `node_modules/`.

**It also corroborates the `hookTimeout` mechanism proposed above**, and was measured before that
entry was read, so the two are independent. A hook that times out under load is exactly what would
pass on a single-job runner with a cold cache and fail on a laptop running seven sessions — and it
predicts the one-failure-per-file shape, which is what both of these local runs produced. If the
hook timeout is raised, this pair is the cheap regression check: the same commit must stay green on
CI and stop varying locally.

Practical consequence meanwhile: a red local run is weak evidence and a green CI run is the one to
trust, which inverts the usual order.

Load looks like a factor rather than the cause: the 65-failure run had a review sub-agent issuing
its own `vitest` commands against the same working tree. That is worth separating from the
order-dependence proper, because the two have different fixes — one is a scheduling bug, the other
is concurrent processes sharing a checkout.

**Why this is worth an entry rather than a shrug.** A suite that reports `1580 passed` under one
schedule and 54 red under another gates nothing, and every session here runs `npm test` before
closing. The honest reading of a green run today is "green, or not yet unlucky". It also costs
real time: this was investigated twice from scratch, by two sessions, each as a suspected
regression in an unrelated change.

**One named mechanism, added 2026-09-22 by a third session investigating the same thing a third
time.** `tasks/open/unit-tests-write-to-whatever-is-on-localhost-5432.md` identifies a cause that
is specific, reproducible on demand, and produces failures of exactly this shape: with no
`DATABASE_URL`, `createPrismaClient` falls back to a hardcoded `localhost:5432` string and
`insertServerPet` writes to the database *before* the mirror regardless of what
`isDatabasePersistent()` says. So the unit tier's offline behaviour depends on nothing listening
on that port — and on a machine running several agents, something often is. Port open: six
`Unique constraint failed on the fields: (id)` failures in `petCatalog`. Port closed, same commit:
green. That is not the whole of this entry — it does not explain the authorization failures in
runs 2 and 3, or the `hookTimeout` shape — but it is one real cause, and it is testable in seconds
(`Get-NetTCPConnection -LocalPort 5432`) before anyone re-derives the rest.

**A fourth angle on the hook timeout, and a discriminator worth having (2026-10-14).** A session on
PR #42 ran the full unit project and got `17 failed | 1576 passed` across 15 files, then `1 failed`
on a re-run minutes later with nothing changed. Across the whole output: **zero `AssertionError`s**,
with `Error: Hook timed out in 10000ms` as the only failure mode. The casualties included
pure-arithmetic tests — "computes exact months between dates" cannot take eleven seconds from code.
Their run-to-run variance tracked how many agent sessions were compiling at the time.

That gives a cheap triage rule for anyone who hits this: **grep the output for `AssertionError`
first.** None means contention, and the file list is noise. One or more means read those, and only
those. Used on this branch the same day: a run of 7 failures contained exactly one
`AssertionError`, which was a real defect in a lesson file's `**Learned:**` line; the other six were
hook timeouts in files the diff never touched.

The same session also withdrew an earlier guess that a `30 failed` run came from `test:all` running
the integration project without `STRICT_PERSISTENCE`; the stack they saw was a Prisma error inside
`insertServerPet` from `tests/unit/pets/petCatalog.test.ts`, which the `localhost:5432` mechanism
above explains and names. Their guess should not be cited.

## A third category, found 2026-10-13: a test that fails locally and passes in CI

`tests/integration/rbacAuthorization.test.ts` → "rejects an anonymous caller" is **not**
order-dependent. It fails run alone:

    npx cross-env STRICT_PERSISTENCE=true vitest run --project integration \
      tests/integration/rbacAuthorization.test.ts
    → 1 failed | 16 passed (17)

And it fails *worse* on the main checkout at `master` than on a branch — `2 failed | 15 passed`,
the second being "rejects a VOLUNTEER by role". Yet CI passes that file on the same commits.

So there are two distinct problems wearing one costume, and the entry's title only names the
first: a hook timeout that makes arbitrary files fail under load, and at least one test whose
result depends on something about the local machine that a GitHub runner does not have. The
second is the more worrying of the two — it means a local run can be red on a test CI calls green,
so neither environment can be trusted alone. Not diagnosed; `resolveDatabaseSsl` and
`resolveDatabaseUrl` failures in run 7 point the same way, since both read env the runner sets
differently.

## Run 8 confirms the components spread, and that the repro still holds there

Run 7 found the component suite affected but did not re-run its failures together. Run 8 did, on a
different tree and day, and the isolation repro behaves exactly as it does for the unit project:

- `npx vitest run --project components` → **`10 failed | 3 passed (13)`** · `12 failed (195)`.
  One failure per file across ten unrelated files: `AdminLoginPage`, `AdoptionForm`,
  `DonationDeepLink`, `DonationReceiptIntegrity`, `home`, `homeMalay`, `PetCard`,
  `PetChooserCarousel`, `SponsorshipModal`, `usePetGalleryController`.
- **The same ten files, re-run together: `10 passed (10)` · `168 passed (168)`.**
- Unit, same tree: `16 failed | 84 passed`; **those sixteen files alone: `369 passed (369)`.**

**Every one of run 8's 29 failures was a timeout, and not one was an assertion.** Applying the
`AssertionError` triage rule above to the captured output:

| Tier | Failures | `AssertionError` | `Hook timed out in 10000ms` | `Test timed out in 20000ms` |
|---|---|---|---|---|
| unit | 17 | 0 | 17 — one shared block, `tests/setup/nextMocks.ts:284` | 0 |
| components | 12 | 0 | 10 — one shared block | 2 |

Read the counts off the *test* list, not the error blocks: Vitest prints identical failures once,
beneath every test that hit them, so `grep -c "timed out"` counts blocks. An earlier version of this
section made exactly that mistake and reported "three of the twelve component failures" as hook
timeouts, which understated the mechanism's reach and wrongly implied an assertion-shaped remainder.
There is no remainder in this run.

Two consequences for job 1 below. Setting `hookTimeout` for the components project would clear 10
of its 12, not all of them: the other two are test *bodies* overrunning the 20s `testTimeout`
under the same load, so the fix there is load, not a setting. And `npm run test:all` runs all three
projects in one invocation — the most loaded schedule this repo has, and the command the close-out
asks for.

**Settles when:** all three are addressed, and they are probably three jobs rather than one:

1. **The hook timeout.** `vitest.config.mts` sets `hookTimeout` for the projects whose shared
   `beforeEach` does real work, and the full unit project then runs three times *under load* with
   matching counts. This is the cheapest and now has a named mechanism and a line number.
2. **`rbacAuthorization.test.ts`.** The isolated repro above fails on `master` today with no
   setup. Decide whether the test or the code is wrong, and why CI disagrees.
3. **The `volunteerForm.test.ts` mock/DAL mismatch**, the original lead, still ASSERTED: it
   explains the isolated failure and not why the full suite passes it.

Until then, **a green `npm test` in this repo is not evidence, and a red one is not necessarily a
regression** — and as of run 7 a green *CI* does not clear a locally red test either. Check the
named files in isolation before believing any of the three.
