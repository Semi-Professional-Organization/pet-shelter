# CI skips sharding, merge queues and canary releases

**Decided:** 2026-10-20, by the owner, approving the plan in the project thread.

The owner asked for sharding, consensus and canary releases to be considered, for a team of two
on a small project. Each was weighed against measurements from this repository's own CI and turned
down. This entry records the numbers so that the next person knows what would change the answer.

## What CI cost when this was decided

From four runs on 2026-10-16 to 2026-10-19 (`gh run view --json jobs`), and 40 run timestamps
(`gh run list`): wall clock 2.5 to 4.5 minutes. The test job took 150–235 s, of which vitest was 193 s and `npm ci` about 30 s.
Playwright took 106–138 s. The fix in the same change caches the sponsor seed hashes that the
global `beforeEach` used to re-derive before every test. On this machine it took `test:all` from
174.6 s to 98.7 s, and summed test time from 1,508 s to 620 s.

## Not adopted, and what would reopen each

- **Test sharding.** Every shard pays its own runner start and `npm ci`, about 30 s, before it
  runs a test. With the suite near a minute after the fix, sharding would make the wall clock
  worse. *Reopen when* the unit, integration and component job passes about five minutes again.
  Note first `tasks/open/unit-suite-is-order-dependent-in-both-directions.md`: a suite that varies
  with its schedule would vary with its shards too.
- **Required approvals ("consensus") and a merge queue.** With two developers, a required approval
  blocks one of them whenever the other is away. A merge queue solves contention between many
  pull requests landing at once, which two developers do not produce. Required checks give the
  safety without the waiting
  (`tasks/decisions/2026-10-20-master-merges-only-green-squashed-pull-requests.md`). *Reopen when*
  the team grows, or two green pull requests break `master` together.
- **Canary releases.** Vercel already builds every pull request as a full preview, and can roll
  production back to an earlier deployment in one click: that is the useful half of a canary at
  this scale. Percentage rollouts need enough traffic to see a regression in a slice of it, and
  the production risk here is the hand-applied Neon migrations, which a canary cannot contain,
  because the old and new versions share one database. The expand-and-contract migrations this
  repo already uses are the right tool for that risk. *Reopen when* traffic is large enough that
  an error rate in 5% of it would be visible within minutes.
- **Caching Playwright's browsers.** Of the 22 s install step, about 11.5 s is apt packages,
  which a cache cannot hold. Playwright's CI guide says caching browser binaries "is not
  recommended", because restoring takes about as long as downloading. The job installs only the
  headless shell instead, which skips one of the two browser downloads.
- **Caching `node_modules`, or merging the two Postgres jobs.** Both save runner minutes, which a
  public repository does not pay for, and not wall clock, which is the thing waited on.
