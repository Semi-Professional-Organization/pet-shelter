# CI changes that have not run yet

**Status:** ASSERTED · opened 2026-10-20

The 2026-10-20 CI change was verified by its own pull request's CI, except for what a run on a
branch cannot reach.

1. **Dependabot.** `.github/dependabot.yml` validates against SchemaStore's `dependabot-2.0`
   schema, and the validator rejects a misspelt key, so the check is real. But GitHub reads the
   file only from the default branch, so it has never run here. Whether its titles pass the
   `Commit messages` check without an edit is reasoned from its source code, in
   `tasks/decisions/2026-10-20-dependabot-updates-actions-weekly-and-npm-only-for-security.md`.
   Trigger: `gh pr list --repo fergeley/pet-shelter --author app/dependabot --state all --json title`
   lists a title starting `ci(deps): Bump`.
2. **Re-running the Playwright job.** Its report upload now sets `overwrite: true`, because the
   upload runs on every attempt and a second attempt in the same workflow run would otherwise
   collide with the first one's artifact. No job has been re-run since.
   Trigger: after a re-run of `Playwright golden paths`,
   `gh api repos/fergeley/pet-shelter/actions/runs/<run id>/artifacts` lists one
   `playwright-report` and the job is green.

**Settles when:** each has been observed once. Delete the item that settles; delete the entry when
none is left.
