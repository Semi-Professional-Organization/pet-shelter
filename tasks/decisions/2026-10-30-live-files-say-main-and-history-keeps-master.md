# Live files say `main`, and history keeps `master`

**Decided:** 2026-10-30

The repository moved to the Semi-Professional-Organization org on 2026-10-28 and its default branch
was renamed from `master` to `main`. Four choices from the change that followed, each reversible:

- **History keeps `master`.** `tasks/decisions/`, `tasks/archive/`, `tasks/lessons/`,
  `docs/archives/` and the `tasks/open/` entries record what was true when written, so about 100
  files still say `master` on purpose. The one exception is the step-7 proposal in `tasks/open/`,
  whose quoted text is meant to be pasted into `CLAUDE.md`.
- **Orient counts against `origin/main` only, not `origin/HEAD`.** `origin/HEAD` is the general
  answer, but in a clone made before the rename it still names a frozen `origin/master`, and plain
  `git fetch` never moves it. Trusting it reported a wrong and growing ahead/behind in every
  session. Such a clone gets one line pointing at the repair steps in CONTRIBUTING rather than a
  command: three review rounds showed that the right command depends on how the clone was made
  (full, single-branch, extra refspecs), which orient cannot tell apart reliably. The literal is
  marked with a `ceiling:` in `scripts/agent/orient.mjs`.
- **CI's push trigger drops `master`.** Keeping it looked like a signal for a clone made before the
  rename pushing its local `master` (which recreates the branch), but push runs share a group per
  commit, so such a push of main's tip would cancel main's own run. The real guard is in settings:
  ruleset "Basic" targets `~DEFAULT_BRANCH` (read over REST on 2026-10-28 and 2026-10-30, with
  `rules/branches/main` listing all six checks), so a recreated `master` is unprotected, and only
  blocking its creation, plus pointing Vercel at `main`, closes that. Both are owner steps, tracked
  in `tasks/open/the-first-ledger-mirror-on-main-and-production-deploys-are-unobserved.md`.
- **`suggest.mjs` keeps `master` as a URL stopword and does not add `main`.** `main` is also a
  content word in issue text, and the similarity heuristic was out of scope.
