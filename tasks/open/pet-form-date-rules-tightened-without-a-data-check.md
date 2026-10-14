# The birthday-after-intake rule refuses an animal born at the shelter

**Status:** open · opened 2026-09-22 · rewritten 2026-10-14 · from PS-114

`petFormSchema` refuses a pet whose `birthDate` is after its `intakeDate`
(`src/lib/validations/pet.ts`, around line 314), on the reasoning that an animal cannot have been
born after it arrived. That holds for an animal taken in from outside. It does not hold for one
born *at* the shelter: a pregnant intake is ordinary shelter work, and a puppy born three weeks
after its mother arrived has a real birthday after any intake date it inherits from her.

**The failure is at creation.** `createPet` runs the same schema, so the operator cannot enter that
puppy at all with its true birthday and its mother's intake date. Since #94 the form *requires* a
birthday, so there is no way round it but to falsify one of the two dates. Note what does *not*
fail: `updatePetStatus` builds `{ ...existing, status }` and writes it without going through
`petFormSchema`, so changing an existing animal's status is unaffected.

**A record could also arrive already violating the rule,** and then every full edit of it would
fail on a field the operator never touched, because `updatePet` re-validates the whole pet. The
backfill cannot produce a birthday *after intake* — it derives `birthDate` as intake minus age —
but it can produce one the sixty-year rule rejects: it accepts ages up to and including sixty years
(`migration.sql` around line 456) measured from *intake*, while the form measures sixty years back
from *today*. A recorded age of 60 with a 2025 intake backfills to 1965, which the form then refuses
as more than sixty years ago. No shelter animal is that old, so in practice it is a typo the
backfill does not catch — but it is a source. The column is another. `prisma/schema.prisma` declares
`birthDate String @default("2024-01-01")`, and the expand migration adds the column with the same
default. So any writer that omits `birthDate` stores 1 January 2024 — a raw SQL insert, an import
script, a one-off fix run in the Neon console. If that row's `intakeDate` is before 2024, its
birthday is after its intake and it is stranded. Whether the deployed application itself can omit
the field has not been checked: `master`'s schema has declared `birthDate` since 2026-08-28, so a
client built from it knows the column, but which build production is running was not verified.

## Correction

This entry was first filed as `pet-form-date-rules-tightened-without-a-data-check.md` and warned
that `intakeDate` had been tightened to a strict `YYYY-MM-DD` calendar check that would strand
non-ISO rows. That check existed only in a PR #42 commit that was reverted before merge; `master`
keeps `intakeDate` as `z.string().min(4)` on purpose, as settled in
`tasks/decisions/2026-09-22-the-pet-form-collects-a-birthday-not-age-prose.md`. It was wrong about
the effect besides — a non-ISO intake does not trip the birthday rule, it *skips* it, because the
rule only runs when `intakeDate` matches `^\d{4}-\d{2}-\d{2}$`. It also claimed every `intakeDate`
literal in the repository was clean ISO; `tests/unit/rehabilitation.test.ts` uses `"2026"`.

A first rewrite on 2026-10-14 then overcorrected: it said the operator could not change a stranded
record's *status* (they can — see above) and that no existing row was at risk (the column default
can produce one). Both found by a second review and fixed here.

The filename is kept even though it now describes the withdrawn claim. The public issue's *title*
comes from this file's first heading, not its name (`parseEntry` in `scripts/ledger-issues.mjs`),
so the new heading retitles the existing issue in place. Renaming the file would instead close
that issue — which reads publicly as "settled" — and open a fresh one with none of its history. It
was briefly renamed on the mistaken belief that the name was the title.

**Settles when:** a maintainer decides what an animal born at the shelter records as its intake
date — most likely its own birth date, the day it entered the shelter's care, which keeps the rule
and needs only a line of operator help — and someone with production access confirms no stored row
is already stranded.

**Run it after the expand migration, not before.** Production's `pets` table has no `birthDate`
column until `20260922_pets_birth_date` is applied, so before then this fails with `42703 column
"birthDate" does not exist`.

A row is stranded by *any* of the four rules the form applies to `birthDate` on every full save, not
only the one this entry is about — so the check covers all four:

    SELECT id, "birthDate", "intakeDate" FROM pets
     WHERE "birthDate" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR ("intakeDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "birthDate" > "intakeDate")
        OR "birthDate" > to_char((now() AT TIME ZONE 'UTC') + interval '1 day', 'YYYY-MM-DD')
        OR "birthDate" < to_char((now() AT TIME ZONE 'UTC') - interval '21915 days', 'YYYY-MM-DD');

The four lines are, in order, the form's ISO-date shape, birthday-after-intake, the future bound and
the sixty-year bound (`src/lib/validations/pet.ts`, around lines 230, 314, 338 and 354). The two
bounds copy the form's arithmetic exactly: both work on today's date *in UTC*, and sixty years is
`60 × 365.25 = 21,915` days, not sixty calendar years. Converting `now()` to UTC before adding the
interval matters — on a zoned timestamp a day can be 23 or 25 hours, and the session's own time zone
would decide which date counts as today. That catches a `2024-01-01` default on an animal taken in
before 2024, a birthday corrected by hand after its intake, a sixty-year-old age the backfill let
through, and a malformed value typed into the console. **One gap:** the shape test
cannot see an impossible day such as `2024-02-30`, which `isoDateSchema` rejects but this regex
admits; checking that needs a cast, run row by row so one bad value does not abort the query.
