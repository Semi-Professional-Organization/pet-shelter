# The birth-date backfill rehearsal only agrees with the app east of UTC

**Status:** open · opened 2026-10-14 · from PS-114 · reported by the session that wrote the expand
migration, recorded here because `approximateBirthDate` is the thing being compared against

`prisma/migrations/manual/20260922_pets_birth_date/rehearse.mjs` checks the backfill SQL by
comparing it against a **hand transcription** of `approximateBirthDate` from
`src/lib/domain/petAge.ts`, and that transcription uses local-time date setters rather than the
UTC ones the real function uses. Neither harness pins a timezone.

So the comparison's answer depends on the machine's offset. Reported measurement: fixture
`pet-008` derives `2026-03-01` at UTC+8 and `2026-03-04` in `America/New_York`. The shelter's
contributors are in Asia/Kuala_Lumpur, so every rehearsal taken so far has been east of UTC and
has agreed.

**What makes this worth an entry rather than a comment:** the failure is loudest for someone who
has done nothing wrong. Re-take that measurement from any negative offset — a contributor in the
Americas, a CI runner on UTC with a shifted TZ, a cloud session — and the rehearsal reports
mismatches against a migration that is actually correct. The natural reading is "the backfill is
broken", and the natural response is to change the SQL, which would then be wrong for everyone
east of UTC.

The real function has been timezone-invariant since PS-114: it parses `YYYY-MM-DD` into calendar
parts and builds dates with `Date.UTC`. The five rollover tests in `tests/unit/petAge.test.ts` pin
its behaviour from the TypeScript side and are themselves offset-independent for the same reason.
It is only the rehearsal's *copy* that reads local time — which is the same defect in miniature
that `tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`
is about: a transcription that nothing checks against its original.

**Settles when:** the rehearsal either pins a timezone explicitly (`TZ=UTC`, asserted at startup
so a mismatch fails loudly instead of silently changing the expected values) or imports
`approximateBirthDate` rather than restating it — the second is better, because it cannot drift —
and the fixture that currently differs, `pet-008`, is checked at one positive and one negative
offset.
