# CI changes that have not run yet

**Status:** ASSERTED · opened 2026-10-20

The 2026-10-20 CI change was verified by its own pull request's CI, except for what a run on a
branch cannot reach.

1. **Dependabot.** `.github/dependabot.yml` validates against SchemaStore's `dependabot-2.0`
   schema, and the validator rejects a misspelt key, so the check is real. But GitHub reads the
   file only from the default branch, so it has never run here, and its npm entry opens nothing
   until Dependabot alerts and security updates are switched on (both were off on 2026-10-20).
   Whether its titles pass the `Commit messages` check without an edit is reasoned from its
   source code, in
   `tasks/decisions/2026-10-20-dependabot-updates-actions-weekly-and-npm-only-for-security.md`.
   Trigger: `gh pr list --repo Semi-Professional-Organization/pet-shelter --author app/dependabot --state all --json title`
   lists a title starting `ci(deps): Bump`.
   Known edge, accepted: a security update for a long scoped package name can run past the
   72-character subject limit, and a failed style lookup gives a lowercase `bump`. Either fails
   the check until a person edits the title, which reruns it (tested on #140: an edit to a
   lowercase title turned the check red, and restoring it turned it green).
2. **A re-run of the Playwright job.** The upload itself has run: #140's green run uploaded a
   234 KB `playwright-report`. A second attempt has not. The upload runs on every attempt, so a
   second attempt in the same workflow run would collide with the first one's artifact, and
   `overwrite: true` is what should prevent that.
   Trigger: after a re-run of `Playwright golden paths`,
   `gh api repos/Semi-Professional-Organization/pet-shelter/actions/runs/<run id>/artifacts` lists one
   `playwright-report` and the job is green.

**Settles when:** each has been observed once. Delete the item that settles; delete the entry when
none is left.
