# The unit suite writes to whatever is listening on localhost:5432

**Status:** open · opened 2026-09-22 · found while closing the pet birth-date branch

`npm test` runs the `unit` project with no `DATABASE_URL`. That makes
`isDatabasePersistent()` false (`src/lib/persistenceMode.ts:26`), which reads as "this tier does
not use a database". It is not what happens.

`src/lib/server/prisma.ts:12-14` falls back to a hardcoded connection string when the variable is
absent:

    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgrespassword@localhost:5432/pet_shelter?schema=public";

and the repository writes are **database first, mirror second** by design — `insertServerPet`
(`src/lib/server/petRepository.ts:153`) calls `prisma.pet.create` before touching the in-memory
store, whatever `isDatabasePersistent()` says. The offline behaviour the unit tier relies on is
therefore not "no database is configured". It is "the connection is refused", which holds only
because nothing is usually listening on that port.

## Observed 2026-09-22

The same checkout, the same commit, twenty-five minutes apart:

- Port closed: `npm test` → **1580 passed, 0 failed**.
- Port open: `npx vitest run --project unit tests/unit/pets/petCatalog.test.ts` → **6 failed**,
  every one of them

      PrismaClientKnownRequestError:
      Invalid `prisma.pet.create()` invocation in src/lib/server/petRepository.ts:153:22
        Unique constraint failed on the fields: (`id`)

The listener was an `embedded-postgres` started by a *different* Claude Code job on the same
machine (`C:\Users\User\.claude\jobs\2606c4be\tmp\pg\...\postgres.exe`), which this session had no
part in starting and which shut down on its own later. Nothing in the repo was different.

Two consequences, and the second is the worse one:

1. **The failure is unreadable.** A unique-constraint violation on a fixed fixture id looks like a
   test-isolation defect in `petCatalog.test.ts`, which has no `beforeEach` reset. Someone will
   eventually "fix" that file.
2. **The unit suite wrote rows into a database it was never meant to reach.** The first run
   inserted `pet-catalog-*` animals; the failures on later runs are those rows colliding. Any
   Postgres on 5432 — a colleague's local instance, a container left running from `npm run db:up`,
   another agent's sandbox — is a write target for a test tier that believes it is offline.

## This is one cause, not the cause

`tasks/open/unit-suite-is-order-dependent-in-both-directions.md`, opened the same day by a
different session, records the broader instability: the same 98-file project reporting `1580
passed` under one schedule and 54 red under another, with disjoint failing sets and a
`hookTimeout` shape that this entry does not explain.

This entry is narrower and correspondingly more actionable — a named mechanism with a one-command
check. It does not account for the authorization failures that entry saw on `master` with none of
this branch's changes. **Check the port first** because it takes seconds and rules one cause in or
out; then read that entry for the rest. Two entries rather than one because they settle
differently: this one closes when the unit tier stops reaching the network, that one when the
ordering interference is found.

## What this is not

Not the `integration` tier's problem: `test:integration` sets `STRICT_PERSISTENCE=true`
deliberately, and `test:db` pins `DATABASE_URL` explicitly. Both are honest about wanting a
database. This is only about the tier that believes it has none.

Setting `DATABASE_URL` to an unreachable host does **not** work around it: that flips
`isDatabasePersistent()` to true and 129 tests fail on the DB paths they then take. Tried, 2026-09-22.

## Settles when

Either the unit tier stops reaching the network at all — a `@/lib/server/prisma` mock in
`tests/setup/nextMocks.ts` for the `unit` project, which is where the rest of the tier's doubles
already live — or `createPrismaClient()` stops inventing a localhost fallback when no
`DATABASE_URL` is set and the caller has not asked for persistence, so an unconfigured unit run
fails closed instead of connecting to a stranger.

Until then, **check `localhost:5432` before believing a red unit run**, and do not run `npm test`
alongside anything that serves Postgres locally.
