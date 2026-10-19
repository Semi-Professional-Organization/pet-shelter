---
name: test-harness
description: Read before writing or modifying any Vitest test in this repo - the tests/setup/hermeticEnv.ts and tests/setup/nextMocks.ts global harness, what it already mocks and resets for you, what a test may not reach (database, network, your shell's env), and how a store registers its reset.
---

# Test harness (`tests/setup/`)

Three setup files, in this order (`vitest.config.mts`):

1. **`hermeticEnv.ts`** — unit, integration and components only (not `integration-db`).
   - Deletes every environment variable the code reads that a shell might set (`DATABASE_URL`,
     `RESEND_API_KEY`, storage, secrets, `ROS_REGISTRATION_NO`, …) and pins `TZ=UTC`. A test that
     needs one uses `vi.stubEnv`; the config's `unstubEnvs`/`unstubGlobals` undo stubs between tests
     (Vitest 4 restores them as each test starts, so a stub made at module scope or in
     `vi.hoisted` is gone by the first test), so never assign `process.env.X =` by hand.
   - Replaces `fetch` with a guard: any real network call fails the test that made it, with the
     URL, even if the code under test swallows the error. Stub it with
     `vi.spyOn(globalThis, "fetch")`.
2. **`nextMocks.ts`** — every project.
   - Overload-aware `next/headers` (`cookies()` accepts both `set(name, value, opts)` and
     `set({ name, value, ...opts })`; `maxAge: 0` expires rather than writes), `next/cache`
     (`revalidatePath`/`revalidateTag`/`updateTag` spies plus `getRevalidatedPaths()`), and
     `next/navigation` (`redirect`/`notFound` **throw**, as the real ones do).
   - A global `beforeEach` that runs every reset registered with `@/lib/stateResets`.
3. **`componentSetup.ts`** — components only: jest-dom, RTL `cleanup()`, jsdom gaps, `next/image`.

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
registerStateReset("things", resetThings, 0);
```

The harness resets exactly the stores a test file has loaded, before every test, in `order`
(lowest first; the ledgers before the demo-seed flag, which is why the numbers differ). New suites
are order-independent by default; don't re-implement this per file, and don't add store imports to
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
