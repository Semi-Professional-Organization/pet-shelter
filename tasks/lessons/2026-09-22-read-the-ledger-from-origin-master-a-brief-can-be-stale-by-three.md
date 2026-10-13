# Read the ledger from origin/master; a brief can be stale by three commits

**Learned:** 2026-09-22

The brief's first step was "review `prisma/migrations/manual/20260917_status_enums/` to verify
readiness for Neon execution". The main checkout was at `b44f857`; `origin/master` was at
`8d36ace`, three commits ahead, and the intervening commits had appended a section to
`tasks/open/production-schema-has-drifted-ahead-of-master.md` recording that **the owner applied
that migration on 2026-09-18** and re-measured the drift afterwards. Reviewing it for readiness
would have been reviewing an executed change, and — worse — the re-measurement is what tells you
which statements are actually left. Half the brief's premise (the `ApplicationStatus` conversion)
was gone; the half that remained had grown a new consequence nobody had written down yet.

`tasks/open/` is not a task list that ages gracefully. It is mirrored to public GitHub issues and
amended in place by whichever session last measured something, so the same filename can say
materially different things in two checkouts on the same machine. `git worktree add` from
`origin/master` fixed this for free here, by accident rather than by care.

**Rule:** before acting on any brief that cites a `tasks/open/` entry, `git fetch origin master`
and read the entry at `origin/master`, not the local checkout — then diff it against whatever
commit the brief was written from (`git diff <base> origin/master -- tasks/open/`). A brief that
names a migration, a PR, or a measurement is quoting a moment; check whether that moment is still
the present before spending the session on it.
