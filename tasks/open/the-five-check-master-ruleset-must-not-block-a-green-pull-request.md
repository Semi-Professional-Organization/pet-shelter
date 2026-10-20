# The five-check master ruleset must not block a green pull request

**Status:** open · opened 2026-10-20

`tasks/decisions/2026-10-20-master-merges-only-green-squashed-pull-requests.md` settles what the
ruleset "Basic" (id 20886052) should be. It is **not switched on yet**: the owner asked on
2026-10-20 to stop before it was. This entry holds the change and the kill condition it must pass,
registered before it runs. The kill condition is immutable from here.

It supersedes an earlier kill condition, retired without being evaluated, whose design required
the `Vercel` status. Review removed that requirement because Vercel decides whether to deploy a
commit by its author, so a required `Vercel` check could wait forever on Dependabot's pull
requests.

## The change

```bash
gh api -X PUT repos/fergeley/pet-shelter/rulesets/20886052 --input ruleset.json
```

with `ruleset.json`:

```json
{
  "name": "Basic",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Static & architecture analysis", "integration_id": 15368 },
          { "context": "Unit, integration & component tests", "integration_id": 15368 },
          { "context": "Strict persistence against Postgres", "integration_id": 15368 },
          { "context": "Playwright golden paths", "integration_id": 15368 },
          { "context": "Commit messages", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

Once the pull request that adds the `Production build` job has merged, add
`{ "context": "Production build", "integration_id": 15368 }` to the list and PUT it again. Added
earlier, it would block every other open pull request, since none of them runs that job yet.

The state before any of this, for a restore, is quoted in the decision above.

## Kill condition

- **K-A1′a.** `gh api repos/fergeley/pet-shelter/rules/branches/master` must list `deletion`,
  `non_fast_forward`, `pull_request` and `required_status_checks`. If it does not, the ruleset is
  not enforcing, whatever the settings page shows.
- **K-A1′b.** A pull request into `master`, ready for review, whose head has all five checks green
  must report `mergeStateStatus` other than `BLOCKED` (`gh pr view <n> --json mergeStateStatus`).
  No review is required, so a review cannot explain a block. If it reports `BLOCKED`, restore the
  earlier state at once, and the design goes back to be re-planned.
- **K-A1′c.** The same as K-A1′b, once `Production build` is a sixth required check.

**Settles when:** the ruleset is switched on and all three have been evaluated against a live pull
request, with the outcome recorded here before the entry is deleted. Then remove the "not
switched on yet" sentence from `.github/CONTRIBUTING.md`, and record the switch-on as a new dated
decision, since decisions are never rewritten.
