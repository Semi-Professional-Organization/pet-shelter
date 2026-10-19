# The test harness pays only for what a file uses, and nothing reaches outside the process

**Decided:** 2026-10-20

Three changes to the shared Vitest setup, measured on throwaway copies of `origin/master` before
they were made (plan: the "Test suite redesign plan" doc, 2026-10-20; owner's "go" the same day).

## 1. Demo seed password hashes are constants

`INITIAL_STAFF_USERS` (`userStore.ts`) and `SEED_SPONSORS` (`sponsorRepository.ts`) carry each
demo account's `passwordHash`, derived once from its published password. Before, the sponsor seeds
were re-hashed with scrypt on every test (about 100 ms per test on CI, 500 ms under local load) and
the staff seeds once per file. That single cost was most of the suite's runtime and the cause of
the `Hook timed out in 10000ms` failures at `tests/setup/nextMocks.ts`. The hashes reveal nothing
the published passwords do not; `tests/unit/demoSeedPasswordHashes.test.ts` fails if a password
and its hash ever disagree. Measured: full local run 104 s to 85 s, all 2,251 tests passing.

The CI thread's alternative, a per-process cache of the sponsor hashes, would have kept one hash
per seed per test file. The owner chose constants (plan decision 2).

## 2. Each store registers its own reset

The global `beforeEach` used to import eleven store owners and call their resets for every test.
Now each owner registers its reset with `@/lib/stateResets` when it loads, and the hook runs what
is registered. A file that tests pure functions loads no store, so it no longer loads Prisma, `pg`
and every repository before its first test. Measured on the 55 unit files that use no store:
compile CPU 46 s to 6 s, all 895 tests passing. The resets run in load order. The old hook said
"order matters" for the sponsor demo-seed flag, but what mattered was that it is cleared at all:
no reset reads another store, and the demo seeds lazily inside the next test, after every reset.
`tests/unit/stateResets.test.ts` pins that every store the old hook reset still registers.

What it exposed: `transparency.test.ts` passed only because the old hook had loaded `crypto.ts`
in test mode before the file switched `NODE_ENV` to production. Fixed in the test by giving the
production-mode test the session secret a production process always has.

## 3. The non-database tiers are hermetic

`tests/setup/hermeticEnv.ts` runs first in the unit, integration and components projects and
deletes every environment variable the code reads that a developer's shell might set; the config
pins `STRICT_PERSISTENCE` off for unit and components. `tests/setup/hermeticRuntime.ts`, in every
project including `integration-db`, pins the time zone and replaces `fetch` with a guard that
fails any test making a real network call, naming the test that made it. The zone is UTC for
server code, as on CI and Vercel, and `Asia/Kuala_Lumpur` in the components tier, which stands in
for the browsers of the shelter's staff and supporters; either way it is the same on every
machine. The config adds `unstubEnvs`, `unstubGlobals` and `expect.requireAssertions`,
and `passWithNoTests: false` now that every tier has files. With the offline Prisma client
(`2026-10-20-no-database-url-means-no-database.md`), a unit, integration or component run reads
nothing from the machine it runs on.

## What this closes

`tasks/open/unit-suite-is-order-dependent-in-both-directions.md`, deleted with this change. Each
of its three jobs has a mechanism and is addressed:

1. **The hook timeout.** The shared hook no longer hashes passwords or imports the server layer.
   Settle check from the entry, run on this branch: the full unit, integration and component
   suite three times on this machine under other sessions' load (30%, 77% and 53% CPU before
   each run): 135 files and 2,261 tests passed every time, in 47 to 52 s.
2. **`rbacAuthorization`'s "rejects an anonymous caller".** It imported the action graph inside
   its first test, under the integration project's 5 s default. That import is now static and
   the project has the same 20 s budget as the others; the test went from about 550 ms to 13 ms.
   The cause is inferred from the code, not reproduced: the original failure text was not kept.
3. **`volunteerForm`.** Not the session-mock mismatch the entry suspected: its four failures were
   the member re-read in `dal.ts` failing closed whenever a database answered on 5432. With no
   `DATABASE_URL` nothing is reached any more (`2026-10-20-no-database-url-means-no-database.md`).

## Not done, and why

- **`hookTimeout` left at its default.** The open entry on order dependence proposed raising it.
  The hook now does no expensive work, so a timeout there would again mean something.
- **`isolate: false`.** Measured 10% faster but 179 tests in 20 files fail, because per-file
  `vi.mock` of Prisma, `next/headers` and the session leak between files. Possible once those
  mocks are consolidated.
- **Vitest's experimental `fsModuleCache`.** It cut compile CPU from 64 s to 10 s, but it is
  experimental and the wall-clock gain was within noise.
