# Master merges only green, squashed pull requests

**Decided:** 2026-10-20, by the owner, approving the plan in the project thread.

## What was there

The repository had one ruleset, "Basic", created on 2026-08-15 with two rules: no deletion and no
force push. Its branch condition was empty, so it matched no branch at all.
`gh api repos/fergeley/pet-shelter/rules/branches/master` returned `[]`. Anyone with write access
could push to `master` or merge a red pull request, and Vercel deploys `master` to production.

That is what happened, and the history shows its cost. 18 of the 100 `master` CI runs before this
change failed, all between 2026-09-02 and 2026-09-10. The two latest were the merges of #39 and
#36 on 2026-09-10. Both pull requests were merged with `Playwright golden paths` failing, and #39 also
with `Commit messages` failing. No failure on `master` came from two green pull requests breaking
each other.

## The rule now

"Basic" targets the default branch with these rules:

- no deletion and no force push, as before;
- changes only through a pull request, squash-merged, with **no required approvals**;
- six required checks: `Static & architecture analysis`, `Unit, integration & component tests`,
  `Strict persistence against Postgres`, `Playwright golden paths` and `Commit messages`, each
  required to come from GitHub Actions (integration id 15368), plus the `Vercel` commit status;
- **no bypass actors**;
- branches need not be up to date with `master` before merging.

## Why each choice

- **No approvals.** There are two developers. A required approval blocks one of them whenever the
  other is away, and it guards against a threat this team does not have: a contributor nobody
  trusts. The checks guard against the threat it does have, which is merging red.
- **No bypass, not even for the admin.** A bypass shows as a checkbox on every red pull request,
  which recreates exactly how `master` broke in September with one extra click. It would also hand
  the bypass to every agent session, since agents here run with the owner's token. In an outage,
  the owner can set the ruleset to Disabled, merge, and set it back. That is deliberate and leaves
  a trail. `.github/CONTRIBUTING.md` says so where contributors will look.
- **Squash only.** It matches every merge since 2026-09-21. `ci.yml` already named squash as the
  policy, and a `Merge pull request …` subject fails the repo's own commit standard.
- **Not strict.** Requiring branches to be up to date costs a full CI cycle on every pull request
  each time `master` moves. The history shows nothing it would have caught. If two green pull
  requests ever do break `master` together, that is the measurement that reverses this.
- **`Vercel` required.** It is the only check that runs `next build`; CI does not build. All 15 of
  the most recent merged pull requests carried it, the docs-only ones included.
- **Integration ids on the Actions checks.** They mean a commit status with the same name, posted
  by anything other than GitHub Actions, cannot satisfy a check. `Vercel` has none, because its
  status carries no app id to pin.

## Consequences to remember

- A job's `name` in `.github/workflows/` is a check name in this ruleset. Renaming a job blocks
  every pull request until the ruleset names the new check. Both workflows say so above their jobs.
- No session, agent or human can push a commit straight to `master` any more. Ledger-only and
  docs-only changes travel on a branch carrying code, which the repo's rules already required.

## Reversing it

Settings → Rules → Rulesets → "Basic": set enforcement to Disabled, or delete the added rules.
Its state before this change, for an exact restore through the rulesets API:

```json
{"name":"Basic","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"exclude":[],"include":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"}],"bypass_actors":[]}
```
