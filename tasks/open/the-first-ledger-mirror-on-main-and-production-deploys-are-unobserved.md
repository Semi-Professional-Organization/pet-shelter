# The first ledger mirror on `main`, and production deploys from it, are unobserved

**Status:** open · opened 2026-10-30 · follows the org move and the `master` to `main` rename

The repository moved to the Semi-Professional-Organization org on 2026-10-28 and its default branch
became `main`. Two things that should happen on every merge to `main` have not been seen to happen.

**The ledger mirror.** `.github/workflows/ledger-issues.yml` listened on `master` until the pull
request that adds this entry, so no mirror run has used the new repository name or branch. Every
ledger issue still links `fergeley/pet-shelter/blob/master/…`, so the first run rewrites the body of
all of them, one after another. The scripts themselves could not run from the cloud session that
made the change (both call GraphQL, which is blocked there), so the plan was previewed instead by
feeding `planSync` the branch's entries and the ledger issues read over REST: 69 updates and 7
creates. 67 of the updates change only the link; #127 and #155 also take the wording edits that
change made. `node scripts/issue-groups.mjs` was not previewed.

**Production deploys.** The newest commit on `main` at the time, `0b542f5` (#226), has no
deployment and no commit status. The last Production deployment is `8490d68`, before the move.
Either Vercel lost its Git link in the transfer or its Production Branch still says `master`. Until
that is fixed, `ci.yml`'s "every main commit is a production deploy" is a statement of intent.

**Settles when:** the first mirror run on `main` finishes green with every issue body linking the
org repository on `main` (or a rerun clears a rate-limited first attempt), a dry run of
`node scripts/issue-groups.mjs` reports in sync, and Vercel shows a
Production deployment for a commit merged to `main` after the move.
