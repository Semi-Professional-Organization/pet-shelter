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

**Why this is worth an entry rather than a shrug.** A suite that reports `1580 passed` under one
schedule and 54 red under another gates nothing, and every session here runs `npm test` before
closing. The honest reading of a green run today is "green, or not yet unlucky". It also costs
real time: this was investigated twice from scratch, by two sessions, each as a suspected
regression in an unrelated change.

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
