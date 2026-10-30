# Live files say `main`, and history keeps `master`

**Decided:** 2026-10-30

The repository moved to the Semi-Professional-Organization org on 2026-10-28 and its default branch
was renamed from `master` to `main`. Four choices from the change that followed, each reversible:

- **History keeps `master`.** `tasks/decisions/`, `tasks/archive/`, `tasks/lessons/`,
  `docs/archives/` and the `tasks/open/` entries record what was true when written, so about 100
  files still say `master` on purpose. The one exception is the step-7 proposal in `tasks/open/`,
  whose quoted text is meant to be pasted into `CLAUDE.md`.
- **Orient prefers `origin/main` over `origin/HEAD`.** `origin/HEAD` is the general answer, but in a
  clone made before the rename it still names a frozen `origin/master`, and plain `git fetch` never
  moves it. Trusting it reported a wrong and growing ahead/behind in every session. The literal is
  marked with a `ceiling:` in `scripts/agent/orient.mjs`, and a repair line names the fix.
- **CI keeps `master` in its push trigger.** Nothing should push to `master` any more, but a clone
  made before the rename that runs `git push` on its local `master` recreates the branch, which the
  ruleset (it targets the default branch only) does not protect. A CI run on that push is the only
  signal it happened, and it arrives after the fact: if Vercel's Production Branch still says
  `master`, that push is an unreviewed production deploy. The guard is the owner's, in settings:
  point Vercel at `main` and have the ruleset also block creating `master`. Drop `master` from the
  trigger once both are done.
- **`suggest.mjs` keeps `master` as a URL stopword and does not add `main`.** `main` is also a
  content word in issue text, and the similarity heuristic was out of scope.
