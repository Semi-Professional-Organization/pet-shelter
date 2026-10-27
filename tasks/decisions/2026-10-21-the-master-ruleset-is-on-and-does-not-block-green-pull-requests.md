# The master ruleset is on, and it does not block a green pull request

**Decided:** 2026-10-21

The ruleset "Basic" (id 20886052) designed in
`2026-10-20-master-merges-only-green-squashed-pull-requests.md` was switched on at the owner's go on
2026-10-20, and `Production build` has since been added as the sixth required check. This records
the kill conditions registered for it before it ran, evaluated against live state, and closes the
open entry that held them.

- **K-A1′a, passed.** `gh api repos/fergeley/pet-shelter/rules/branches/master` lists `deletion`,
  `non_fast_forward`, `pull_request` and `required_status_checks` (read 2026-10-21).
- **K-A1′b and K-A1′c, passed.** `gh api repos/fergeley/pet-shelter/rulesets/20886052` reads
  `enforcement: active` with six required checks, `Production build` included. Pull request #180,
  at head `cd2438e` with all six green, reported `mergeStateStatus: CLEAN` and merged as `24fbae9`;
  #194 did the same and merged as `91205dd`. The control held too: #194 reported `BLOCKED` while
  its test job was failing, and merged only once it passed.

No restore was needed. The "not switched on yet" sentence is gone from `.github/CONTRIBUTING.md`.
