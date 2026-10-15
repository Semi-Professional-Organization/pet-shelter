# Stopping the wrapper does not stop the Postgres it started

**Learned:** 2026-10-14

`tasks/lessons/2026-09-14-a-missing-docker-is-not-a-missing-database-tier.md` says to stop the
embedded server before running the offline suites. Stopping the Node process that called
`embedded-postgres` is not that. On Windows it left one orphaned `postgres.exe` child holding the
listening socket on 5432 after its postmaster had exited: `pg_ctl stop` reported "No such
process", `Get-NetTCPConnection -State Listen` attributed the port to the dead postmaster's PID,
and a TCP connect still succeeded — and then nothing answered.

A port that accepts and never answers fails differently from a live database and from a closed
port. The unit tier's global `beforeEach` waited on it and hit its 10 s hook timeout in whichever
file a worker happened to open first, so each run failed a *different* handful of pure-logic
suites (`money`, `stateMachine`, `oklch`). It read as machine load, and the first time it was
written down as load without the error text being read.

**Rule:** after using a local database, verify the port is *refused*, not merely that the process
you started has exited: `net.connect(5432)` must error with `ECONNREFUSED`. If it connects, find
the owner by parent PID (`Get-CimInstance Win32_Process -Filter "Name='postgres.exe'"`), and stop
only the one whose parent is the postmaster recorded in your own data directory's
`postmaster.pid` — other sessions run their own. And read the failure text before naming a cause:
"Hook timed out" in the first test of unrelated files is a hung dependency in shared setup, not a
slow machine.
