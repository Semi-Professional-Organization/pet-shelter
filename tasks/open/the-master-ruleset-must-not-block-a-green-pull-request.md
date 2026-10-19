# The master ruleset must not block a green pull request

**Status:** open · opened 2026-10-20

Kill condition for A1 in `tasks/open/CLAIM-ci-devops-hardening.md`, registered before the ruleset
changed. Immutable.

The ruleset "Basic" (id 20886052) is being pointed at the default branch with five rules: no
deletion, no force push, changes only through a pull request with no required approvals and squash
merging only, and six required checks. Those checks are `Static & architecture analysis`,
`Unit, integration & component tests`, `Strict persistence against Postgres`,
`Playwright golden paths` and `Commit messages` from GitHub Actions (integration id 15368), plus
the `Vercel` commit status from any source. There are no bypass actors.

Its state before the change, for a restore:

```json
{"name":"Basic","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"exclude":[],"include":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"}],"bypass_actors":[]}
```

- **K-A1a.** `gh api repos/fergeley/pet-shelter/rules/branches/master` must list `deletion`,
  `non_fast_forward`, `pull_request` and `required_status_checks`. If it does not, the ruleset is
  not enforcing, whatever the settings page shows.
- **K-A1b.** A pull request into `master` whose head has all six checks green must report
  `mergeStateStatus` other than `BLOCKED` (`gh pr view <n> --json mergeStateStatus`). No review is
  required, so a review cannot explain a block. If it reports `BLOCKED`, the ruleset as designed
  is wrong. Restore the state above at once, and the design returns to Phase 0.

**Settles when:** both have been evaluated against a live pull request and the outcome is recorded
in the build gate.
