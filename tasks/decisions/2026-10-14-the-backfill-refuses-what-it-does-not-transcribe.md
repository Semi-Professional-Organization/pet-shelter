# The birth-date backfill refuses what it does not transcribe

**Decided:** 2026-10-14 · closes `tasks/open/malay-age-units-outpace-the-backfill.md`

Since #42, `approximateBirthDate` reads more age spellings than the expand migration
(`prisma/migrations/manual/20260922_pets_birth_date/`) does. The app reads weeks in both languages
(`weeks`, `wks`, `minggu`, `mggu`), Malay years and months (`tahun`, `thn`, `bulan`, `bln`), and the
English abbreviations `mnth` and `yo`. The migration reads none of those. It refuses every one and
names the row.

**Decided: leave it that way.** The migration reads a strict subset of the app's vocabulary, and the
gap is deliberate rather than a backlog.

## Why the narrower side is the migration

The two can disagree in only two ways, and they are not equally bad:

- **The migration refuses a row the app could read.** The backfill stops, names the animal, and a
  human writes its age in a form the migration accepts, or sets the birthday directly. Nothing is
  stored. Cost: one manual correction.
- **The migration stores a row differently from the app.** A birthday is written that the
  application would never have computed, and nothing flags it — the soak window is the only check
  there is, and it relies on a human noticing.

Widening the migration to match the app converts every instance of the first into a risk of the
second, because each new spelling is a new transcription of the app's rule into SQL, rehearsed or
not. The expand session put it as *refusing more is safe, storing differently is not*, and that is
the rule this decision applies.

Weeks are the sharpest case. Before #42 the app read `3 minggu` as three **months** — a bare `m`
matching the start of the word — which would have placed that animal's birthday ten weeks early.
The owner ruled on 2026-10-14 that `minggu` is weeks. Had the migration been widened to "match the
app" before that ruling, it would have transcribed the bug.

## What keeps this honest

Prose said "the migration reads the spellings the app reads" until #42 made it false, and nothing
failed. So the relationship is now asserted, not described:
`prisma/migrations/manual/20260922_pets_birth_date_contract/rehearse.mjs`, scenario 0, imports the
**real** `approximateBirthDate` — not a copy — and runs the real expand SQL. It asserts:

- for every spelling the migration reads, plus the four rollover cases and `pet-008`, the stored
  birthday equals what the function computes. 77/77 in UTC, Asia/Kuala_Lumpur, America/New_York
  and Pacific/Honolulu, and mutation-tested;
- for each app-only spelling, the app reads it **and** the migration refuses it.

If either side changes without the other, one of those fails.

## What would reverse this

Production turning out to hold many ages in weeks or Malay, so that hand-correcting them all is
impractical. The pre-check query in the migration's header lists every row it would refuse without
changing anything, so that is measurable before the backfill runs, not after. If the count is
large, widen the migration **one unit at a time**, each added to the AGREED corpus in scenario 0
before it is added to the SQL — so the comparison exists before the transcription does.

The migration's header was corrected in the same change to state this relationship; it previously
said the migration read "the spellings the app itself reads".
