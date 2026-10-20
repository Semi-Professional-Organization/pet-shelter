---
name: test-harness
description: Read before writing or modifying any Vitest test in this repo - the global harness in tests/setup (hermeticEnv, hermeticRuntime, nextMocks), what it already mocks and resets for you, what a test may not reach (database, network, your shell's env), and how a store registers its reset.
---

# Test harness (`tests/setup/`)

Four setup files, in this order (`vitest.config.mts`). `integration-db` swaps the first for
`integrationEnv.ts`, which loads `.env.local` and then `.env` so `DATABASE_URL` is set before
Prisma loads; its suites refuse a remote database unless `ALLOW_REMOTE_DB_TESTS=true`
(`tests/integration/db/support/database.ts`).

1. **`hermeticEnv.ts`** — unit, integration and components only (not `integration-db`).
   - Deletes every environment variable the code reads that a shell might set (`DATABASE_URL`,
     `RESEND_API_KEY`, storage, secrets, `ROS_REGISTRATION_NO`, …). A test that needs one uses
     `vi.stubEnv`; the config's `unstubEnvs`/`unstubGlobals` undo stubs between tests (Vitest 4
     restores them as each test starts, so a stub made at module scope or in `vi.hoisted` is gone
     by the first test), so never assign `process.env.X =` by hand.
   - `STRICT_PERSISTENCE` is pinned off for unit and components in the config instead, because the
     integration project sets it on purpose.
2. **`hermeticRuntime.ts`** — every project, `integration-db` included. Pins the time zone (UTC for
   server code, as on Vercel; `Asia/Kuala_Lumpur` in the components tier, which stands in for the
   users' browsers) and replaces `fetch` with a guard: any real network call fails the test, naming
   the URL and the test that was running when it was made, even if the code under test swallows the
   error. Stub it with `vi.stubGlobal("fetch", ...)`, which `unstubGlobals` undoes before the next
   test; a `vi.spyOn` on it stays in place for the rest of the file unless you restore it. In every
   tier but `integration-db` it also refuses any socket (`net.Socket.prototype.connect`, which `pg`,
   `http` and `tls` all reach), so a test that stubs a `DATABASE_URL` must mock the Prisma client.
3. **`nextMocks.ts`** — every project.
   - Overload-aware `next/headers` (`cookies()` accepts both `set(name, value, opts)` and
     `set({ name, value, ...opts })`; `maxAge: 0` expires rather than writes), `next/cache`
     (`revalidatePath`/`revalidateTag`/`updateTag` spies plus `getRevalidatedPaths()`), and
     `next/navigation` (`redirect`/`notFound`/`forbidden`/`unauthorized` **throw**, as the real ones do; the last two carry the real `NEXT_HTTP_ERROR_FALLBACK;403` / `;401` digests).
   - A global `beforeEach` that runs every reset registered with `@/lib/stateResets`.
4. **`componentSetup.ts`** — components only: jest-dom, RTL `cleanup()`, jsdom gaps, `next/image`.

## No database, unless the tier is `integration-db`

With no `DATABASE_URL`, `@/lib/server/prisma` is an offline client: every query rejects at once
with `DatabaseNotConfiguredError` (code P1001), and no socket is opened. The repositories read that
as an outage and serve their in-memory stores, exactly as they would in production with the
database down. A suite that wants to assert Prisma calls still mocks `@/lib/server/prisma` itself
(see `tests/integration/support/prismaDouble.ts`); a file's own `vi.mock` wins over the module.

## Store resets are registered by the store

A module with module-level state exports a reset and registers it next to it:

```ts
export function resetThings(): void { things.clear(); }
registerStateReset("things", resetThings);
```

The harness resets exactly the stores a test file has loaded, before every test, in the order they
loaded: no reset reads another store, so order does not matter. New suites are order-independent by
default; don't re-implement this per file, and don't add store imports to
the harness. `tests/unit/stateResets.test.ts` pins that every store the harness used to reset by
hand still registers.

`@/lib/stateResets` imports nothing, which is why the harness may import it statically: a static
import of a repository would instantiate the real Prisma client before a test file's own
`vi.mock("@/lib/server/prisma")` registers, and spies would observe zero calls.

A test file's own `vi.mock("next/headers", ...)` still wins over the harness for that file; several
suites predate the harness and rely on that. New suites should sign in with `signInAs` from
`tests/setup/authSession.ts` instead.

## Typing in component tests

`setupUser()` (`tests/components/support/render.tsx`) uses `delay: null`: no timer tick between
keystrokes. Every assertion should be about behaviour, not about the typing speed.
