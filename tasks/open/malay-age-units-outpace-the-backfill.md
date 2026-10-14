# The app reads ages the birth-date backfill deliberately refuses

**Status:** open · opened 2026-10-13 · narrowed 2026-10-14, the `minggu` defect in it is fixed

`approximateBirthDate` in `src/lib/domain/petAge.ts` and the SQL that backfills `pets.birthDate`
from the old `age` prose (`prisma/migrations/manual/20260922_pets_birth_date/migration.sql`, on
master since #94) agree on the arithmetic and **not** on the vocabulary.

The SQL reads English years and months only. The app also reads Malay — `tahun`, `thn`, `bulan`,
`bln`, `minggu`, `mggu` — and weeks in either language. So "2 tahun" or "3 minggu" yields a
birthday in the application and is refused and named by the migration.

**This fails closed, which is why it is a note and not an alarm.** A row the migration cannot
parse stops the backfill and gets reported, rather than being stored with a date different from
the one the app would compute. Nothing already on master becomes incorrect. What *is* now stale is
the migration's own header, which says it recognises units "only in the spellings the app itself
reads" — true when written, wider on the app side since 2026-10-14. The invariant that header
claims is symmetry; the real relationship is containment, and in the safe direction.

One genuine divergence inside the English set: the app reads `3 mnth` and the migration does not.
That is deliberate. The app has always read it via the bare `m`, and dropping it to match the
migration would trade a refused row for a silent fall-through to the intake date.

## What was fixed, and the trap in fixing it

`"3 minggu"` — Malay for three weeks — used to read as three **months**, dating a litter about
ten weeks early, for exactly the operators the Malay vocabulary was added to serve. The cause was
that `AGE_MONTHS_PATTERN`'s bare `m` alternative was unanchored and matched the *m* of *minggu*.

The obvious repair is a word boundary after each unit. **Measured, that alone is a worse bug:**
`\b` after a bare `m` or `y` rejects any abbreviation that continues with letters, so `2 mth`,
`2 mths`, `3 mnth` and `5 yo` all stop parsing and fall silently through to the intake date — four
collateral changes, every one of them plausible shelter shorthand. A sixteen-shape sample made the
anchor look surgical; it took a wider one to show it was not.

The boundary is only safe alongside an explicit list of the abbreviations it would otherwise
reject, which is the shape the backfill SQL had already used (`mth | mths | mo | mos | m`, each
anchored) and which this function now matches. Three patterns, tried years → months → weeks so the
largest unit still wins: `1 bulan 2 minggu` reads the month, as `1 year 6 months` reads the year.

Diffed old against new across 29 inputs: **5 changed, all of them weeks shapes**
(`3 minggu`, `2 mggu`, `3 weeks`, `3 wks`, `3 wk`). Every year and month form is byte-identical,
including the four the anchor alone would have broken. That table is the artifact and is pinned as
tests in `tests/unit/petAge.test.ts`.

**Settles when:** the migration's unit vocabulary either widens to match the app's — weeks and
Malay, with the same abbreviations — or its header is corrected to say that the app's vocabulary
is deliberately wider and the extra units are refused rather than transcribed. Either closes this;
the second is a docs commit and is probably the right one, because refusing a weeks row is better
than a migration inventing a date from a unit nobody rehearsed.
