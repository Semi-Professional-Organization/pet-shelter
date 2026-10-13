# A stray-process sweep matched on the package name kills other sessions' databases

**Learned:** 2026-09-22

Rehearsing the birth-date migration, an embedded PostgreSQL from an earlier run had not shut down
cleanly — Windows held the data directory, so `initdb` refused the next run with `pre-existing
shared memory block is still in use`. The obvious cleanup:

```powershell
Get-Process postgres | Where-Object { $_.Path -like "*embedded-postgres*" } | Stop-Process -Force
```

That matched nine processes, and none of them were mine. They belonged to
`~/.claude/jobs/2606c4be/`, a different background session rehearsing something else at the same
time, and stopping them killed its database mid-run. Nothing of value was lost — everything under
`jobs/*/tmp` is throwaway by construction — but that session's run failed for a reason it had no
way to attribute, which is the expensive part.

Several Claude Code sessions run against this repo concurrently, and the ledger and lessons
directories are already structured around that fact. Process cleanup was not: `embedded-postgres`
is what *every* session's rehearsal is called, so the package name is the one predicate guaranteed
to match peers.

The actual fix was not to sweep at all. `mkdtemp` for the data directory and a per-run port make
the collision impossible, and a failed teardown then leaves behind a directory nobody will reuse
rather than a conflict for the next run.

**Rule:** anything that kills processes, removes directories or frees ports on this machine must
be scoped by **your own job or worktree path**, never by a package, image or port name that every
session shares. Better still, make the resource unique per run — `mkdtemp`, a random port — so no
cleanup is needed and a leaked one is inert. The same reasoning that gave `tasks/open/` one file
per entry applies to everything else shared between concurrent sessions.
