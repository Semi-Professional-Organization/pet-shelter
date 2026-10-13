-- Undoes migration.sql: the seven `shelter_settings` columns dropped, and the
-- `notification_preferences.updatedAt` default put back as
-- 20260903_notification_preferences/migration.sql created it.
--
-- **Dropping the seven columns destroys whatever is in them.** They are configuration overrides —
-- an API key, a bucket name, a Cloudinary cloud — that an administrator may have set through the
-- settings screen since the migration ran. Read them before running this:
--
--   SELECT "resendApiKey", "emailFrom", "storageProvider", "s3Bucket", "s3Region", "s3Endpoint",
--          "cloudinaryCloudName" FROM shelter_settings;
--
-- A non-NULL value there is a setting someone chose, and this file deletes it. Dropping them also
-- returns the database to a state where those settings cannot be stored at all, while the
-- deployed client still offers the fields.
--
-- Restoring the `updatedAt` default is harmless on its own and is the only part of this file that
-- is. If that is all you want, run just that statement.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DO $$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  ALTER TABLE "public"."notification_preferences"
    ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

  ALTER TABLE "public"."shelter_settings"
    DROP COLUMN IF EXISTS "resendApiKey",
    DROP COLUMN IF EXISTS "emailFrom",
    DROP COLUMN IF EXISTS "storageProvider",
    DROP COLUMN IF EXISTS "s3Bucket",
    DROP COLUMN IF EXISTS "s3Region",
    DROP COLUMN IF EXISTS "s3Endpoint",
    DROP COLUMN IF EXISTS "cloudinaryCloudName";
END $$;

COMMIT;
