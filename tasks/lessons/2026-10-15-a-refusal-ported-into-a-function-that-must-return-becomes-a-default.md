# A refusal ported into a function that must return a value becomes a default, not a refusal

**Learned:** 2026-10-15

The pet birth-date backfill refuses a fractional or ranged age (`0,5 tahun`, `3-4 years`): the
migration aborts and stores nothing. "Refuse it in the app too, as the backfill does" sounded like
parity, and was implemented. But `approximateBirthDate` has to return a date, so its "refusal" was
the existing fall-through, the intake date, which displays as a newborn. `3-4 years` went from
"four years", which was nearly right, to "newborn", which was badly wrong. The check also refused
ordinary ages after a list (`Born 2022, 3 yrs`), and it missed word ranges entirely. A corpus diff
passed, because the corpus was built from the shapes the fix was meant to catch. Review caught it;
the change was withdrawn
(`tasks/decisions/2026-10-15-the-app-does-not-refuse-a-fractional-age-it-cannot-show-as-unknown.md`).

Then it happened twice more on the same branch, after this lesson was drafted. A sixty-year
ceiling copied from the same backfill turned `61 years` from a senior into a newborn. Its
replacement, an overflow guard, sent `15000000 weeks` to the intake date too. Each took another
review round to see. The fix that held clamps to the limit of the existing behaviour (the
earliest representable date) instead of introducing a default.

**Rule:** before copying "refuse" from one layer to another, write down what refusing *does* in
the target, meaning the value a caller actually receives. If that value is a default that looks
like real data, the change is not a refusal: compare that default against the current wrong
answer, case by case, and include near-misses that are not the target shape (lists, word ranges)
in the corpus. Related: `2026-09-03-a-fallback-that-fabricates-data-is-a-defect-not-resilience.md`.
