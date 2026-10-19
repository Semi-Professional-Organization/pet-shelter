# No DATABASE_URL means no database, not localhost:5432

**Decided:** 2026-10-20

`src/lib/server/prisma.ts` no longer invents a connection string when `DATABASE_URL` is unset. It
used to fall back to `postgresql://postgres:postgrespassword@localhost:5432/pet_shelter`, so "no
database configured" really meant "whatever happens to be listening on that port". With no
`DATABASE_URL`, the client now refuses every query at once with `DatabaseNotConfiguredError`
(code P1001, "can't reach database server") and opens no socket.

## Why

The fallback was the mechanism behind most of the local-only test failures on record:

- The unit tier wrote fixture rows into other sessions' Postgres instances and then failed on
  their unique constraints (`tasks/open/unit-tests-write-to-whatever-is-on-localhost-5432.md`).
- The member re-read in `src/lib/security/dal.ts` falls back to the cookie's claims when the query
  throws, and fails closed when a database answers with no row. So `volunteerForm.test.ts` and
  every other suite that signs in as an id no store vouches for passed or failed depending on
  whether anything listened on 5432. That is the "order dependence" the open entry chased: it was
  never order, it was the port.
- Local e2e runs that `resolveE2eDatabaseUrl()` meant to run with no database also fell back to
  localhost, so a stray local Postgres changed their results.

## What did not change

Offline behaviour. Every repository already serves its in-memory store when a query fails, and
P1001 is one of the codes `isDatabaseUnavailable()` reads as an outage, so callers see exactly what
a refused connection gave them, minus the network round trip. Production and preview always set
`DATABASE_URL`. A production process without it serves fixtures, as it did when it fell back to a
localhost nobody listened on; making it refuse to start instead is a separate decision, and would
also have to spare `next build`, which runs as production and needs no database. `.env.example` sets it, so the documented onboarding is unaffected, and the `:local`
npm scripts (`db:push:local`, `db:seed:local`, `test:db`) set it explicitly.

The one behaviour that did change: running `next dev` with no `DATABASE_URL` and a docker-compose
Postgres up no longer finds that database by accident. Set `DATABASE_URL` to it instead. The
Prisma CLI and the seed script still default to localhost (below), so `db:push` and `db:seed`
without it fill a database the app will not read; the app says so once at start, outside tests.

## Details worth keeping

- The refusals are lazy, like Prisma's own query promises: nothing rejects until awaited. An eager
  rejection surfaced as unhandled rejections from queries built for `$transaction([...])`, which the
  real client never produces. `tests/unit/offlinePrismaClient.test.ts` pins this, the P1001 code,
  and that no socket is opened; each was mutation-checked (restoring the fallback fails two tests,
  an eager rejection fails one).
- `prisma/env.ts` keeps its own localhost fallback. That one serves the Prisma CLI and the seed
  script, not the running app, and is a different decision.
- With `DATABASE_URL` set, a client that cannot be built fails the import with its own error.
  `createPrismaClient` used to catch that and build `new PrismaClient()` without a driver adapter,
  which Prisma 7 refuses ("requires a driver adapter"), so the catch only swapped the cause for a
  misleading message. Falling back to the offline client there was considered and refused: a
  database that is configured but broken must fail loudly, not quietly serve fixtures.
  `tests/unit/prismaConfiguredClient.test.ts` pins it, and fails with the old catch restored.

## Alternative not taken

A Prisma double installed by the test harness for the non-database tiers. It would have fixed the
tests without touching product code, but left local e2e and dev exposed to the same accident, and
added a second fake of the client to keep in step with the real one. The owner chose the product
fix over it on 2026-10-20 ("go", plan decision 1).
