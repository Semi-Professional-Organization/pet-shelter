# The database test tier still reads the developer's environment

**Status:** open · opened 2026-10-20 · read from the setup files; the tier was not run, since no local Postgres is available to agents here

The unit, integration and component tiers delete the variables the code reads before any test loads
(`tests/setup/hermeticEnv.ts`). `integration-db` skips that file, because it would delete the
`DATABASE_URL` the tier exists to use, and `tests/setup/integrationEnv.ts` then loads `.env.local`
and `.env` whole. So a shell or `.env.local` that sets `PGSSLMODE`, `STORAGE_PROVIDER`,
`NEXT_PUBLIC_STORAGE_URL`, `ROS_REGISTRATION_NO` or `TRUSTED_PROXY_HEADER` changes what a local
`npm run test:db` sees, while CI, which sets none of them, does not.

It was left alone on the test-harness branch because the tier cannot be run here to check a change,
and CI's `.env` may carry something the tier needs.

**Settles when:** `integrationEnv.ts` deletes the scrubbed list except `DATABASE_URL` and what it
sets itself, and a CI run of `npm run test:db` passes with it.
