# A birthday-after-intake rule could strand rows nobody has counted

**Status:** ASSERTED · opened 2026-09-22 · from PS-114

The pet form is gaining a rule that `birthDate` must not be after `intakeDate`, stated as "an
animal cannot be admitted before it is born". It is true of an animal admitted from outside. It
is not true of one born at the shelter: a pregnant intake is ordinary shelter work, and a puppy
born three weeks after its mother arrived legitimately has a birthday after the intake date it
inherits. Nothing has ever prevented such a row.

Because the admin form validates the *whole* pet on every save, a row that violates the rule
becomes uneditable. The operator changes a description and the save fails on a date field they
never touched, with no way forward that is not falsifying one of the two dates.

This gets sharper, not softer, as the birth date work lands: PR #94 makes `birthDate` required
rather than optional, so every animal must carry a birthday and none may post-date its intake.

A second, quieter version of the same question: `intakeDate` is a plain `String` in
`prisma/schema.prisma` with no constraint, so nothing in the database has ever enforced
`YYYY-MM-DD`. Any row holding a datetime or a partial date fails a strict calendar check on a
field the operator did not edit.

**Belief, not observed.** Every `intakeDate` literal in this repository is already a clean
`YYYY-MM-DD` — checked across `src/`, `prisma/` and `tests/`, zero with a time component — and
all ten fixtures in `src/data/pets.json` satisfy `birthDate <= intakeDate`. The production table
has *not* been checked, because agents here are refused production reads. Note that the backfill
migrations derive `birthDate` from `intakeDate` minus an age, which cannot produce a birthday
after intake — so the risk is concentrated in rows edited by hand afterwards, and in the
`2024-01-01` column default landing on an animal taken in before 2024.

**Settles when:** someone with production access counts the rows where `intakeDate` does not
match `^\d{4}-\d{2}-\d{2}$`, and the rows where `birthDate > intakeDate`, and either reports both
empty or the rules are relaxed to match the data. The born-at-the-shelter case needs a
maintainer's answer regardless of what the counts say — most likely "give the animal its own
intake date", which is worth writing down somewhere an operator will read.
