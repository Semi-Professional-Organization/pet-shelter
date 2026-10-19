---
name: test-harness
description: Read before writing or modifying any Vitest test in this repo - the tests/setup/nextMocks.ts global harness, what it already mocks and resets for you, and the dynamic-import rule that keeps vi.mock("@/lib/server/prisma") working.
---

# Test harness (`tests/setup/nextMocks.ts`)

Loads before every test file (`setupFiles`) and provides:

- Overload-aware `next/headers` (`cookies()` accepts both `set(name, value, opts)` and
  `set({ name, value, ...opts })`; `maxAge: 0` expires rather than writes), `next/cache`
  (`revalidatePath`/`revalidateTag`/`updateTag` spies plus `getRevalidatedPaths()`), and
  `next/navigation` (`redirect`/`notFound`/`forbidden`/`unauthorized` **throw**, as the real
  ones do; the last two carry the real `NEXT_HTTP_ERROR_FALLBACK;403` / `;401` digests).
- A global `beforeEach` that resets every module-level cache: `resetServerStore()`,
  `resetUserStore()`, `resetAuditLogs()`, `resetRateLimitStore()`, `resetIdempotencyStore()`,
  `resetDonationLedger()`.
  New suites are order-independent by default; don't re-implement this per file.
- Those stores are imported **dynamically inside the hook**. A static import would instantiate
  the repositories — and the real `@/lib/server/prisma` — before a test file's own
  `vi.mock("@/lib/server/prisma")` registers, so Prisma spies would silently observe zero calls.
  `resetServerStore()` now lives in `@/lib/server/fallbackState`, which is the only module that
  knows all four caches exist.

A test file's own `vi.mock("next/headers", ...)` still wins over the harness for that file; several
suites predate the harness and rely on that.
