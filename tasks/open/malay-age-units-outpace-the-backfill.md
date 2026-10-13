# The app reads Malay ages the birth-date backfill will refuse

**Status:** open · opened 2026-10-13 · from PS-114

`approximateBirthDate` in `src/lib/domain/petAge.ts` reads Malay age units — `tahun`, `thn`,
`bulan`, `bln` — so "2 tahun" yields a birthday. The SQL that backfills `pets.birthDate` from the
old `age` prose (`prisma/migrations/manual/20260922_pets_birth_date/migration.sql`, on the
unmerged branch `fix/pets-birth-date-production-migration`) matches English units only, and needs
a hand-run `regexp_replace` pre-pass to translate the Malay ones. So the same row yields a real
birthday in the application and `'unparseable age'` in the migration.

That file anticipates the order these land in, naming it "PR #42's to move: widening
`approximateBirthDate` to read Malay, which would let this file widen with it". Nothing on the
application side recorded the other half of that handshake until now.

Two related defects in the same regex, left alone deliberately:

**`"3 minggu"` is read as three months.** `AGE_MONTHS_PATTERN` is `/(\d+)\s*(?:m|mo|month|bln|bulan)/`
and the bare `m` alternative matches the *m* of *minggu* — Malay for *weeks*. A three-week-old
litter is dated roughly ten weeks too early. The asymmetry is the tell: English "3 weeks" matches
no pattern and falls through to the intake date, while "3 minggu" produces a confidently wrong
date. The backfill anchors its units with `\M` and would refuse the row instead. Found by the
session that wrote the expand migration; not fixed here because anchoring that regex changes the
very arithmetic three implementations were deliberately aligned on, and it deserves its own
change rather than a ride-along. See
`tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`.

**An impossible intake date still yields a birthday.** `approximateBirthDate("1 year", "2026-02-30")`
returns `2025-03-02`, because V8 parses `2026-02-30` leniently to 2 March. This is *not* a
regression — probed on 2026-10-13, the pre-PS-114 `new Date(intakeDateStr)` / `isNaN` check
accepted it identically and produced the same string — but the backfill aborts on such a row
(`'bad intakeDate'`), so it is a third place the two do not agree.

**Settles when:** the migration's unit vocabulary and the function's are the same set, in whatever
order they land, and a weeks unit either exists in both or is refused by both. Closing this needs
whoever lands the backfill and whoever touches the regex to move together; a fix on one side alone
re-opens it.
