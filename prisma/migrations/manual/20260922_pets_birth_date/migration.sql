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
-- Two units are recognised:
--   years   [0-9]+ followed by year | years | yr | yrs | y
--   months  [0-9]+ followed by month | months | mth | mths | mo | mos | m
-- Each must end at a word boundary, so "3 minggu" (Malay for three weeks) is refused rather
-- than read as three months on its leading `m`. Years are tried first, so "1 year 6 months"
-- backfills as 1 year -- which is what the app does with the same string.
--
-- **This file reads a strict subset of what the app reads, and that is deliberate.** Since #42
-- (2026-10-14) `approximateBirthDate` also reads weeks in both languages (`weeks`, `wks`,
-- `minggu`, `mggu` -- "3 minggu" is three weeks, not three months), Malay years and months
-- (`tahun`, `thn`, `bulan`, `bln`), `mnth` and `yo`. None of those is transcribed here, and **any
-- string containing one of them, anywhere, is refused** and named -- including a string that also
-- contains an English unit this file does read.
--
-- That last part is the fix for a defect found on 2026-10-14. Before it, `1 tahun 6 months` was
-- not refused: the app tries years first, reads `tahun`, and stops at one year, while this file
-- skipped `tahun`, found `6 months` further along, and stored six months -- a different birthday,
-- no error. Three of five mixed strings measured that way. #42 opened it by teaching the app Malay;
-- the earlier `yo` mixes predate even that. The refusal now sits in this file's unit
-- classification and in the pre-check query below, together, so the pre-check names these rows
-- `unparseable age` before anything runs.
--
-- **Cost, deliberately accepted:** `3 minggu 2 months` and `2 years 3 weeks` used to agree (both
-- sides read the English unit) and are now refused too. Telling "agrees by luck" from "agrees by
-- rule" would need a second copy of the app's unit precedence in this file. Refusing costs one
-- manual correction per row; the pre-check lists them first.
--
-- An earlier version of this paragraph said these mixed strings were not refused, and before that,
-- that every string this file does not read is refused, and before that, that it read "the
-- spellings the app itself reads". The first was measured; the other two were asserted.
--
-- The comparison against the app lives in `20260922_pets_birth_date_contract/rehearse.mjs`,
-- scenario 0, run with `npx tsx`. It runs this file's SQL against the REAL `approximateBirthDate`,
-- imported rather than copied, on every spelling above, the four rollover cases and a compound, in
-- any timezone; it asserts that each single-unit app-only spelling is read by the app and refused
-- here; and it re-runs this file's own pre-check pairing on the mixed and non-ASCII strings, so
-- each is refused under the verdict the pre-check gives it. It is not wired into `npm test` or CI -- it runs
-- when someone runs it. This file's own `rehearse.mjs` compares against `appRule`, a hand copy
-- that has drifted from the function on both timezone and vocabulary since #42 -- see
-- `tasks/open/the-backfill-rehearsal-is-only-correct-at-positive-utc-offsets.md`.
--
-- THE INVARIANT THIS FILE KEEPS
--
--   For every row it writes, the stored birthDate is exactly what
--   src/lib/domain/petAge.ts `approximateBirthDate(age, intakeDate)` computes.
--
-- **Nothing downstream re-checks this, so the soak window is the check.** An earlier revision of
-- the contract half did re-derive every row with the app's own function and compare before
-- dropping `age`, and this paragraph used to promise that. It no longer does: carrying a second
-- copy of the derivation meant two files owning one rule, and they had already drifted apart on
-- month-end and leap-day rows, so the contract's copy was deleted. The contract now archives and
-- drops without reading a single date. **A row this file reads differently from what the operator
-- meant is therefore caught only by a human looking, between the two steps.** That is what the
-- soak window is for; it is not optional, and the correction below is why it is being spelled out.
--
-- Two consequences follow from the invariant, and both are deliberate.
--
-- **Malay age words are refused, not translated.** Since #42 `approximateBirthDate` does read
-- "2 tahun", "3 thn", "4 bulan" and "6 bln" as years and months -- an earlier version of this
-- paragraph said it matched only /(\d+)\s*y/ and /(\d+)\s*m/ and fell through to the intake
-- date, which was true until #42 merged. This file still refuses them on purpose: transcribing a
-- unit means keeping a second copy of the app's rule for it in SQL, and every copy is a place for
-- the two to drift. Refusing one costs a manual correction; storing one differently is a silent
-- wrong birthday. They are named in the pre-check, for a human to rewrite in the same sitting.
--
-- The normalisation below makes such a row derivable here, and after it the two sides agree:
-- "2 tahun" becomes "2 years", which this file reads and the app reads the same way. Read it,
-- then run it yourself; this file will not do it for you:
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
--   * The invariant above is checked -- but not by this file's own rehearsal any more. That
--     harness compares against `appRule`, a transcription of approximateBirthDate that has
--     drifted from it since #42 (local-time setters, the old unanchored patterns), and its
--     guard pins the copy against src/data/pets.json, whose ages are all plain English, so it
--     cannot see the drift. The comparison against the REAL function, imported rather than
--     copied, is in `20260922_pets_birth_date_contract/rehearse.mjs` scenario 0: nineteen
--     spellings and the rollover cases, in any timezone. An earlier version of this bullet said
--     "a drifted copy fails first"; #42 showed it does not.
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
--            WHEN current_setting('server_encoding') <> 'UTF8' THEN 'database not UTF8'
--            WHEN octet_length(coalesce("age",'')) <> char_length(coalesce("age",''))
--                 THEN 'non-ASCII age'
--            WHEN left(coalesce("intakeDate",''),10)
--                 !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN 'bad intakeDate'
--            WHEN substr(left("intakeDate",10),9,2)::int
--                 > extract(day FROM (make_date(substr(left("intakeDate",10),1,4)::int,
--                                               substr(left("intakeDate",10),6,2)::int, 1)
--                                     + interval '1 month' - interval '1 day')) THEN 'bad intakeDate'
--            WHEN lower(coalesce("age",''))
--                 ~ '[0-9]+[[:space:]]*(tahun|thn|bulan|bln|minggu|mggu|weeks|week|wks|wk|mnths|mnth|yo)\M'
--                 THEN 'unparseable age'
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
-- Every row should read `ok: years` or `ok: months`. The other five verdicts are the five things
-- this file refuses, and each is a row to correct by hand first, or it will abort naming that row
-- (a sixth, `database not UTF8`, is on every row or none, and means this file will not run here):
--
--   non-ASCII age     a no-break space, an accented letter, an en dash, a vulgar fraction -- any
--                     character outside plain ASCII, which the app and this file can read
--                     differently; retype it in plain ASCII, as one whole number and unit.
--                     Checked first, so every check after it reads ASCII only.
--   bad intakeDate    not a real calendar date; fix the date
--   fractional age    "1.5 years" reads as 5 and "3-4 years" reads as 4; pick one whole
--                     number -- "18 months", "3 years" -- or say which bound you mean
--   implausible age   over 60 years or 720 months; a typo, not an animal
--   unparseable age   no number-and-unit the rule recognises; rewrite as "2 years", "4 months"
--
-- **Read the `age` column itself, not only the verdict.** The rule reads a number and a unit; it
-- cannot read a qualifier around them. "less than 1 year" is taken as exactly 1 year, "nearly 2
-- years" as exactly 2, "about 3 years" as exactly 3. Each is an estimate stored as an estimate, so
-- none is refused -- but if a row's prose hedges in a direction that matters to someone who knows
-- the animal, this listing is the last chance to say so in whole units. (An earlier version gave
-- "2 bulan setengah" as an example read as 2 months. It is refused: any age containing a Malay
-- unit is, since b40a7d7, and it appears in this listing as `unparseable age`.)
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
-- backfilled, the rows whose date rolled past a short month, and the "already migrated, nothing
-- rewritten" line. A psql session prints those; the Neon SQL editor is not documented to, so
-- assume you will not see them and read the answers out of the table instead. The count is the
-- first query above. The rolled rows -- which ARE what the app's own arithmetic computes, and are
-- listed only because a reader may not expect a birthday in the month after the one subtracted
-- to -- are these. (An earlier version called them "clamped to a month end" and "the only ones
-- whose date is not what the app would have produced"; that described the rule before b40a7d7.)
--
--   SELECT "id", "name", "age", "intakeDate", "birthDate"
--     FROM "public"."pets"
--    WHERE right("birthDate", 2) <> right(left("intakeDate", 10), 2)
--    ORDER BY "id";
--
-- Expect none unless an animal was taken in on the 29th, 30th or 31st. Each row it returns has a
-- birthday rolled FORWARD past a month that is too short -- intake 2026-03-31 minus one month is
-- stored as 2026-03-03, not 2026-02-28 -- which is deliberate, because it is what the app's own
-- approximateBirthDate computes for the same string. An earlier version of this line said
-- "moved back to the end of its month"; that described the clamping rule this file used before
-- b40a7d7, and is the opposite of what it now does.
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
-- Ninety-two checks, all passing when run on 2026-09-22. Eighty-five at the SQL level and seven
-- driving master's own generated Prisma client. They are listed in
-- tasks/decisions/2026-09-22-pets-birth-date-backfills-from-intake-date.md. **Two of them, O1 and
-- O2, have since stopped meaning what they say**: they compare against `appRule`, a copy of
-- approximateBirthDate that #42 left behind, so they still pass against a rule the app no longer
-- uses. The live comparison is in the contract harness (see the invariant bullet above). Not
-- re-run after the 2026-10-14 refusal change -- this harness needs embedded-postgres; the parts of
-- it that change touches, J1 and J3, are reproduced and pass in the contract harness. In summary:
--   * The ten src/data/pets.json animals backfill to the exact `birthDate` that file carries,
--     10/10, which is the independent check on the rule -- that fixture was written by hand and
--     this SQL was not derived from it.
--   * English units, "1 year 6 months" taking the year, and an age embedded in a sentence derive
--     what approximateBirthDate derives. Malay units do not: since b40a7d7 they are refused, and
--     since 2026-10-14 so is any string that contains one alongside an English unit. (An earlier
--     version of this bullet said "English and Malay units ... all derive what the app derives".)
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
    --
    -- The non-ASCII refusal below compares bytes to characters, which means "non-ASCII" only
    -- under UTF8. Neon databases are UTF8; this makes that an enforced fact rather than a belief.
    -- Here, not at the top, so a non-UTF8 database that only needs the NOT NULL relax still gets it.
    IF current_setting('server_encoding') <> 'UTF8' THEN
      RAISE EXCEPTION 'this file assumes a UTF8 database, and this one is %. Nothing has been changed.',
        current_setting('server_encoding');
    END IF;

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
               -- Under UTF8 a string is longer in bytes than in characters exactly when it holds
               -- a character outside ASCII. No regex and no escape, so no locale and no editor
               -- can change what this matches.
               octet_length(coalesce(p."age", '')) <> char_length(coalesce(p."age", ''))
                 AS non_ascii,
               CASE
                 -- Any unit the app reads and this file does not, ANYWHERE in the string, makes
                 -- the row underivable -- not only when it is the unit that would have matched.
                 -- Without this, "1 tahun 6 months" skips `tahun`, finds `6 months`, and stores
                 -- six months while the app reads one year: a different birthday, no error. #42
                 -- taught the app these units; this keeps the backfill to "store what the app
                 -- computes, or refuse". Checked first, so it wins over an English unit later on.
                 -- Non-ASCII text is refused separately, before any of this is consulted.
                 --
                 -- ceiling: a deny list, kept by hand beside petAge.ts's AGE_*_PATTERNs, so a unit
                 -- added there and not here reopens the silent divergence, and nothing in `npm test`
                 -- or CI compares them -- only contract/rehearse.mjs scenario 0, run by hand. It
                 -- over-refuses by design ("3 minggu 2 months" agreed by luck and is now refused).
                 -- Upgrade path: a vitest test that extracts both alternations and asserts the
                 -- app's vocabulary is a subset of this file's accept list plus this deny list,
                 -- run in CI.
                 WHEN lower(coalesce(p."age", ''))
                        ~ '[0-9]+[[:space:]]*(tahun|thn|bulan|bln|minggu|mggu|weeks|week|wks|wk|mnths|mnth|yo)\M'
                   THEN NULL
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

    -- Any character outside ASCII, refused whole, and first. The app's patterns are JS regexes and
    -- this file's are Postgres ones, and outside ASCII they can disagree in either direction: JS
    -- `\s` matches a no-break space where Postgres `[[:space:]]` (under the ctypes measured) does
    -- not, so "1<NBSP>year 6 months" was one year to the app and six months here; Postgres
    -- `[[:space:]]` matches U+0085 under some ctypes where JS `\s` never does; and a non-ASCII
    -- letter after a unit ends a word for JS `\b` but not for Postgres `\M`. An earlier version
    -- listed whitespace code points one by one, and a review found the next case the same day.
    -- First, so that every check below reads ASCII only, where the two engines agree under any
    -- ctype -- which no one has measured on production. The cost: an en-dash range or a vulgar
    -- fraction is named here rather than as fractional, so the message below says so.
    SELECT string_agg(
             format('%L (age=%L)', "id", "age"), E'\n    ' ORDER BY "id")
      INTO offenders
      FROM _pets_birth_backfill
     WHERE non_ascii;

    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION E'pets rows whose "age" contains a non-ASCII character, which this file will not interpret:\n    %\nA no-break space, an accented letter, an en dash or a vulgar fraction can be read one way by the app and another way here, and is invisible or near enough in this listing. Retype each in plain ASCII as one whole number and unit -- "2 years", "18 months" -- then re-run. Nothing has been changed.',
        offenders;
    END IF;

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
    -- a day or three. What decides it is that this one can be CHECKED: the contract harness
    -- (20260922_pets_birth_date_contract/rehearse.mjs, scenario 0) imports the app's own function
    -- and compares it against this UPDATE's output, which is a check that can fail. A clamped date
    -- could only ever be compared against hand-typed constants. (This comment used to say the
    -- contract MIGRATION re-derives every row; it stopped doing that when the pair was split, so
    -- that a second copy of this rule would not exist.)
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
