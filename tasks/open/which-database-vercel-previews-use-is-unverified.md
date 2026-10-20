# Which database Vercel previews use is unverified

**Status:** open · opened 2026-10-20

Every pull request into `master` now has to pass its Vercel preview build (the `Vercel` required
check), and a preview is what a reviewer clicks through. Whether Vercel's Preview environment sets
`DATABASE_URL`, and to which Neon branch, cannot be seen from the repository or from CI.

If Preview shares the production URL, then anything submitted on a preview writes production
data: an adoption application, a donation pledge, an admin edit. The same goes for
`RESEND_API_KEY`, under which a preview would send real email. If Preview sets no database, the
preview runs on fixtures, which is safe but means a preview never exercises the database.

**Settles when:** the owner checks Vercel → Project Settings → Environment Variables and records
which values are scoped to Preview for `DATABASE_URL` and `RESEND_API_KEY`. If Preview turns out
to share production's, give it its own Neon branch.
