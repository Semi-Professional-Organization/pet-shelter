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
backfill cannot produce one — it derives `birthDate` as intake minus age, which is never after
intake — but the column can. `prisma/schema.prisma` declares
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
can produce one). Both found by a second review and fixed here. The file was renamed because its
old name described the withdrawn claim, and that name is the public issue's title.

**Settles when:** a maintainer decides what an animal born at the shelter records as its intake
date — most likely its own birth date, the day it entered the shelter's care, which keeps the rule
and needs only a line of operator help — and someone confirms no production row carries the
`2024-01-01` default with an intake before 2024, which is a count only an owner can run.
