# The test admin shares an id with a seeded staff account, so a lookup that finds nobody still admits it

**Status:** open · opened 2026-10-20 · found while proving the authorization tests discriminate

`TEST_ADMIN` in `tests/setup/authSession.ts` has the id `usr-admin-01`, which is also the id of the
seeded demo super-admin in `src/lib/server/userStore.ts`. When a suite's Prisma double answers the
member re-read with `null`, `readVerifiedSession` (`src/lib/security/dal.ts`) falls back to the
in-memory seed outside production, finds `usr-admin-01` there, and admits the session anyway.

So for any suite that signs in with `signInAsAdmin()`, "the database vouches for this admin" and
"nothing vouches for this admin, but the dev seed happens to" look the same. Observed while
hardening `tests/unit/petHistory.test.ts`: making its user lookup return `null` left all 43 tests
green; only a SUSPENDED row or an unknown id made the auth-dependent ones fail.

This is not a product defect (the seed fallback is refused in production) and no current test
asserts the wrong thing because of it. It does mean a test meant to prove "admits a database-backed
admin" cannot fail on that point when signed in as `TEST_ADMIN`.

**Settles when:** `TEST_ADMIN` uses an id no seed holds (and `memberRowForId` keeps answering it),
or a test documents that suites signed in as `TEST_ADMIN` deliberately also pass through the seed
fallback, with the suites that need the distinction signing in as someone else.
