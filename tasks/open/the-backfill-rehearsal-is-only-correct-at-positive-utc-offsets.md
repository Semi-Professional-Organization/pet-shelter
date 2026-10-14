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

## Landing PR #42 does not close this, and makes the copy drift twice

PR #42 makes the real `approximateBirthDate` timezone-invariant — it parses `YYYY-MM-DD` into
calendar parts and builds dates with `Date.UTC`, where `master` at `6d32df9` still uses
`d.setFullYear(...)` / `d.setMonth(...)` at lines 161 and 169. All four rollover values the
rehearsal pins are preserved by that change, forward roll included, and the five tests in
`tests/unit/petAge.test.ts` pin them from the TypeScript side.

It is tempting to conclude the timezone problem is therefore solved. It is not, because the
rehearsal does not call the function — `appRule` in `rehearse.mjs` (around line 663) is a
hand-written copy, as its own comment says: "a transcription … a copy, and therefore capable of
drifting from it." After #42 that copy differs from the original in **two** ways:

1. **Offset.** The copy still uses `setFullYear`/`setMonth`, so it is still offset-dependent while
   the real function no longer is. Before #42 both read local time and agreed with each other; now
   they do not, so the gap this entry describes gets wider rather than closing.
2. **Vocabulary.** The copy matches `/(\d+)\s*y/` and `/(\d+)\s*m/` — the old unanchored patterns.
   The real function now reads weeks in both languages and refuses `minggu` as a month. So
   `3 minggu` is three months to the copy and three weeks to the function.

**And the guard that exists to catch exactly this cannot see it.** O1 pins `appRule` against
`src/data/pets.json`, whose `birthDate` values came from the real function — but all ten fixture
ages are plain English years and months (`"2 years"`, `"4 months"`, …) and **none** is a weeks or
Malay shape. So O1 passes while the transcription has silently diverged, and O2 then passes "for
the wrong reason" in precisely the way O1's comment warns about.

This is the same defect in miniature that
`tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`
is about — a transcription nothing checks against its original — except here the check exists and
is aimed at a fixture set too narrow to exercise it.

**Settles when:** `rehearse.mjs` imports `approximateBirthDate` instead of restating it. That is
now the only option that actually works: pinning `TZ=UTC` would fix the offset half and leave the
vocabulary half, since a copy with the old patterns disagrees with the function at any timezone.
Importing closes both at once and cannot drift again.

If importing is genuinely impractical — the harness runs standalone against embedded Postgres and
may not want a TypeScript import — then the fallback needs *both* halves: pin `TZ=UTC` with a
startup assertion so a mismatch fails loudly, **and** add a weeks row and a Malay row to whatever
fixture set O1 checks against, so the transcription guard can see a vocabulary drift at all. Check
`pet-008` at one positive and one negative offset either way.
