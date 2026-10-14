# The pet birth-date backfill derives from each row's own intake date and age prose

**Decided:** 2026-09-22

`prisma/migrations/manual/20260922_pet_birth_date/` converts production's `pets.age` /
`pets.ageCategory` text columns to the `birthDate` / `birthDateIsEstimate` pair
`prisma/schema.prisma` has declared since `6108d82` (2026-08-28). This entry records the choices
inside it that someone could reasonably reverse.

## Why it was urgent, which the drift note had not established

The drift note treated this conversion as pending hygiene. It is not: the deployed client's pet
**reads** fail against production.

Captured 2026-09-22 with no database, over a `pg` pool whose `query` records the statement and
throws — the technique the 2026-09-16 application-insert measurement used:

    SELECT "public"."pets"."id", "public"."pets"."name", "public"."pets"."species",
           "public"."pets"."breed", "public"."pets"."birthDate",
           "public"."pets"."birthDateIsEstimate", ... FROM "public"."pets"
           WHERE 1=1 ORDER BY "public"."pets"."createdAt" DESC OFFSET $1

`getServerPetsAsync` (`src/lib/server/petRepository.ts:64`) passes `orderBy` and `include` but no
`select`, so Prisma requests every scalar column. The 2026-09-18 drift re-measurement in
`tasks/open/production-schema-has-drifted-ahead-of-master.md` shows production still being offered
`ADD COLUMN "birthDate"`, so production has neither column. That query therefore raises 42703 on
every call; `handlePersistenceError(…, "read")` swallows it outside `STRICT_PERSISTENCE`; and the
catalogue falls back to `src/data/pets.json`.

**Chain of evidence, stated honestly:** the SELECT is measured here. That production lacks the
column is read from the 2026-09-18 measurement, not from a connection this session made — agents
are denied production access and `npx prisma migrate*`. The conclusion follows from those two, and
would be falsified by production having gained the column since 2026-09-18.

Writes fail from the other side: production's `age` and `ageCategory` are `TEXT NOT NULL` with no
default (`git show 6108d82^:prisma/schema.prisma`), and the deployed client never supplies them.

## The backfill is a transcription of the application's own function, not a new rule

`approximateBirthDate` (`src/lib/domain/petAge.ts:150`) already converts an age string and an
intake date into a birth date, and `mapDbPetToPet` has been calling it for legacy rows all along.
The migration reimplements exactly that rule in SQL — years win outright over months, unreadable
prose falls back to the intake date, every path sets `isEstimate` — rather than inventing a second
interpretation of what "2 years" meant.

**Rejected: `prisma db push`'s own statement.** It emits
`ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01'`, giving every animal the same invented
birthday, which the UI renders as a real age indistinguishable from a known one. The date is not
Prisma's invention — it is the `@default` on `prisma/schema.prisma:78`. The column keeps that
default, so drift comes out clean; no existing row receives it.

**Rejected: interval arithmetic.** `intakeDate - interval '1 year'` clamps 2024-02-29 to
2023-02-28. JavaScript's `Date.setFullYear` rolls it *forward* to 2023-03-01. The migration builds
dates as `make_date(y, m, 1) + (day - 1)`, which reproduces the JS overflow exactly. Same for
`setMonth`: 2026-03-31 minus one month is 2026-03-03, not 2026-02-28.

**Corrected during rehearsal: UTC, not `CURRENT_DATE`.** For an unparseable intake date the JS
returns `new Date().toISOString().split("T")[0]` — the UTC day. The first draft used
`CURRENT_DATE`, which in Malaysia (UTC+8) is a day ahead of that for eight hours out of
twenty-four. The rehearsal caught it as a one-day mismatch on a single row. It now reads
`timezone('UTC', now())::date`. `rollback.sql` deliberately keeps `CURRENT_DATE`, because the
function *it* mirrors — `computeAgeInMonths(…, new Date())` — reads local date components.

## Reversibility is bought with an archive, and the archive costs one drift statement

`DROP COLUMN` is a one-way door, and `birthDate` cannot reconstruct an operator's free-text
"2 years" or their hand-picked band. Both columns are copied to
`public.pets_age_archive_20260922` before they are dropped, together with what each row derived
and whether its prose parsed. `rollback.sql` restores from it verbatim and **aborts** if the table
is gone rather than inventing values.

The archive round-trips in both directions: `rollback.sql` writes archive rows for animals created
*after* the conversion, keeping their real `birthDate` as `derivedBirthDate`, so re-applying
`migration.sql` restores those dates exactly rather than re-deriving them from synthesised prose.

**The cost, stated rather than hidden:** `prisma/schema.prisma` does not declare this table, so
until `cleanup.sql` drops it, `npm run db:check-drift` reports one extra destructive statement,
`DROP TABLE "pets_age_archive_20260922"`. Drift reaches zero when cleanup runs and not before.
The alternative — no archive — would have made `rollback.sql` a file that cannot do what its name
says. Keeping a real rollback was judged worth one statement of known, documented drift.

## Rehearsal

PostgreSQL 17 (pglite, embedded — no Docker daemon and no PostgreSQL binary on this machine, and
agents may not reach production), on a `pets` table shaped like production's: `age`/`ageCategory`
`TEXT NOT NULL`, no `birthDate`, `status` already the `PetStatus` enum the owner applied on
2026-09-18, and the two status indexes present.

Seeded with the ten `src/data/pets.json` animals plus ten deliberately awkward rows: a leap-day
intake, two month-end intakes, `"2 years 3 months"`, `"18 months"`, `"3y"`, `"2 YEARS"`, prose with
no figure, an empty string, and an unparseable intake date.

**46 checks, all passed**, and the harness is committed beside the SQL as `rehearse.mjs` — run it
with `npx tsx prisma/migrations/manual/20260922_pet_birth_date/rehearse.mjs`. It is committed
rather than thrown away because a rehearsal that can only be re-read is a claim, not evidence.

Every one of the twenty derived dates equalled what `approximateBirthDate` returns for the same
input — the real assertion, since the SQL is a transcription and a transcription is only worth its
diff against the original. The script imports the function; asserting against hand-typed constants
would prove only that the constants and the SQL agree about what the function probably does.

Also: every row flagged an estimate; no row got `2024-01-01`; the archive verbatim; `ageParsed`
false on exactly the three unreadable rows; re-running the migration a no-op; rollback restoring
every original value and synthesising `3 years` / `adult` for a post-migration animal; a forward
re-run restoring every birth date including that animal's real one; rollback refusing once
`cleanup.sql` had run; and the settings migration applying, re-applying, rolling back and applying
again.

## Two refusals, added after a review ran the file rather than read it

An adversarial comparison against the parallel branch (below) executed both migrations over
eleven edge-case rows and found two defects here that no amount of reading had caught:

- **`"500 years"` backfilled to `1526-06-12` with `ageParsed = true`** — a typo became a birth date
  in the sixteenth century, and was not even flagged for the archive review. A digit string too
  long for an `integer` aborted with `value out of range for type integer` and no row named.
- **`intakeDate = '2024-02-31'`** satisfied the shape regex and then aborted the file on the
  `::date` cast with `date/time field value out of range` — **naming no row**, so the operator
  could not tell which animal to fix.

Both now abort before anything is written, naming the animals, with the counts compared as
`numeric` so a fourteen-digit age cannot overflow the check itself. The boundaries are pinned in
both directions: `60 years` is accepted, and a real leap day still rolls forward the way the
application rolls it.

These two cases deliberately diverge from `approximateBirthDate`, which would roll `2024-02-31`
to March 2 and compute the 1526 date without comment. Rolling an intake date is a data correction;
a migration should not make one silently.

## A third refusal, from `/code-review`, which defeated the file's headline promise

The review probed a state neither the author nor the earlier comparison had considered: a
`pets` table where **`birthDate` already holds values while `age` is still present**. The way in is
the obvious emergency fix for the read storm — `ALTER TABLE pets ADD COLUMN "birthDate" TEXT NOT
NULL DEFAULT '2024-01-01', ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true`, which
is `db push`'s own statement with the drops left off, and exactly what someone would reach for at
2am to stop the catalogue serving fixtures.

Applied to that table, this migration derived every date correctly, wrote them to the archive,
**discarded them** (the backfill is `WHERE p."birthDate" IS NULL`), dropped `age` and
`ageCategory`, and reported success — leaving every animal on the invented 2024-01-01 while the
header promised "no existing ROW ever receives it". `still_null` was 0, so nothing aborted. The
review reproduced it on pglite before reporting it.

It now refuses, naming the row count, with a `HINT` giving both ways forward: drop `age` by hand
to keep the existing dates, or null the column and re-run to derive them. The rehearsal asserts
the refusal, that `age` survives it, and that the HINT's remediation actually works — a hint that
has never been executed is a guess.

This is the second time on this branch that running the file beat reading it. The two earlier
defects came from an adversarial comparison that executed both candidate migrations; this one from
a review that did the same. No amount of re-reading the SQL produced any of the three.

## A fourth: the archive carried the date and dropped the flag

A second review round — of the fix commits, because a fix round is unreviewed code — found that
the archive recorded `derivedBirthDate` and not `birthDateIsEstimate`. So an animal created after
the conversion with a *known* birthday, which is the only reason the form's checkbox exists, was
archived with its date alone; `rollback.sql` then dropped the column, and re-applying stamped
`true` over every restored row. A known birthday silently became an estimate, while
`rollback.sql`'s own header said "Nothing is lost in either direction".

The rehearsal could not have caught it: its round-trip check asserted only that the *date*
survived. The archive now carries the flag, the backfill reads it back instead of hardcoding
`true`, and the round-trip check asserts both. **Verified by mutation** — restoring the hardcoded
`true` fails exactly that one check and nothing else, so the assertion discriminates rather than
merely passing.

Four defects on this branch, all found by executing the SQL, none by reading it. The pattern is
strong enough to be the branch's main lesson.

**Not rehearsed:** production's actual rows, and any view or constraint there referencing `age`.
Either aborts the transaction rather than damaging anything.

## A second migration for the same conversion exists, and the two compose

`origin/fix/pets-birth-date-production-migration` carries
`prisma/migrations/manual/20260922_pets_birth_date/` — note `pets_`, one letter from this folder's
`pet_` — written independently by a concurrent session on the same day. **This was not discovered
until after both were written.** Neither session checked `git branch -a` or `gh pr list` before
starting, which is the cheapest audit there is.

They are not two versions of the same file. **That one never drops anything**: its entire
treatment of the old columns is `ALTER COLUMN "age" DROP NOT NULL`, and its header says the drop
"belongs in its own file once this one has been applied". It is the expand half of an
expand/contract pair, and the contract half was never written. **This folder is that contract
half.** Verified by running this migration against a table the other had already migrated: the
guards fall through, the backfill matches no row, and it proceeds to archive and drop.

So `expand → soak → contract` is available and is safer than either alone. It costs two owner
sessions in the Neon editor rather than one. Before that can happen, one divergence has to be
settled: the other file derives dates with `make_interval`, which **clamps** a month-end or
leap-day rollover (`2026-03-31` minus one month → `2026-02-28`), where this one and the running
application both **roll forward** (`2026-03-03`). Applied in sequence as they stand, the two files
would derive different birthdays for the same animal. Its header also claims the rule accepts
Malay tokens — `thn`, `tahun` — which `approximateBirthDate` does not; its own check asserting
that is written against hand-typed constants rather than the function.

**Not merged, and the ledgers deliberately not merged either.** Two decision documents stating
different rules for one conversion is the "two copies have diverged" defect `AGENTS.md` names.
Which artifact survives is the owner's call, recorded here so it can be made on the facts.

## What was deliberately not done

- **Not applied.** The owner applies it in the Neon SQL editor, as with
  `20260917_status_enums`. `.claude/settings.json` denies agents `npx prisma migrate*` and
  `npx prisma db execute*`, and this session had no production access.
- **`getServerPetsAsync`'s missing `select` was left alone.** Narrowing it would mask this class of
  failure rather than fix it, and the fallback-trigger question is its own open entry
  (`tasks/open/pets-json-fallback-empty-means-outage.md`).
- **The archive is not dropped.** `cleanup.sql` is a separate, deliberate step for a human who has
  looked at the `ageParsed` rows.

See `tasks/decisions/2026-09-22-the-pet-form-collects-a-birthday-not-age-prose.md` for the
application half.
