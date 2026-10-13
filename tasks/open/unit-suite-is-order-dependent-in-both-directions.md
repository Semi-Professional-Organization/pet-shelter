# The unit suite is order-dependent in both directions, and cannot currently gate anything

**Status:** open · opened 2026-09-22 · found while verifying an unrelated change

`npm test` does not give the same answer twice. Five runs of the same 98-file unit project, across
two checkouts, within ninety minutes:

| # | Tree | Result |
|---|---|---|
| 1 | worktree at `8d36ace` + an unrelated one-line repository fix | `98 passed` · `1580 passed (1580)` |
| 2 | the same worktree, same commit, only docs changed since run 1 | `14 failed \| 84 passed` · `57 failed` |
| 3 | **main checkout on `master`, none of that branch's changes** | `20 failed \| 78 passed` · `54 failed (1582)` |
| 4 | branch tree, all three projects, run by a review sub-agent | `116 files, 1819 tests`, all passed |
| 5 | branch tree merged with `origin/master` after #88 | `8 failed \| 90 passed` · `8 failed (1582)` |
| 6 | **the same merged tree as run 5, four commits of prose later** | `98 passed (98)` · `1582 passed (1582)` |

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
several unrelated files. Unverified against the unit project.

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

That is the most useful measurement yet for narrowing it: it rules out the source, rules out
anything in the committed tree, and points at the developer machine — concurrent sessions sharing
one checkout, several vitest processes competing, and a shared `.vite` cache under
`node_modules/`. It also means a red local run is weak evidence and a green CI run is the one to
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

**Settles when:** someone runs the two repros above — they need no setup and take under a minute
each — decides whether these are one defect or two, and fixes them; then runs the full unit
project three times *under load* and confirms the counts match. Until then, a green `npm test` in
this repo is not evidence, and a red one is not necessarily a regression: check the named files in
isolation before believing either.
