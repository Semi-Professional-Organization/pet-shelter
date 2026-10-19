# Claim: CI speed and master protection

**Status:** open · opened 2026-10-20

- **session:** 762ac182-f74a-4d11-9ebd-7f953cc8d2c1 (branch `claude/project-thread-2ne14n`, a
  separate clone; the main checkout is untouched)
- **phase:** 3 — build gate emitted; building
- **paths:** `.github/workflows/**`, `.github/dependabot.yml`, `.github/CONTRIBUTING.md`,
  `docs/reference/COMMIT_MESSAGES.md`, `tasks/**` entries this session writes. Outside the tree:
  the repository ruleset "Basic" (id 20886052) and the Dependabot alert settings. The sponsor
  repository and its test were released on 2026-10-20; see "Scope change" at the end.

## Phase 0 — frame

- **Problem:** CI takes 2.5–4.5 minutes with the test job always the critical path, and nothing
  stops a red pull request, or a direct push, from reaching `master`, which Vercel deploys.
- **Claim:** cache the sponsor seed hashes the way `userStore.ts` already caches staff seeds,
  because the global `beforeEach` re-derives three scrypt hashes before every one of 2,251 tests;
  point the existing ruleset at the default branch with the six checks every PR already reports;
  and harden the workflows where the evidence shows a gap.
- **frame-confidence:** high — the owner approved this plan in the project thread on 2026-10-20
  ("nice please do"), after the measured audit in `ci-review-2026-10-19.md`.

## Phase 1 — assumption stack

Searched first: `tasks/decisions/` and `tasks/open/` for ruleset, branch protection, required
check, dependabot, scrypt and seed hashing. Nothing decided; one open entry bears on A2
(`tasks/open/unit-suite-is-order-dependent-in-both-directions.md`, job 1).

- **A1 [UNKNOWN]** The ruleset blocks only red pull requests. Every PR reports all six required
  contexts under exactly these names, including the `Vercel` commit status. — invalidates the
  design if: a green PR reports `BLOCKED` and nobody can merge. Names observed on PR #128's head
  and on `master`'s tip; the ruleset's evaluation of them is not.
- **A2 [MEASURED]** The slow work in the shared `beforeEach` is the sponsor seed hashing, and
  caching it cuts summed test time by far more than 30%. — evidence: the same probe, on this
  machine, `test:all` went from `Duration 174.61s (... tests 1507.74s ...)` to
  `Duration 98.71s (... tests 619.64s ...)`. CI's own log agrees on the per-test cost
  (run 39274781525): `tests/unit/adminPetsAuthorization.test.ts (8 tests) 1880ms`, about 235 ms a
  test for assertions on in-memory data, because Vitest counts the hook in each test's duration.
  **Not claimed:** that this settles job 1 of the open entry, the `Hook timed out in 10000ms`
  failures under load. Those land one per file, which fits the *first* hook in each file (cold
  dynamic imports) rather than the per-test hashing, and the first hook still does the imports.
  Testing it would mean loading this machine on purpose while two other sessions run their suites
  on it, which produces exactly the false reds that entry describes. ASSERTED, so it stays open.
- **A3 [MEASURED]** Caching the seed hashes changes no test outcome. — evidence: a throwaway probe
  off `ade1869` ran `test:all` at `2251 passed (2251)` on 2026-10-19.
- **A4 [UNKNOWN]** A `Commit messages` job in its own workflow, triggered on `edited` as well as
  pushes, re-evaluates the current title and is the only check with that name. — invalidates:
  the required check goes stale after a title edit, or two checks share the name.
- **A5 [ASSERTED]** Moving to `actions/checkout` v7, `setup-node` v7, `upload-artifact` v7 and the
  `ubuntu-24.04` image leaves every step's behaviour unchanged. — cheap check: CI on the PR. The
  release notes list only the Node 24 runtime, a separate credentials file, and ESM packaging. The
  failure-only `upload-artifact` step cannot be exercised by a green run.

Stopped there. Dependabot's title style (source code plus `master` history say it will capitalize)
would only degrade the design: a wrong guess costs one manual title edit.

## Phase 1 — fence sweep

- **F1** `ci.yml`'s `commits` job moves to its own workflow. It protects commit and title hygiene;
  both checks are kept as they are. New: the job also runs on title edits, and PRs that
  Dependabot opened skip the commit audit. Their commits never reach `master` under squash-only
  merging, and their titles are still linted.
- **F2** `cancel-in-progress: true` on every ref becomes PR refs only. It protects runner time on
  superseded commits. On `master` every commit is a production deploy, and 13 of the last 100
  `master` runs were cancelled by a newer merge, so 13 deploys never got a verdict. Runner time is
  free for a public repository.
- **F3** Tag pins (`@v4`) become SHA pins. Tags gave readability and silent minor updates;
  Dependabot's `github-actions` updates replace both, and keep the version as a comment.
- **F4** `ubuntu-latest` becomes `ubuntu-24.04`. The label gave automatic image upgrades. The
  threat now is a mixed fleet: the label moves to Ubuntu 26.04 gradually from 2026-10-19 to
  2026-11-19 (actions/runner-images#14748), so two runs of one commit could see different images.
- **F5** The ruleset's empty branch condition becomes `~DEFAULT_BRANCH`. No decision or open entry
  mentions leaving `master` open on purpose. The ruleset was created at 17:35:14.658 on 2026-08-15
  and last updated 17 ms later, so it was never edited. The last direct push to `master` was
  `5b2672a` on 2026-09-15; every first-parent commit since 2026-09-21 is a squash merge.
- **F6** Merge commits become disallowed. The last one was `a8847d5` on 2026-09-21. `ci.yml`
  already documents squash as the policy, and a `Merge pull request …` subject fails the repo's
  own commit standard.
- **F7** `playwright install --with-deps chromium` becomes `--only-shell`. The full Chrome build
  serves headed and new-headless runs. `playwright.config.ts` uses `devices["Desktop Chrome"]`
  with no `channel`, which runs the headless shell.
- **F8** `persist-credentials` becomes `false` in `ci.yml`. It protects later git operations that
  need auth, and no `ci.yml` job runs one: the commit audit reads local history only.
  `ledger-issues.yml` keeps the default, because its script runs `git fetch`.

## Build Gate — CI speed and master protection  ·  lane: GRAVE  ·  branch: claude/project-thread-2ne14n

### Phase 0 — frame
- [x] `Problem:` CI takes 2.5–4.5 minutes with the test job always the critical path, and nothing
      stops a red pull request, or a direct push, from reaching `master`, which Vercel deploys.
- [x] `Claim:` cache the sponsor seed hashes as `userStore.ts` caches staff seeds; point the
      existing ruleset at the default branch with the six checks every PR already reports; harden
      the workflows where the evidence shows a gap.
- [x] `frame-confidence:` high — the owner's approval in the project thread on 2026-10-20.

### Phase 1 — stack + fences
- [x] Assumption stack above, five entries, ordered by which would hurt most to be wrong about.
- [x] Memory searched first: `tasks/decisions/` and `tasks/open/` for ruleset, branch protection,
      required check, dependabot, scrypt, seed hashing. Nothing decided; one open entry bears on A2
      and is cited there, not re-derived.
- [x] Fence sweep complete: F1–F8 above, each with what it protected and why that is not lost.

### Phase 2 — falsification
- [x] **RAW EVIDENCE for A1**, the highest-ranked entry that is not MEASURED. This covers the half
      that can be tested before the ruleset changes: that every PR reports these six contexts by
      these names. The other half, how the ruleset evaluates them, is kill condition K-A1b.
      Command: for the 15 most recently merged PRs, the `Vercel` status state on the head commit,
      and the number of distinct check-run names from app 15368 (GitHub Actions).
      Output:
      ```
      #137 vercel=success actions_checks=5
      #136 vercel=success actions_checks=5
      #128 vercel=success actions_checks=5
      #119 vercel=success actions_checks=5
      #114 vercel=success actions_checks=5
      #113 vercel=success actions_checks=5
      #109 vercel=success actions_checks=5
      #104 vercel=success actions_checks=5
      #103 vercel=success actions_checks=5
      #102 vercel=success actions_checks=5
      #100 vercel=success actions_checks=5
      #94 vercel=success actions_checks=5
      #93 vercel=success actions_checks=5
      #89 vercel=success actions_checks=5
      #88 vercel=success actions_checks=5
      ```
      and, on PR #128's head, the names themselves:
      ```
      Vercel | success | creator=null
      Vercel Preview Comments | 8329 | vercel
      Static & architecture analysis | 15368 | github-actions
      Unit, integration & component tests | 15368 | github-actions
      Strict persistence against Postgres | 15368 | github-actions
      Commit messages | 15368 | github-actions
      Playwright golden paths | 15368 | github-actions
      ```
      **Would have shown instead, if false:** a head with no `Vercel` status (a docs-only PR that
      Vercel skips, say), or fewer than five Actions names. That PR would sit `BLOCKED` forever
      under the new ruleset. #136 and #137 are docs-only and still carry all six.
- [x] Other invalidating assumptions: A2 and A3 are MEASURED (numbers above). A4 is K-A4, evaluated
      on the live PR. A5 is ASSERTED from the release notes and is checked by the PR's own CI,
      except the failure-only `upload-artifact` step, which a green run never executes.
- [x] Kill conditions were written to `tasks/open/` and pushed in `f484ecb` before either ran.
      Outcome: pending, recorded below when evaluated.
- [x] **Failure Truth** — if the ruleset misfires, nothing broken deploys: merges block until it
      is corrected or disabled. If the seed cache were wrong, only offline demo sign-in breaks,
      because production never seeds. If a workflow change breaks, CI goes red and merges block.
- [x] **Reversibility** — the ruleset: PUT the saved state quoted in K-A1's entry, or set it to
      Disabled. Code, workflows and Dependabot: revert the squash commit. Dependabot alerts: one
      toggle in Settings → Code security.

### Hygiene
- [x] No ride-alongs: the diff is this task. The conformance linter and the layer-graph step are
      left alone and named in a note to the scripts thread, which already lists both.
- [x] Ledger: decisions written for each reversible choice; open entries for what could not be
      observed; this gate appended here.

**Not verified:** A4 [UNKNOWN] until K-A4 runs; A5 [ASSERTED], and the `upload-artifact` v7 step
specifically, since only a failing e2e run executes it; the half of A1 that is ruleset evaluation,
until K-A1 runs; that Dependabot capitalizes its titles here (reasoned from its source and this
repo's last 100 commits, not observed); that the cache settles the hook-timeout entry (not
claimed, see A2).

## Scope change — 2026-10-20, after the gate

**The sponsor seed hash cache leaves this branch.** The "Test suite redesign plan" thread is
replacing it with precomputed seed hashes on `claude/project-thread-jdktt3`. That touches the same
lines and measured faster on its machine: 85 s for the full suite, against 104 s with the cache.
The coordinator asked for the cache to be dropped here so that the two branches do not collide,
and it was, before this branch had a pull request. A2 and A3 go with that work. This branch's own
measurement of the cache, the unit project at 130.4 s before and 54.4 s after on one machine and
tree, was passed to that thread.

**One item joins, from the same thread's plan:** the Playwright report uploads on every run, not
only on failure. With `retries: 1` in CI, a test that fails once and then passes leaves the job
green and its report unuploaded, so flakiness was invisible. Uploading every run also executes the
`upload-artifact` v7 step that A5 could not otherwise reach.

Declined from that plan, with reasons sent back: caching Playwright's browsers (the measured
install step and Playwright's own CI guide, in
`tasks/decisions/2026-10-20-ci-skips-sharding-merge-queues-and-canary-releases.md`), and pinning
Node through `.nvmrc` before production's version is known
(`tasks/open/node-versions-differ-between-dev-ci-and-production.md`).
