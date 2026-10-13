-- pets.birthDate: add the two columns prisma/schema.prisma declares, backfill them from the
-- prose `age` production still carries, and relax `age`/`ageCategory` so the running release
-- can insert. Nothing is dropped and no existing value is overwritten.
--
-- Why: production's `pets` still has `age` and `ageCategory` and has neither `birthDate` nor
-- `birthDateIsEstimate`. Measured 2026-09-18 by `npm run db:check-drift` from the main
-- checkout, after the owner applied 20260917_status_enums; recorded in
-- tasks/open/production-schema-has-drifted-ahead-of-master.md. Master swapped the columns on
-- 2026-08-28 (6108d82) and the deployed client has selected `birthDate` ever since:
-- src/lib/server/petRepository.ts:65 runs prisma.pet.findMany({ include: PET_INCLUDE }) with
-- no `select`, so Prisma asks Postgres for pets."birthDate" on every catalogue read.
--
-- That the read fails is not reasoning. Master's own generated client, run against a
-- throwaway PostgreSQL carrying the `pets` shape production is measured to have, answers:
--
--   prisma.pet.findMany()  ->  The column `pets.birthDate` does not exist in the current database.
--   prisma.pet.create(...) ->  The column `birthDate of relation pets` does not exist ...
--
-- What happens next in production is the part nobody has watched: handlePersistenceError(...,
-- "read") swallows that failure -- src/lib/persistenceMode.ts:67-81 rethrows only P2002 or
-- under STRICT_PERSISTENCE, and its warn is gated on NODE_ENV === "development", so production
-- logs nothing -- and the reader returns `serverPets`, which petRepository.ts:38-44 initialises
-- from src/data/pets.json. If the deployed build is this schema's, the public catalogue has
-- been answering from the ten bundled demo animals since 2026-08-28, silently.
--
-- The cheap probe nobody has run, worth one minute before applying this: open /pets on the live
-- site. Exactly the ten fixture animals, at fixture ids (pet-001 ... pet-010), means the
-- fallback and confirms the whole chain. Anything else means the read works, and the drift
-- measurement above wants re-reading before this file is applied to anything.
--
-- Writes are the other half, and this is the part a "rename age to birthDate" framing misses.
-- `age` and `ageCategory` were declared `String` -- NOT NULL, no default -- in the schema
-- production was built from (6108d82^), and the running release inserts a pet without either
-- column: PetPersistencePayload (src/lib/server/petMappers.ts:117-149) has no such fields.
-- Adding `birthDate` alone therefore fixes every read and leaves pet creation failing. That was
-- checked rather than assumed: with the columns added but `age` still NOT NULL, the same client
-- refuses the same create, and Prisma reports it as
--
--   Null constraint violation on the (not available)
--
-- naming no column -- so this is also a failure nobody could diagnose from a production log.
-- A `migrate diff` DROP clause does not report nullability, so whether production's copies are
-- still NOT NULL is not measured; the file relaxes both columns whichever way it finds them,
-- and the statement is a no-op if they are already nullable. Their values are kept regardless.
--
-- Why not `prisma db push`: push emits
--   ALTER TABLE "pets" DROP COLUMN "age", DROP COLUMN "ageCategory",
--     ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01', ...
-- which does not migrate anything. Every animal's recorded age is discarded and every row is
-- given the same invented birthday, which the site then renders as a real age. This file reads
-- `age` before adding the column and writes a date derived from it.
--
-- THE BACKFILL RULE
--
--   birthDate := intakeDate - age            birthDateIsEstimate := true
--
-- `age` is prose an intake volunteer typed when the animal arrived ("2 years", "4 months",
-- "2 tahun"), so the birthday it implies is reckoned from `intakeDate`, not from today.
-- Reckoning from today would understate every animal's age by however long it has been in the
-- shelter. This is the rule src/lib/domain/petAge.ts `approximateBirthDate` already implements
-- for legacy rows, and the rule that produced the `birthDate` values in src/data/pets.json --
-- in all ten of those fixtures birthDate is exactly intakeDate minus age. `birthDateIsEstimate`
-- is true for every backfilled row without exception: a date derived from prose is an estimate,
-- whatever the prose claimed.
--
-- Two units are recognised, and only in the spellings the app itself reads:
--   years   [0-9]+ followed by year | years | yr | yrs | y
--   months  [0-9]+ followed by month | months | mth | mths | mo | mos | m
-- Each must end at a word boundary, so "3 minggu" (Malay for three weeks) is refused rather
-- than read as three months on its leading `m`. Years are tried first, so "1 year 6 months"
-- backfills as 1 year -- which is what the app does with the same string.
--
-- THE INVARIANT THIS FILE KEEPS
--
--   For every row it writes, the stored birthDate is exactly what
--   src/lib/domain/petAge.ts `approximateBirthDate(age, intakeDate)` computes.
--
-- That is the property the contract migration depends on: it re-derives every row with the
-- app's own function and compares before it drops `age`, so a mismatch stops the drop instead
-- of discovering it afterwards. Two consequences follow, and both are deliberate.
--
-- **Malay age words are refused, not translated.** `approximateBirthDate` matches only
-- /(\d+)\s*y/ and /(\d+)\s*m/, so "2 tahun", "3 thn", "4 bulan" and "6 bln" match nothing
-- there and it returns the intake date itself -- "born the day we took it in". Reading them as
-- years and months would be *more correct* and was this file's first behaviour, but it would
-- store a value the app does not compute, and the contract migration would then refuse the
-- whole table. So they are refused here and named in the pre-check instead, for a human to
-- rewrite in the same sitting. If your rows carry Malay ages, this is the normalisation to run
-- first -- read it, then run it yourself; this file will not do it for you:
--
--   UPDATE "public"."pets" SET "age" = regexp_replace("age", '(tahun|thn)\M', 'years', 'gi')
--    WHERE "age" ~* '[0-9]+[[:space:]]*(tahun|thn)\M';
--   UPDATE "public"."pets" SET "age" = regexp_replace("age", '(bulan|bln)\M', 'months', 'gi')
--    WHERE "age" ~* '[0-9]+[[:space:]]*(bulan|bln)\M';
--
-- **The date rolls forward rather than clamping.** See the note beside the UPDATE below.
--
-- Either half of the invariant can be broken from the app's side, and both are PR #42's
-- (feat/pet-form-birth-date) to move: widening approximateBirthDate to read Malay, which would
-- let this file widen with it, and changing its rollover to a clamp, which would make this file
-- wrong in the direction it has just moved away from. The app moves first either way. The
-- rehearsal's O2 compares every stored date against that function, so a change there fails this
-- file's checks loudly rather than being discovered in production.
--
-- Scope: `pets` only, and only the two added columns plus the two relaxed constraints. The
-- drop of `age`/`ageCategory` is deliberately NOT here. It destroys the only record of what
-- staff typed and cannot be rolled back, and it buys nothing while the release ignores both
-- columns. It is the contract half of an expand/contract pair and belongs in its own file once
-- this one has been applied and the catalogue is confirmed serving real rows. Until then
-- `db:check-drift` will still report one destructive statement for `pets`, and that is correct.
-- The `shelter_settings` columns are not here either.
--
-- Safety:
--   * One transaction. Any failure leaves `pets` exactly as it was -- no column added, no
--     constraint relaxed, no value written.
--   * Nothing is coerced. A row whose `age` the two units cannot parse, or whose `intakeDate`
--     is not a real calendar date, aborts the file naming that row's id and both values. The
--     column's '2024-01-01' default is never allowed to stand as an answer.
--   * Implausible ages abort too: over 60 years or 720 months is a typo or junk, not an animal.
--   * A fractional or ranged age aborts, rather than being rounded or narrowed. These are the
--     inputs that parse cleanly and mean something else: the rule takes the digit run beside
--     the unit, so "1.5 years" reads as 5 and "3-4 years" reads as 4, and nothing downstream
--     could tell. Choosing a number for either is a claim about an animal nobody here has met.
--     Any second number within five non-digit characters before the unit -- "1.5", "3-4",
--     "1 - 2", "6 to 8", "between 2 and 3" -- is refused and named. A number *after* the unit
--     is not a range, so "2 years, 12.5 kg" backfills normally.
--   * Safe to re-run. A `pets` that already has **both** new columns is left completely alone --
--     this file will not overwrite a date a human has since corrected through the admin form.
--     The two DROP NOT NULLs are no-ops the second time. A table carrying only one of the pair
--     is refused rather than treated as done: the client selects both, so one without the other
--     is still broken, and which of exact-or-estimate the stored dates are is not knowable here.
--   * Refuses rather than invents: if `birthDate` is absent AND `age` is absent, there is
--     nothing to derive from and the file aborts instead of defaulting every row.
--   * The advisory lock serialises this against the other manual migrations only when the file
--     is run as one transaction. Run statement by statement, `pg_advisory_xact_lock` is its own
--     transaction and releases at once -- the same caveat 20260917_status_enums carries. The
--     per-block `lock_timeout` and the all-or-nothing DO block do not depend on it.
--   * ADD COLUMN with a constant default does not rewrite the table on PostgreSQL 11+. The
--     UPDATE and the two DROP NOT NULLs do take an ACCESS EXCLUSIVE lock; this table holds tens
--     of rows, so expect milliseconds. If the lock is not granted within 5 seconds it gives up
--     rather than stalling the live site's reads behind it. Re-run later.
--   * `lock_timeout` is set inside the DO block, not with SET LOCAL at the top, so it holds
--     even if an editor runs each statement in its own transaction.
--   * Every table is named with its schema, so the result does not depend on search_path.
--   * The Prisma-level checks drive findMany({ include: PET_INCLUDE }) -- the query
--     petRepository.ts:65 actually sends, relations and all -- not a simpler bare findMany.
--   * The invariant above is checked, not asserted: every date this file stores is compared
--     against approximateBirthDate's own output across twelve shapes, both rollover cases
--     included, and the transcribed rule is itself pinned against src/data/pets.json so a
--     drifted copy fails first.
--   * The scratch table is TEMP and ON COMMIT DROP. It never exists in `public`.
--   * If a statement does fail, an editor that sends this whole file as one query skips the
--     rest of it, so the COMMIT on the last line never runs and the session is left holding an
--     aborted transaction. Nothing is committed either way -- but the next statement you type
--     will be refused with `current transaction is aborted` until you run ROLLBACK or open a
--     new query. That is the expected shape of a refusal here, not a second problem.
--
-- Apply: run the "before" query, read what it says about your own rows, then paste this whole
-- file into the Neon SQL editor for the production branch, then run the "after" checks.
--
-- Before -- this is the pre-check, and it is the one step not to skip. It names every row this
-- file would refuse, without changing anything:
--
--   SELECT * FROM (
--        SELECT "id", "name", "age", "intakeDate",
--          CASE
--            WHEN left(coalesce("intakeDate",''),10)
--                 !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN 'bad intakeDate'
--            WHEN substr(left("intakeDate",10),9,2)::int
--                 > extract(day FROM (make_date(substr(left("intakeDate",10),1,4)::int,
--                                               substr(left("intakeDate",10),6,2)::int, 1)
--                                     + interval '1 month' - interval '1 day')) THEN 'bad intakeDate'
--            WHEN lower(coalesce("age",''))
--                 ~ '[0-9][^0-9]{1,5}[0-9]+[[:space:]]*(years|year|yrs|yr|y|months|month|mths|mth|mos|mo|m)\M'
--                 THEN 'fractional age'
--            -- Years first and each bound tested only for the unit it belongs to, because that is
--            -- what the file does. Testing both bounds independently made "2 years 800 months"
--            -- read implausible here and backfill as 2 years there.
--            WHEN lower(coalesce("age",'')) ~ '[0-9]+[[:space:]]*(years|year|yrs|yr|y)\M'
--                 THEN CASE WHEN (regexp_match(lower("age"),
--                       '([0-9]+)[[:space:]]*(?:years|year|yrs|yr|y)\M'))[1]::numeric > 60
--                      THEN 'implausible age' ELSE 'ok: years' END
--            WHEN lower(coalesce("age",'')) ~ '[0-9]+[[:space:]]*(months|month|mths|mth|mos|mo|m)\M'
--                 THEN CASE WHEN (regexp_match(lower("age"),
--                       '([0-9]+)[[:space:]]*(?:months|month|mths|mth|mos|mo|m)\M'))[1]::numeric > 720
--                      THEN 'implausible age' ELSE 'ok: months' END
--            ELSE 'unparseable age'
--          END AS verdict
--     FROM "public"."pets"
--        ) v
--    ORDER BY (verdict LIKE 'ok:%'), verdict, "id";
--
-- Every row should read `ok: years` or `ok: months`. The other four verdicts are the four things
-- this file refuses, and each is a row to correct by hand first, or it will abort naming that row:
--
--   bad intakeDate    not a real calendar date; fix the date
--   fractional age    "1.5 years" reads as 5 and "3-4 years" reads as 4; pick one whole
--                     number -- "18 months", "3 years" -- or say which bound you mean
--   implausible age   over 60 years or 720 months; a typo, not an animal
--   unparseable age   no number-and-unit the rule recognises; rewrite as "2 years", "4 months"
--
-- **Read the `age` column itself, not only the verdict.** The rule reads a number and a unit; it
-- cannot read a qualifier around them. "less than 1 year" is taken as exactly 1 year, "2 bulan
-- setengah" as exactly 2 months, "about 3 years" as exactly 3. Each is an estimate stored as an
-- estimate, so none is refused -- but if a row's prose hedges in a direction that matters to
-- someone who knows the animal, this listing is the last chance to say so in whole units.
--
-- Keep the output. After the follow-up file drops `age`, it is the only record of what it held.
--
-- After: the same animals, with dates instead of prose.
--
--   SELECT "id", "name", "age", "intakeDate", "birthDate", "birthDateIsEstimate"
--     FROM "public"."pets" ORDER BY "id";
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'pets'
--      AND column_name IN ('age','ageCategory','birthDate','birthDateIsEstimate')
--    ORDER BY column_name;
--
-- **Everything this file tells you, it tells you through RAISE NOTICE** -- the row count it
-- backfilled, the rows whose date was clamped to a month end, and the "already migrated, nothing
-- rewritten" line. A psql session prints those; the Neon SQL editor is not documented to, so
-- assume you will not see them and read the answers out of the table instead. The count is the
-- first query above. The clamped rows, which are the only ones whose backfilled date is not what
-- the app's own arithmetic would have produced, are these:
--
--   SELECT "id", "name", "age", "intakeDate", "birthDate"
--     FROM "public"."pets"
--    WHERE right("birthDate", 2) <> right(left("intakeDate", 10), 2)
--    ORDER BY "id";
--
-- Expect none unless an animal was taken in on the 29th, 30th or 31st. Each row it returns has a
-- birthday moved back to the end of its month, which is deliberate -- see "THE BACKFILL RULE".
--
-- `birthDate` and `birthDateIsEstimate` should be NOT NULL; `age` and `ageCategory` should now
-- read YES under is_nullable, with every value still present. Then load the public catalogue:
-- the animals shown should be the shelter's, not the ten demo animals from src/data/pets.json.
-- Undo: rollback.sql beside this file -- read its header first, it is not free after go-live.
--
-- Rehearsed 2026-09-22 on a throwaway embedded PostgreSQL 18.4, started by the rehearsal script
-- itself with its connection string inline -- never against production, and resolving nothing
-- from .env.local or prisma.config.ts. The table carried production's shape where it matters:
-- `age`/`ageCategory` present and NOT NULL, no `birthDate`, `status` already converted to
-- "PetStatus" as the owner applied on 2026-09-18, `intakeDate` as text, and every other scalar
-- master's Pet model declares, so a Prisma select differs from it in exactly the two columns.
--
-- Ninety-two checks, all passing. Eighty-five at the SQL level and seven driving master's own
-- generated Prisma client. They are listed in
-- tasks/decisions/2026-09-22-pets-birth-date-backfills-from-intake-date.md. In summary:
--   * The ten src/data/pets.json animals backfill to the exact `birthDate` that file carries,
--     10/10, which is the independent check on the rule -- that fixture was written by hand and
--     this SQL was not derived from it.
--   * English and Malay units, "1 year 6 months" taking the year, and an age embedded in a
--     sentence, all derive what the app's approximateBirthDate derives.
--   * Before: prisma.pet.findMany and prisma.pet.create both fail on the missing column.
--     After: both succeed, the archive update succeeds, and the backfilled date is the right one.
--   * Every refusal leaves the table untouched: unparseable age, NULL age, empty age, a
--     non-date intakeDate, 2024-02-31, month 13, "500 years", a fourteen-digit age, the three
--     fractional shapes "1.5 years", "1,5 tahun" and "1 1/2 years", the vulgar fraction
--     "1<1/2> years", every range spelling tried -- "3-4 years", "1 - 2 years", "3 - 4 years"
--     with an en dash, "6 to 8 months", "between 2 and 3 years", "2 or 3 tahun" -- a
--     non-breaking space between number and unit, and "3 minggu" / "5 hari" / "3 weeks",
--     units this file does not read.
--   * A decimal elsewhere in the string is not a fractional age: "2 years, 12.5 kg" and
--     "3 tahun (lahir 12/06/2023)" both backfill normally rather than blocking the table.
--   * rollback.sql does not tighten a column this file found already nullable, and it names the
--     rows a rollback would strand with neither a birthday nor an age.
--   * A comment already on `age` or `ageCategory` is carried inside the marker and put back by
--     rollback.sql, rather than overwritten -- and it survives a column being relaxed twice.
--   * rollback.sql drops `birthDate` only if this file's marker says this file created it. A
--     column somebody else added is left alone and said so, because dropping it would destroy
--     birthdays this pair never wrote.
--   * The rehearsal database is created UTF8, as Neon is, rather than inheriting the host
--     locale: [[:space:]] and \M are encoding-dependent, and a non-breaking space between the
--     number and the unit parses under WIN1252 and is refused under UTF8.
--   * The pre-check in this header returns the right verdict for each of those, and each
--     verdict matches what the file then actually does -- so a clean pre-check is not
--     followed by an abort.
--   * Re-running changes nothing, including a `birthDate` corrected by hand in between.
--   * Under a held lock it gives up at 5 s having committed nothing, and finishes on a re-run.
--   * Under a foreign search_path the columns still land on public.pets.
--   * rollback.sql returns the table to its previous shape with every `age` kept, and this file
--     applies again afterwards.
--
-- Not rehearsed: production's actual `age` values, and any view, constraint or trigger there
-- that references `age` or `ageCategory`. Either would abort the transaction rather than
-- damage anything -- which is why the "before" query above is worth running first.

BEGIN;

-- Bounds the wait on the advisory lock below, which is taken outside the DO block and so is
-- not covered by the lock_timeout that block sets. Another manual migration holding the same
-- key would otherwise make this statement wait under the session default, which is forever.
SET LOCAL lock_timeout = '5s';

SELECT pg_advisory_xact_lock(4210771001);

DO $$
DECLARE
  has_age          boolean;
  has_age_category boolean;
  has_birth_date   boolean;
  has_estimate     boolean;
  offenders        text;
  clamped          text;
  updated          integer;
  total            integer;
  prior            text;
BEGIN
  -- Give up rather than queue: an ALTER waiting behind a long-open transaction holds every
  -- later read of the table behind it, the live site's included.
  PERFORM set_config('lock_timeout', '5s', true);

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'pets'
  ) THEN
    RAISE EXCEPTION 'public.pets does not exist';
  END IF;

  -- Taken here, before the snapshot below reads the table, rather than left to the first ALTER.
  -- The snapshot alone takes only ACCESS SHARE, so a row inserted between it and the ALTER would
  -- be absent from the scratch table, unmatched by the UPDATE, and left holding the '2024-01-01'
  -- default -- while the "did every row get one" guard still passed, because that guard counts
  -- the snapshot. Locking first makes the read and the write see the same table. Subject to the
  -- 5s lock_timeout above, so this still gives up rather than queueing behind a long transaction.
  LOCK TABLE "public"."pets" IN ACCESS EXCLUSIVE MODE;

  SELECT count(*) FILTER (WHERE column_name = 'age')                 > 0,
         count(*) FILTER (WHERE column_name = 'ageCategory')         > 0,
         count(*) FILTER (WHERE column_name = 'birthDate')           > 0,
         count(*) FILTER (WHERE column_name = 'birthDateIsEstimate') > 0
    INTO has_age, has_age_category, has_birth_date, has_estimate
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pets';

  -- "Already migrated" is decided on both columns, not just `birthDate`. The client selects
  -- every scalar, so one of the pair present without the other leaves it failing on the other
  -- one -- and gating the whole backfill on `birthDate` alone would make this file report
  -- "nothing to do" against a table that is still broken. Refuse instead: adding the missing
  -- column here would have to guess whether the dates already stored are exact or estimates.
  IF has_birth_date <> has_estimate THEN
    RAISE EXCEPTION
      'pets has "%" but not "%". This file will not add the missing one: whether the dates already stored are exact or estimates is not something it can know. Add it by hand with the default the schema declares, or drop the stray column and re-run this file.',
      CASE WHEN has_birth_date THEN 'birthDate' ELSE 'birthDateIsEstimate' END,
      CASE WHEN has_birth_date THEN 'birthDateIsEstimate' ELSE 'birthDate' END;
  END IF;

  IF has_birth_date THEN
    -- Both columns are present: already migrated, or a human has since corrected dates through
    -- the admin form. Either way this file has no business rewriting them.
    RAISE NOTICE 'pets already has "birthDate" and "birthDateIsEstimate"; no column added and no value rewritten.';

  ELSIF NOT has_age THEN
    RAISE EXCEPTION
      'pets has neither "birthDate" nor "age": there is nothing to derive a birthday from, and this file will not give every animal the same invented one. Restore "age" from a backup, or decide the dates by hand.';

  ELSE
    -- One pass over the table, so the check below and the write further down cannot disagree
    -- about a row. TEMP and ON COMMIT DROP: it never exists in "public", and it is gone
    -- whether this transaction commits or aborts.
    --
    -- `qty` is numeric, not int, so a junk digit run cannot overflow before it is refused.
    --
    -- `intake` is built with make_date rather than to_date, and only after the day has been
    -- checked against the length of its own month. to_date does not roll 2024-02-31 forward --
    -- it raises `date/time field value out of range`, which would abort this file with a
    -- message naming no row, and the owner could not tell which animal to fix. The regex bounds
    -- the year away from 0 and the month to 01-12, so make_date below cannot raise either: for
    -- a row that fails any part of this, every expression yields NULL and the row is named by
    -- the check that follows.
    CREATE TEMP TABLE _pets_birth_backfill ON COMMIT DROP AS
    SELECT s.*,
           CASE WHEN substr(s.intake_txt, 9, 2)::int
                     <= extract(day FROM (
                          make_date(substr(s.intake_txt, 1, 4)::int, substr(s.intake_txt, 6, 2)::int, 1)
                          + interval '1 month' - interval '1 day'))
                THEN make_date(substr(s.intake_txt, 1, 4)::int,
                               substr(s.intake_txt, 6, 2)::int,
                               substr(s.intake_txt, 9, 2)::int) END AS intake,
           substr(s.intake_txt, 1, 4)::int AS iy,
           substr(s.intake_txt, 6, 2)::int AS im,
           substr(s.intake_txt, 9, 2)::int AS id_
      FROM (
        SELECT p."id",
               p."age",
               p."intakeDate",
               CASE WHEN left(coalesce(p."intakeDate", ''), 10)
                         ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
                    THEN left(p."intakeDate", 10) END AS intake_txt,
               -- A decimal or fraction anywhere in the age. The unit patterns below take the
               -- digit run that sits next to the unit token, so "1.5 years" would yield 5, not
               -- 1 -- a birthday three and a half years wrong, with every other check passing.
               lower(coalesce(p."age", ''))
                 ~ '[0-9][^0-9]{1,5}[0-9]+[[:space:]]*(years|year|yrs|yr|y|months|month|mths|mth|mos|mo|m)\M'
                 AS fractional,
               CASE
                 WHEN lower(coalesce(p."age", '')) ~ '[0-9]+[[:space:]]*(years|year|yrs|yr|y)\M'
                   THEN 'years'
                 WHEN lower(coalesce(p."age", '')) ~ '[0-9]+[[:space:]]*(months|month|mths|mth|mos|mo|m)\M'
                   THEN 'months'
               END AS unit,
               CASE
                 WHEN lower(coalesce(p."age", '')) ~ '[0-9]+[[:space:]]*(years|year|yrs|yr|y)\M'
                   THEN (regexp_match(lower(p."age"),
                          '([0-9]+)[[:space:]]*(?:years|year|yrs|yr|y)\M'))[1]::numeric
                 WHEN lower(coalesce(p."age", '')) ~ '[0-9]+[[:space:]]*(months|month|mths|mth|mos|mo|m)\M'
                   THEN (regexp_match(lower(p."age"),
                          '([0-9]+)[[:space:]]*(?:months|month|mths|mth|mos|mo|m)\M'))[1]::numeric
               END AS qty
          FROM "public"."pets" p
      ) s;

    SELECT count(*) INTO total FROM _pets_birth_backfill;

    SELECT string_agg(
             format('%L (age=%L, intakeDate=%L)', "id", "age", "intakeDate"),
             E'\n    ' ORDER BY "id")
      INTO offenders
      FROM _pets_birth_backfill
     WHERE intake IS NULL OR unit IS NULL;

    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION E'pets rows whose birthday cannot be derived:\n    %\nCorrect "age" or "intakeDate" for each, then re-run. Nothing has been changed.',
        offenders;
    END IF;

    -- Checked before the plausibility bound, because a fractional age passes that bound: the
    -- 5 taken from "1.5 years" is a perfectly plausible number of years. This is the one input
    -- shape that parses cleanly and means something else entirely, so it is refused rather than
    -- rounded -- rounding it either way is a decision about an animal's age that belongs to
    -- whoever knows the animal. "18 months" says what "1.5 years" meant, and this file reads it.
    SELECT string_agg(
             format('%L (age=%L)', "id", "age"), E'\n    ' ORDER BY "id")
      INTO offenders
      FROM _pets_birth_backfill
     WHERE fractional;

    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION E'pets rows whose "age" is fractional, which this file will not round:\n    %\nThe rule reads the digits next to the unit, so "1.5 years" would be stored as 5 years before intake. Rewrite each in whole units -- "18 months" for "1.5 years" -- then re-run. Nothing has been changed.',
        offenders;
    END IF;

    SELECT string_agg(
             format('%L (age=%L)', "id", "age"), E'\n    ' ORDER BY "id")
      INTO offenders
      FROM _pets_birth_backfill
     WHERE (unit = 'years' AND qty > 60) OR (unit = 'months' AND qty > 720);

    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION E'pets rows whose "age" is not a plausible animal age:\n    %\nOver 60 years is a typo or junk. Correct each, then re-run. Nothing has been changed.',
        offenders;
    END IF;

    ALTER TABLE "public"."pets" ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01';
    ALTER TABLE "public"."pets" ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true;

    -- Marked for the same reason the NOT NULLs are: rollback.sql must undo what this file did and
    -- nothing else. Without a marker, a rollback run against columns somebody else created -- a
    -- stray `db push`, a hand-applied fix -- would drop them and every exact birthday a human has
    -- since typed, none of which this file put there.
    COMMENT ON COLUMN "public"."pets"."birthDate" IS 'added by 20260922_pets_birth_date';
    COMMENT ON COLUMN "public"."pets"."birthDateIsEstimate" IS 'added by 20260922_pets_birth_date';

    -- Roll forward, not clamp. approximateBirthDate builds the date with
    -- Date.UTC(year - n, month, day), so 2026-03-31 minus one month is 2026-03-03 and
    -- 2024-02-29 minus one year is 2023-03-01: the day of month is kept and the overflow spills
    -- into the next month. make_date(target month, 1) + (day - 1) reproduces exactly that.
    -- Neither date is more correct -- every row here is an estimate and the two rules differ by
    -- a day or three. What decides it is that this one can be CHECKED: the contract migration
    -- re-derives every row with the app's own function and compares, which is a check that can
    -- fail. A clamped date could only ever be compared against hand-typed constants.
    UPDATE "public"."pets" p
       SET "birthDate" = to_char(
             CASE WHEN b.unit = 'years'
                  THEN make_date(b.iy - b.qty::int, b.im, 1)
                  ELSE make_date((b.iy * 12 + b.im - 1 - b.qty::int) / 12,
                                 ((b.iy * 12 + b.im - 1 - b.qty::int) % 12) + 1, 1)
             END + (b.id_ - 1),
             'YYYY-MM-DD'),
           "birthDateIsEstimate" = true
      FROM _pets_birth_backfill b
     WHERE p."id" = b."id";

    GET DIAGNOSTICS updated = ROW_COUNT;
    IF updated <> total THEN
      RAISE EXCEPTION 'backfilled % of % pets; refusing to leave the rest on the default',
        updated, total;
    END IF;
    RAISE NOTICE 'backfilled % pets from "age"', updated;

    -- A day of month that cannot survive the subtraction spills into the next month:
    -- 2026-03-31 minus one month is 2026-03-03. That is what the app computes and so what is
    -- stored, but it is the one case where the stored month is not the month a reader expects,
    -- so those rows are named rather than left to be noticed later.
    SELECT string_agg(format('%L: %s - %s = %s', b."id", b.intake_txt, b."age", p."birthDate"),
                      E'
    ' ORDER BY b."id")
      INTO clamped
      FROM _pets_birth_backfill b
      JOIN "public"."pets" p ON p."id" = b."id"
     WHERE substr(p."birthDate", 6, 2)::int
           <> CASE WHEN b.unit = 'years' THEN b.im
                   ELSE ((b.iy * 12 + b.im - 1 - b.qty::int) % 12) + 1 END;

    IF clamped IS NOT NULL THEN
      RAISE NOTICE E'these rolled into the following month, as the app''s own arithmetic does:
    %', clamped;
    END IF;
  END IF;

  -- Independent of the backfill, and idempotent. The running release inserts a pet without
  -- `age` or `ageCategory`; while either is NOT NULL every pet creation fails. Values are kept.
  --
  -- Each column that is actually relaxed is marked with a comment, and only a marked column is
  -- tightened again by rollback.sql. Production's nullability is not measured -- a `migrate diff`
  -- DROP clause does not report it -- so if `age` is already nullable there, the ALTER below is a
  -- no-op. A rollback that then restored NOT NULL unconditionally would leave the column
  -- *stricter* than it found it, in a state production was never in, and every pet creation would
  -- fail 23502 for a reason this migration never caused. The marker is what keeps the pair
  -- symmetric: apply relaxes and marks, rollback tightens and unmarks, and neither touches a
  -- column it did not itself change.
  IF has_age AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pets'
       AND column_name = 'age' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "public"."pets" ALTER COLUMN "age" DROP NOT NULL;
    -- Any comment already on the column is carried inside the marker, not overwritten: this is
    -- the one place an otherwise strictly non-destructive file writes over something, and
    -- rollback.sql puts the original back when it clears the marker.
    -- Unwrap rather than nest: a column relaxed, re-tightened by hand without clearing the
    -- comment, then relaxed again would otherwise carry a marker inside a marker, and rollback
    -- would restore the inner marker as if it were somebody's note.
    SELECT col_description('"public"."pets"'::regclass, a.attnum) INTO prior
      FROM pg_attribute a
     WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'age';
    IF prior LIKE 'NOT NULL removed by 20260922_pets_birth_date%' THEN
      prior := substring(prior FROM ' \| previous comment: (.*)$');
    END IF;
    -- COMMENT ON takes a literal, not an expression, so the text is built first.
    EXECUTE format(
      'COMMENT ON COLUMN "public"."pets".%I IS %L', 'age',
      'NOT NULL removed by 20260922_pets_birth_date; rollback.sql restores it'
      || coalesce(' | previous comment: ' || nullif(prior, ''), ''));
  END IF;

  IF has_age_category AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pets'
       AND column_name = 'ageCategory' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "public"."pets" ALTER COLUMN "ageCategory" DROP NOT NULL;
    SELECT col_description('"public"."pets"'::regclass, a.attnum) INTO prior
      FROM pg_attribute a
     WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'ageCategory';
    IF prior LIKE 'NOT NULL removed by 20260922_pets_birth_date%' THEN
      prior := substring(prior FROM ' \| previous comment: (.*)$');
    END IF;
    -- COMMENT ON takes a literal, not an expression, so the text is built first.
    EXECUTE format(
      'COMMENT ON COLUMN "public"."pets".%I IS %L', 'ageCategory',
      'NOT NULL removed by 20260922_pets_birth_date; rollback.sql restores it'
      || coalesce(' | previous comment: ' || nullif(prior, ''), ''));
  END IF;
END $$;

COMMIT;
