# A title edit must rerun the commit-message check

**Status:** open · opened 2026-10-20

Kill condition for A4 in `tasks/open/CLAIM-ci-devops-hardening.md`, registered before the new
workflow ran. Immutable.

The `commits` job leaves `ci.yml` for `.github/workflows/commit-messages.yml`, which also runs on
the `edited` event, so the required `Commit messages` check follows the pull request's current
title rather than the title it had at the last push.

- **K-A4a.** If one head commit of the pull request carries two `Commit messages` check runs from
  different workflows, the design is dead: the required check would be ambiguous.
- **K-A4b.** Edit the title so that it fails rule 3 (a lowercase summary). If no new
  `Commit messages` run appears on the same head commit within five minutes, or the new run is not
  a failure, the design is dead. Then restore the title: the next run must be a success.

**Settles when:** both have been evaluated on the pull request and the outcome is recorded in the
build gate.
