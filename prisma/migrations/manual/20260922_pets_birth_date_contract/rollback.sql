-- Undoes the contract half: `pets.age` and `pets.ageCategory` come back, nullable, with their
-- original values restored verbatim from "public"."pets_age_archive_20260922".
--
-- It restores them to the state the contract found them in — present and NULLABLE — not to the
-- state before the whole conversion. Expand is what relaxed them, so expand's own rollback is what
-- re-tightens them. Each file undoes its own half and no more.
--
-- **This file does not touch `birthDate`, and that is deliberate.** Removing it would put
-- production back where every catalogue read raises 42703 and the site serves
-- `src/data/pets.json`. Undoing the expand is `20260922_pets_birth_date/rollback.sql`'s job, and
-- it should be a separate, deliberate decision. Running this one costs nothing but the drift.
--
-- Nothing is lost and nothing is invented. Values come back exactly as the archive holds them,
-- including `derivedIsEstimate`, so a birthday someone actually knew is not demoted to a guess.
-- An animal created after the contract ran has no archive row; its `age` and `ageCategory` simply
-- come back NULL, which the restored columns permit. The earlier revision of this file
-- reconstructed prose for those rows from the birth date, which meant carrying a fourth copy of
-- the age-band thresholds in SQL. Restoring them to NULL says the same thing more honestly: no
-- prose was ever recorded for that animal.
--
-- Requires the archive. If `cleanup.sql` has dropped it, this file aborts rather than invent
-- values — that is the point at which the conversion stops being reversible, and it is why
-- cleanup is a separate, deliberate step.
--
-- One DO block, so both columns change together and the 5-second lock timeout holds even if an
-- editor runs each statement in its own transaction. The advisory lock does NOT hold in that mode
-- — `pg_advisory_xact_lock` releases when its own statement's transaction commits — so paste the
-- whole file at once if anything else might be applying a migration.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DO $$
DECLARE
  has_age     boolean;
  has_archive boolean;
  restored    bigint;
  orphaned    bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pets' AND column_name='age')
    INTO has_age;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='pets_age_archive_20260922')
    INTO has_archive;

  IF has_age THEN
    RAISE NOTICE 'pets.age is already present: nothing to roll back.';
    RETURN;
  END IF;

  IF NOT has_archive THEN
    RAISE EXCEPTION 'pets_age_archive_20260922 is gone (cleanup.sql has run), so the original age values no longer exist; refusing to invent them';
  END IF;

  ALTER TABLE "public"."pets" ADD COLUMN IF NOT EXISTS "age" text;
  ALTER TABLE "public"."pets" ADD COLUMN IF NOT EXISTS "ageCategory" text;

  UPDATE "public"."pets" p
     SET "age"         = a."age",
         "ageCategory" = a."ageCategory"
    FROM "public"."pets_age_archive_20260922" a
   WHERE a."id" = p."id";

  GET DIAGNOSTICS restored = ROW_COUNT;

  SELECT count(*) INTO orphaned FROM "public"."pets" WHERE "age" IS NULL;

  RAISE NOTICE 'Restored age and ageCategory on % pets row(s); % row(s) left NULL because no prose was ever recorded for them (created after the contract ran).',
    restored, orphaned;
END $$;

COMMIT;
