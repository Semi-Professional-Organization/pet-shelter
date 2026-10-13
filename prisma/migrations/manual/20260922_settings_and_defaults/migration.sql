-- The rest of the drift: the `shelter_settings` email and storage columns production lacks, and
-- the `notification_preferences.updatedAt` default master's schema does not declare.
--
-- Scope: this file, plus 20260922_pets_birth_date (expand) and 20260922_pets_birth_date_contract
-- (archive and drop) beside it, are together the whole of the drift
-- recorded in tasks/open/production-schema-has-drifted-ahead-of-master.md as of its 2026-09-18
-- re-measurement — one additive statement and two destructive ones, of which only the pet one
-- destroys anything. Applying both, plus that folder's cleanup.sql, takes
-- `npm run db:check-drift` to zero.
--
-- **This is not inert, and an earlier version of this header said it was.** The claim was that the
-- deployed client "reads them as NULL and carries on". It does not: `getServerSettingsAsync`
-- (`src/lib/server/settingsRepository.ts:66`) runs `findUnique` with no `select`, so Postgres is
-- asked for all seven of these columns on every settings read. While they are absent that read
-- raises 42703, `handlePersistenceError(…, "read")` swallows it, and the repository returns the
-- hard-coded `INITIAL_SETTINGS` fixture — the identical mechanism this branch documents for
-- `pets`. So applying this file makes the read succeed, and the public site switches from the
-- bundled fixture's shelter identity to whatever the production row holds: shelter name, phone,
-- address, operating hours, announcement banner and the donation QR URLs.
--
-- That is a visible content change, and it is probably the change you want — the fixture is demo
-- data — but it is not nothing, and it should not be applied in the belief that it is. **Read the
-- row first:** `SELECT * FROM shelter_settings;`. If it holds placeholder or stale values, fix them
-- in the same session, because the site starts serving them the moment this commits.
--
-- Note also that the three `DEFAULT` clauses backfill the existing singleton row with `'local'`,
-- `'ap-southeast-1'` and the Resend sender rather than leaving it NULL, which is a weaker form of
-- the same surprise. The values match `prisma/schema.prisma`, so they add no drift.
--
-- Found by `/code-review max`, 2026-10-14. Nothing here is urgent in the way the pet conversion
-- is; it is here so the drift has one answer rather than a remainder.
--
-- Every `ADD COLUMN` is `IF NOT EXISTS` and every column is listed, not just the ones the
-- 2026-09-18 measurement happened to print before its 160-character truncation. That is
-- deliberate: the measurement's output is cut off mid-statement, so which of the seven are
-- actually missing is not known from it, and a list that is right either way beats a guess.
--
-- The `DROP DEFAULT` removes a column default, not rows. `updatedAt` stays NOT NULL, and Prisma
-- supplies it on every write because the model marks it `@updatedAt`. The only writer that would
-- notice is a hand-written INSERT omitting the column; there is none — the sole raw statement in
-- the codebase is a SELECT (`src/lib/server/faqRepository.ts:354`).
--
-- Safety: one transaction, same advisory lock key as the other manual migrations, every statement
-- idempotent and re-runnable, every table schema-qualified, 5-second lock timeout set inside the
-- block so it holds however an editor runs the file.
--
-- Apply: paste into the Neon SQL editor for the production branch. Verify with
--
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'shelter_settings' ORDER BY column_name;
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'notification_preferences'
--      AND column_name = 'updatedAt';                                      -- expect NULL
--
-- Undo: rollback.sql beside this file.
--
-- Rehearsed 2026-09-22 on PostgreSQL 17 (pglite) against a `shelter_settings` shaped like
-- production's (the seven columns absent) and a `notification_preferences` carrying the
-- CURRENT_TIMESTAMP default that 20260903_notification_preferences/migration.sql created: applied,
-- re-applied as a no-op, rolled back, and applied again.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DO $$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- Email configuration overrides. All optional: absent means "fall back to the environment".
  ALTER TABLE "public"."shelter_settings"
    ADD COLUMN IF NOT EXISTS "resendApiKey" TEXT,
    ADD COLUMN IF NOT EXISTS "emailFrom"    TEXT DEFAULT 'Hope for Strays <onboarding@resend.dev>';

  -- Storage configuration overrides, same rule.
  ALTER TABLE "public"."shelter_settings"
    ADD COLUMN IF NOT EXISTS "storageProvider"     TEXT DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS "s3Bucket"            TEXT,
    ADD COLUMN IF NOT EXISTS "s3Region"            TEXT DEFAULT 'ap-southeast-1',
    ADD COLUMN IF NOT EXISTS "s3Endpoint"          TEXT,
    ADD COLUMN IF NOT EXISTS "cloudinaryCloudName" TEXT;

  -- prisma/schema.prisma declares `updatedAt DateTime @updatedAt`, which carries no database
  -- default; production's table was created with one. Prisma writes the value itself.
  ALTER TABLE "public"."notification_preferences" ALTER COLUMN "updatedAt" DROP DEFAULT;
END $$;

COMMIT;
