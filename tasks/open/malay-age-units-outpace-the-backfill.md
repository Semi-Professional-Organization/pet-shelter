# The app reads Malay ages the birth-date backfill will refuse

**Status:** open · opened 2026-10-13 · from PS-114

`approximateBirthDate` in `src/lib/domain/petAge.ts` reads Malay age units — `tahun`, `thn`,
`bulan`, `bln` — so "2 tahun" yields a birthday. The SQL that backfills `pets.birthDate` from the
old `age` prose (`prisma/migrations/manual/20260922_pets_birth_date/migration.sql`, on master
since #94) matches English units only, and needs a hand-run `regexp_replace` pre-pass to
translate the Malay ones. So the same row yields a real birthday in the application and
`'unparseable age'` in the migration.

**This is now live rather than prospective.** Both halves of the conversion are on master and
awaiting an owner apply; the vocabulary gap is no longer a sequencing question between two open
branches but a gap between shipped code and a migration someone is about to run.

That file anticipates the order these land in, naming it "PR #42's to move: widening
`approximateBirthDate` to read Malay, which would let this file widen with it". Nothing on the
application side recorded the other half of that handshake until now.

Two related defects in the same regex, left alone deliberately:

**What accepting Malay changed, measured.** Nine shapes compared, old patterns against new: English is
untouched, and four Malay shapes now derive where they previously fell through to the intake date —
`2 tahun`, `3 thn`, `4 bulan`, `6 bln`. The divergence from the migration runs in the safe direction,
because the SQL *refuses* Malay rows and names them rather than storing something different, so it
fails closed. But it makes the defect below more likely to be met, not less: before, a Malay age fell
through to intake, which is wrong but conservative; now one specific Malay word yields a confidently
wrong date, to an operator who has just been given every reason to expect Malay to work.

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

**Anchoring alone is not the fix — measured, 2026-10-14.** The obvious repair is to require a word
boundary after the unit and order the long alternatives first:
`/(\d+)\s*(?:months?|mos?|bulan|bln|m)\b/`. That does fix `3 minggu` and `2 mggu`, and leaves all
four Malay units and every English form in a sixteen-shape sample identical. It then fails on a
wider sample: **`2 mth`, `2 mths`, `3 mnth` and `5 yo` all stop parsing** and fall through to the
intake date, because `\b` after a bare `m` or `y` rejects any abbreviation that continues with
letters. Six collateral changes in sixteen inputs. Shelter shorthand plausibly includes all four, so
this would trade one wrong date for four silent fall-throughs.

What that implies for whoever closes this: the repair is a curated token list — explicit plurals and
abbreviations, plus a real weeks branch (`minggu`, `mgg`, `week`) that either derives correctly or is
refused deliberately — not a one-character anchor. Build it against a table of inputs and diff old
against new across all of them before believing it; a narrow sample made the anchor look surgical
when it is not.

**Settles when:** the migration's unit vocabulary and the function's are the same set, in whatever
order they land, and a weeks unit either exists in both or is refused by both. Closing this needs
whoever lands the backfill and whoever touches the regex to move together; a fix on one side alone
re-opens it.
