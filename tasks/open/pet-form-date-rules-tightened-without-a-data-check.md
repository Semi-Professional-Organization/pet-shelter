# The birthday-after-intake rule would refuse an animal born at the shelter

**Status:** open · opened 2026-09-22 · corrected 2026-10-14 · from PS-114

`petFormSchema` refuses a pet whose `birthDate` is after its `intakeDate`
(`src/lib/validations/pet.ts`, around line 314), on the reasoning that an animal cannot have been
born after it arrived. That is true of an animal taken in from outside. It is not true of one born
*at* the shelter: a pregnant intake is ordinary shelter work, and a puppy born three weeks after its
mother arrived has a real birthday after any intake date it inherits from her.

Two things make that more than a cosmetic refusal:

- **It cannot be worked around at save time.** `updatePet` re-validates the whole pet on every
  edit, so once such a record exists the operator cannot change its description, photo or status
  without first falsifying one of the two dates.
- **The form now requires a birthday.** Since #94, `birthDate` is collected rather than derived, so
  every animal carries one — and none may post-date its intake.

No existing row is at risk from the backfill: it derives `birthDate` as intake minus age, which can
never be after intake. The exposure is new animals entered by hand, and any record edited later.

**What this entry used to say, and why it was wrong.** An earlier version also warned that
`intakeDate` had been tightened to a strict `YYYY-MM-DD` calendar check and would strand non-ISO
rows, and asked for a production count of them. That check existed only in a PR #42 commit that
was reverted before merge. `master` keeps `intakeDate` as `z.string().min(4)` on purpose — see
`tasks/decisions/2026-09-22-the-pet-form-collects-a-birthday-not-age-prose.md`, which settled it for
the same stranding reason. The entry was reopening a closed decision, and was wrong about its effect
besides: a non-ISO intake does not trip the birthday rule, it *skips* it, because the rule only
runs when `intakeDate` matches `^\d{4}-\d{2}-\d{2}$`. It also claimed every `intakeDate` literal in
the repository was clean ISO; `tests/unit/rehabilitation.test.ts` uses `"2026"`. Corrected after a
`/code-review max` caught all three.

**Settles when:** a maintainer decides what an animal born at the shelter records as its intake
date. The likely answer is its own birth date — the day it entered the shelter's care, rather than
its mother's arrival — which keeps the rule and needs only a line in the operator-facing help. The
alternative is to exempt such animals from the rule, which needs a way to mark them.
