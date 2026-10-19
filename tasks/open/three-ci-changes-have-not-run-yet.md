# Three CI changes have not run yet

**Status:** ASSERTED · opened 2026-10-20

The 2026-10-20 CI change was verified by its own pull request's CI, except for three paths that
a green run on a branch cannot reach.

1. **Dependabot.** `.github/dependabot.yml` validates against SchemaStore's `dependabot-2.0`
   schema, and the validator rejects a misspelt key, so the check is real. But GitHub reads the
   file only from the default branch, so it has never run here. Whether its titles pass the
   `Commit messages` check without an edit is reasoned from its source code, in
   `tasks/decisions/2026-10-20-dependabot-updates-actions-weekly-and-npm-only-for-security.md`.
   Trigger: `gh pr list --repo fergeley/pet-shelter --author app/dependabot --state all --json title`
   lists a title starting `ci(deps): Bump`.
2. **Vercel and Dependabot's commits.** Vercel may hold a deployment for a commit whose author is
   not a team member and ask for authorization. That would leave the required `Vercel` check
   pending on Dependabot's pull requests until someone approves it in Vercel.
   No agent-checkable trigger exists until a Dependabot pull request does.
3. **`actions/upload-artifact` v7.** The Playwright job uploads its report only when the run
   fails, so no green run has executed the new version. Its release notes list no change to the
   inputs used here.
   Trigger: the first red `Playwright golden paths` run lists a `playwright-report` artifact in
   `gh api repos/fergeley/pet-shelter/actions/runs/<run id>/artifacts`.

**Settles when:** each has been observed once. Delete the item that settles; delete the entry when
none is left.
