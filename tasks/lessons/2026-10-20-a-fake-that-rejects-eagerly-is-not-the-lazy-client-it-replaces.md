# A fake that rejects eagerly is not the lazy client it replaces

**Learned:** 2026-10-20

The offline Prisma client (`src/lib/server/prisma.ts`, used when no `DATABASE_URL` is set) first
returned `Promise.reject(...)` from every query method. The full suite then reported 6 unhandled
rejections, all from `updateServerPet`, which builds three queries and hands them to
`prisma.$transaction([...])`. Prisma's own query promises are lazy: they run only when awaited or
passed to a transaction, so the three unawaited ones never reject. The fake rejected all three the
moment they were built, and the fake `$transaction` never consumed them.

A refused TCP connection had hidden the difference for months, because a real client against a
dead port still returns lazy queries.

**Rule:** a stand-in for a library object must match its laziness, not just its signatures and
error shapes. Before writing one, check whether the real API returns thenables that do nothing
until awaited, and copy that; then pin it with a test that builds an unawaited query and asserts
no unhandled rejection (`tests/unit/offlinePrismaClient.test.ts`), mutation-checked by making the
fake eager again.
