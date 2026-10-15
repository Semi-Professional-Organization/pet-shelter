# A published npm tarball is not necessarily what npm extracted

**Learned:** 2026-09-22

`tasks/lessons/2026-09-14-a-missing-docker-is-not-a-missing-database-tier.md` says the Postgres
falsification rung has a second ladder: `npm install embedded-postgres` in the session scratchpad,
port 5432, then the two `:local` scripts. Following it exactly, on the exact version that lesson
used (`18.4.0-beta.17`), `initdb` failed:

    initdb: error: file ".../native/share/pg_hba.conf.sample" does not exist
    initdb: hint: This might mean you have a corrupted installation or identified
            the wrong directory with the invocation option -L.

The tempting read is "the package regressed, pin an older version". It had not. `npm pack
@embedded-postgres/windows-x64@18.4.0-beta.17` and `tar -tzf` showed **all five `.conf.sample`
files present in the published tarball**, alongside four `.sql` bootstrap files. The local
`node_modules` had `share/postgres.bki` and every subdirectory but none of those nine files. The
extraction dropped them; the registry never did. Restoring them from the packed tarball fixed the
boot, and the rehearsal ran.

Two things this changes:

**A missing file under `node_modules/` is not evidence about the package.** It is evidence about
one extraction. `npm pack` + `tar -t` separates the two in about ten seconds and is decisive,
where version-pinning is a guess that costs a download per attempt — and here would have been
wrong three times over, since every version has the same contents.

**The second ladder needs a rung of its own.** The 2026-09-14 recipe is still right, but it
describes a clean install. Add to it: if `initdb` reports a missing `share/*.sample`, do not
re-install and do not downgrade — unpack the tarball and copy `native/share/` over.

A second, smaller trap on the same path, for anyone following that recipe on Windows: the server
binds `127.0.0.1` by default, and Windows resolves `localhost` to `::1` first, so
`npm run db:push:local` — which hardcodes `localhost` — fails `P1001` against a server that is
demonstrably up. `listen_addresses = '*'` appended to the data directory's `postgresql.conf`, then
a restart, makes the repo's own script run verbatim. Fixing the harness beats editing the script:
a rehearsal that required a modified command would not have rehearsed the command.

**Rule:** when a documented recipe fails on a file that should be there, ask whether the artifact
or the *copy* is wrong before concluding the recipe is stale. `npm pack` answers it for anything
from the registry, and the answer here was the copy — which no amount of re-reading the lesson
would have revealed.
