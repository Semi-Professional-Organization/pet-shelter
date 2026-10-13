-- Pet birth date, CONTRACT half: archive `pets.age` and `pets.ageCategory`, then drop them.
--
-- **Run `20260922_pets_birth_date/migration.sql` first, and leave time between the two.**
-- That file is the expand half: it adds `birthDate` / `birthDateIsEstimate`, backfills every row
-- from that row's own intake date and age prose, and relaxes the two old columns to nullable
-- without destroying anything. This file is the other half of that pair and does the destroying.
--
-- Why the pair, rather than one file that does both. The expand half is what stops the outage:
-- production has no `birthDate`, the deployed client selects it on every catalogue read
-- (`getServerPetsAsync`, src/lib/server/petRepository.ts:64, passes no `select`), so every read
-- raises 42703, `handlePersistenceError(…, "read")` swallows it, and the live site serves
-- `src/data/pets.json`. Expand fixes that and is reversible with no data loss. Dropping the two
-- columns fixes nothing further — it only removes the drift and the last copy of the operator's
-- age prose. There is no reason for those to happen in the same minute, and one good reason not
-- to: between them, someone can read the derived birthdays against the prose that produced them,
-- in production, with both still present. That window is the whole point. Use it.
--
-- **This file deliberately does not derive anything.** An earlier revision carried its own
-- backfill, which meant two files in this repo each owned a rule for turning "2 years" into a
-- date — and they disagreed, because the expand half clamps a month-end subtraction
-- (2026-03-31 minus one month is 2026-02-28) where this one's JavaScript-shaped arithmetic rolled
-- it forward to 2026-03-03. Measured, not assumed: three of five test rows differed. Two rules for
-- one conversion is the defect `AGENTS.md` names under "Boundaries and duplication", so this half
-- no longer has one. The expand half owns the arithmetic; this half owns the archive and the drop.
--
-- How it knows expand actually ran, without re-deriving anything to check:
--
--   * Expand ends with `ALTER COLUMN "age" DROP NOT NULL`, so after it, `pets.age` is NULLABLE.
--   * A hand-patched `ALTER TABLE pets ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01'`
--     — the obvious emergency move to stop the read storm, and `db push`'s own statement with the
--     drops left off — leaves `age` exactly as it was: NOT NULL.
--
-- So "birthDate exists AND age is nullable" means expand ran, and "birthDate exists AND age is
-- still NOT NULL" means someone patched the column in by hand and those dates are very likely all
-- '2024-01-01'. This file proceeds on the first and refuses on the second, naming what to do. That
-- discriminator is structural and costs one catalog lookup; the earlier version tried to tell the
-- two apart by re-deriving every row, which is what forced the duplicate rule in the first place.
--
-- Reversibility. `DROP COLUMN` is a one-way door and `birthDate` cannot reconstruct an operator's
-- free-text "2 years" or their hand-picked band, so both columns are copied to
-- "public"."pets_age_archive_20260922" first, together with each row's `birthDate` and
-- `birthDateIsEstimate` as they stand. `rollback.sql` restores from it verbatim and aborts if
-- `cleanup.sql` has already dropped it. This half's rollback does NOT remove `birthDate` — undoing
-- the expand is the expand's own rollback, and doing it here would put the site back on fixtures.
--
-- The archive is a table `prisma/schema.prisma` does not declare, so until `cleanup.sql` drops it
-- `npm run db:check-drift` reports one extra destructive statement,
-- `DROP TABLE "pets_age_archive_20260922"`. That is expected, and it is the price of a rollback
-- that can restore the original prose. Drift reaches zero when cleanup runs, not before.
--
-- Safety:
--   * One transaction. Any failure leaves `age`, `ageCategory` and the archive as they were.
--   * Nothing is coerced, nothing is guessed, and no value is computed from another.
--   * Safe to re-run: a table with no `age` and a present `birthDate` is a no-op, and the archive
--     insert is ON CONFLICT DO NOTHING.
--   * Takes the same advisory lock key as every other manual migration here — but only when the
--     file runs as ONE transaction. `pg_advisory_xact_lock` is released when its own statement's
--     transaction commits, so an editor running statements separately holds nothing by the time
--     the ALTERs run. The 5-second `lock_timeout` does survive that mode, because it is set inside
--     the DO block. Paste the whole file at once.
--   * Every table is schema-qualified, so the result does not depend on search_path.
--
-- Apply: read the window first. This is the query the soak exists for, and it stops working the
-- moment this file runs:
--
--   SELECT "id", "name", "age", "ageCategory", "intakeDate", "birthDate", "birthDateIsEstimate"
--     FROM pets ORDER BY "birthDate";
--
-- Look for a birthday that disagrees with the prose beside it. Then paste this whole file into the
-- Neon SQL editor for the production branch. After:
--
--   SELECT count(*) AS archived,
--          count(*) FILTER (WHERE NOT "derivedIsEstimate") AS known_birthdays
--     FROM pets_age_archive_20260922;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='pets' AND column_name IN ('age','ageCategory');
--
-- The second returns no rows. Undo: rollback.sql. Drop the archive: cleanup.sql.
--
-- Rehearsed with `rehearse.mjs` beside this file — `npx tsx
-- prisma/migrations/manual/20260922_pets_birth_date_contract/rehearse.mjs`. It runs the real
-- expand file when it is present in the tree, and otherwise builds the post-expand shape directly;
-- the contract's correctness does not depend on expand's arithmetic, which is the point of the
-- split. Not rehearsed: production's actual rows, and any view or constraint there referencing
-- `age`. Either aborts the transaction rather than damaging anything.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DO $$
DECLARE
  has_age          boolean;
  has_age_category boolean;
  has_birth_date   boolean;
  age_is_nullable  boolean;
  birth_is_expands boolean;
  sentinel_count   bigint;
  total_count      bigint;
  null_birth_dates bigint;
  archived_count   bigint;
  known_count      bigint;
BEGIN
  -- Give up rather than queue: an ALTER waiting behind a long-open transaction holds every later
  -- read of `pets` behind it, the live catalogue's included.
  PERFORM set_config('lock_timeout', '5s', true);

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pets' AND column_name='age')
    INTO has_age;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pets' AND column_name='ageCategory')
    INTO has_age_category;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pets' AND column_name='birthDate')
    INTO has_birth_date;

  IF NOT has_age AND NOT has_age_category AND has_birth_date THEN
    RAISE NOTICE 'pets.age and pets.ageCategory are already gone: nothing to do.';
    RETURN;
  END IF;

  IF NOT has_birth_date THEN
    RAISE EXCEPTION 'pets has no "birthDate" column'
      USING HINT = 'This is the contract half. Apply '
                   'prisma/migrations/manual/20260922_pets_birth_date/migration.sql first, leave '
                   'a soak window, read the birthdays it derived against the age prose, then run '
                   'this file.';
  END IF;

  -- The discriminator: the marker expand stamps on the column it creates.
  --
  -- `COMMENT ON COLUMN "public"."pets"."birthDate" IS 'added by 20260922_pets_birth_date'` is
  -- written by expand and cannot be produced by a hand `ALTER TABLE ... ADD COLUMN`, so it is
  -- decisive about where these values came from. Expand's own rollback already keys off it before
  -- dropping the column, for the same reason.
  --
  -- An earlier revision used `age`'s nullability instead, on the theory that expand relaxes it and
  -- a hand-patch does not. `/code-review max` showed that is defeatable by following this repo's
  -- own files in order: an operator stops the read storm with `ADD COLUMN birthDate ... DEFAULT
  -- '2024-01-01'` plus `ALTER COLUMN age DROP NOT NULL` so creates work again, then runs expand,
  -- which takes its `IF has_birth_date` no-op branch but still relaxes and marks `age` because that
  -- block is "independent of the backfill". Both old signals then say "expand ran" while every
  -- birthday is the sentinel — and the drop is irreversible. The marker is not satisfiable that
  -- way, because expand only writes it on the branch that actually creates the column.
  SELECT coalesce(col_description('"public"."pets"'::regclass, a.attnum), '')
           LIKE 'added by 20260922_pets_birth_date%'
    INTO birth_is_expands
    FROM pg_attribute a
   WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'birthDate';

  IF birth_is_expands IS NOT TRUE THEN
    RAISE EXCEPTION
      'pets."birthDate" carries no marker from the expand migration, so these values were not derived from each animal''s age'
      USING HINT =
        'The column was most likely added by hand to stop the 42703 read storm, which means every '
        'birthDate is the ''2024-01-01'' default. Dropping "age" now would make that permanent and '
        'unrecoverable. Count them first: SELECT count(*) FILTER (WHERE "birthDate" = '
        '''2024-01-01'') FROM pets; then drop both added columns, run '
        'prisma/migrations/manual/20260922_pets_birth_date/migration.sql so the dates are derived '
        'from the prose, and only then run this file.';
  END IF;

  -- Kept as a second, weaker signal. It cannot be the discriminator, but a table where expand
  -- marked the column and yet left `age` NOT NULL is a state neither file produces, and stopping
  -- is cheaper than guessing what happened.
  SELECT is_nullable = 'YES' INTO age_is_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='pets' AND column_name='age';

  IF has_age AND NOT age_is_nullable THEN
    RAISE EXCEPTION
      'pets."birthDate" is marked as expand''s, but "age" is still NOT NULL -- neither file leaves the table in that state'
      USING HINT = 'Re-run prisma/migrations/manual/20260922_pets_birth_date/migration.sql, whose '
                   'NOT NULL relaxation is idempotent, then run this file.';
  END IF;

  -- Actually run the sentinel count, rather than printing it in a hint and hoping. An earlier
  -- revision put this query in a HINT on a refusal that the hand-patch path never reached, so the
  -- one check capable of noticing "every birthday is the placeholder" was never executed on any
  -- path. If every animal shares the schema default, that is the signature of a column filled in
  -- by hand, whatever the markers say.
  SELECT count(*) FILTER (WHERE "birthDate" = '2024-01-01'), count(*)
    INTO sentinel_count, total_count
    FROM "public"."pets";

  IF total_count > 1 AND sentinel_count = total_count THEN
    RAISE EXCEPTION
      'all % pets rows carry birthDate ''2024-01-01'', the schema default -- these are placeholders, not derived birthdays', total_count
      USING HINT = 'Dropping "age" now would destroy the only real record of these animals'' ages. '
                   'Re-derive first with 20260922_pets_birth_date/migration.sql.';
  END IF;

  IF sentinel_count > 0 THEN
    RAISE NOTICE
      '% of % pets carry birthDate ''2024-01-01''. That is the schema default as well as a real date, so it is not conclusive -- check those rows against their "age" before continuing.',
      sentinel_count, total_count;
  END IF;

  SELECT count(*) INTO null_birth_dates FROM "public"."pets" WHERE "birthDate" IS NULL;
  IF null_birth_dates > 0 THEN
    RAISE EXCEPTION '% pets row(s) have no birthDate; dropping "age" would leave them with no age at all',
      null_birth_dates
      USING HINT = 'Re-run the expand migration, which backfills every row and refuses to leave '
                   'any on the column default.';
  END IF;

  -- Holds both dropped columns verbatim, plus each row's birth date and estimate flag as they
  -- stand at the moment of the drop. rollback.sql reads it; cleanup.sql drops it.
  CREATE TABLE IF NOT EXISTS "public"."pets_age_archive_20260922" (
    "id"                text PRIMARY KEY,
    "age"               text,
    "ageCategory"       text,
    "intakeDate"        text,
    "derivedBirthDate"  text        NOT NULL,
    "derivedIsEstimate" boolean     NOT NULL DEFAULT true,
    "archivedAt"        timestamptz NOT NULL DEFAULT now()
  );

  -- For an archive written by an earlier revision of this file, which had neither column.
  ALTER TABLE "public"."pets_age_archive_20260922"
    ADD COLUMN IF NOT EXISTS "derivedIsEstimate" boolean NOT NULL DEFAULT true;

  INSERT INTO "public"."pets_age_archive_20260922"
    ("id", "age", "ageCategory", "intakeDate", "derivedBirthDate", "derivedIsEstimate")
  SELECT "id", "age", "ageCategory", "intakeDate", "birthDate", "birthDateIsEstimate"
    FROM "public"."pets"
  ON CONFLICT ("id") DO NOTHING;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  SELECT count(*) INTO known_count
    FROM "public"."pets_age_archive_20260922" WHERE NOT "derivedIsEstimate";

  IF has_age THEN
    ALTER TABLE "public"."pets" DROP COLUMN "age";
  END IF;
  IF has_age_category THEN
    ALTER TABLE "public"."pets" DROP COLUMN "ageCategory";
  END IF;

  RAISE NOTICE 'Archived % pets row(s) before dropping "age" and "ageCategory"; % carried a birthday marked as known rather than estimated.',
    archived_count, known_count;
END $$;

COMMIT;
