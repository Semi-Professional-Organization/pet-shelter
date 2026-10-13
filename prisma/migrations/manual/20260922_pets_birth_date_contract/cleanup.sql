-- Drops "public"."pets_age_archive_20260922", the copy of `pets.age` / `pets.ageCategory` that
-- the contract migration took before dropping them.
--
-- **Running this makes the conversion irreversible.** `rollback.sql` reads this table and aborts
-- without it, and no other copy of the operator's age prose exists anywhere — those values were
-- never in a Prisma migration, a dump, or a fixture that matches production.
--
-- Run it only once the conversion has been live long enough to trust, and only after reading what
-- is about to be destroyed:
--
--   SELECT count(*) AS rows,
--          count(*) FILTER (WHERE NOT "derivedIsEstimate") AS known_birthdays
--     FROM pets_age_archive_20260922;
--   SELECT "id", "age", "ageCategory", "intakeDate", "derivedBirthDate", "derivedIsEstimate"
--     FROM pets_age_archive_20260922 ORDER BY "id";
--
-- The second query is the last chance to compare a stored birthday against the prose it was
-- derived from. A row whose `age` reads "3 years" against a `derivedBirthDate` eleven years back
-- is a parse that went wrong, and after this file runs there is nothing left to notice it with.
--
-- Until this runs, `npm run db:check-drift` reports one destructive statement,
-- `DROP TABLE "pets_age_archive_20260922"`, because prisma/schema.prisma does not declare this
-- table. That single statement is the whole of the remaining drift and is expected. Drift reaches
-- zero when this file runs.
--
-- Keeping the archive costs a few kilobytes and nothing else: no application code reads it, and
-- Prisma never touches a table absent from the schema. There is no deadline.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DROP TABLE IF EXISTS "public"."pets_age_archive_20260922";

COMMIT;
