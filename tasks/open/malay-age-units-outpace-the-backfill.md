# The app reads ages the birth-date backfill deliberately refuses

**Status:** open · opened 2026-10-13 · narrowed 2026-10-14, the `minggu` defect in it is fixed ·
**re-opened 2026-10-14: the backfill stores some rows differently from the app, silently**

## Read this before applying the expand migration

**A mixed-language age is stored differently by the backfill than the app computes, and nothing
refuses it.** Measured with the real expand SQL on pglite against the real `approximateBirthDate`,
intake 2026-06-12:

| `age` | app | backfill | |
|---|---|---|---|
| `1 tahun 6 months` | 2025-06-12 | 2025-12-12 | **stored differently** |
| `2 tahun, approx 6 mos` | 2024-06-12 | 2025-12-12 | **stored differently** |
| `1 tahun (18 months)` | 2025-06-12 | 2024-12-12 | **stored differently** |
| `3 minggu 2 months` | 2026-04-12 | 2026-04-12 | agree |
| `2 thn 1 year` | 2024-06-12 | refused | safe |

The app tries years first and now reads `tahun` as a year, so it stops at "1 year". The backfill
does not read Malay, skips `tahun`, finds the English `6 months` further along, and stores that. No
error, no NOTICE, no row named.

**#42 introduced this.** Before it, the app's years pattern was `/(\d+)\s*y/`, which finds no `y`
after a number in `1 tahun 6 months`, so the app fell through to months and agreed with the SQL.
Teaching the app `tahun` without teaching the backfill to *refuse any string containing it* opened
the gap. #42 was verified against English spellings and rollover values before it merged; mixed
strings were not in the sample. Found by `/code-review` on the PR that was about to declare this
entry settled — that PR's decision said "for any string this file does not read, it stops and asks
rather than storing something different", and this table is the counter-example.

**Why it matters, proportionately.** Neither value is right — `1 tahun 6 months` is eighteen
months — and both are flagged `birthDateIsEstimate = true`. So the harm is an estimate built from
the wrong half of an awkward string, not a fabricated date. But it is the one failure the
expand/contract design exists to prevent: the backfill's stated invariant is that it stores exactly
what the app would compute, or refuses. It is doing neither.

**The pre-flight, before the owner applies expand.** This finds every row that could be affected,
and if it returns nothing, the divergence cannot occur on this database:

    SELECT "id", "name", "age" FROM pets
     WHERE lower("age") ~ '[0-9]+[[:space:]]*(tahun|thn|bulan|bln|minggu|mggu|weeks?|wks?|mnths?|yo)([^a-z]|$)'
       AND lower("age") ~ '[0-9]+[[:space:]]*(years?|yrs?|y|months?|mths?|mo|mos|m)([^a-z]|$)';

Any row it returns: rewrite its `age` in one language before applying, or read its derived birthday
by hand in the soak window.

Tested on pglite against thirteen strings before being published here: it returns all three rows
in the table above that are stored differently; it also returns `3 minggu 2 months` and
`2 thn 1 year`, which are harmless (one agrees, one is refused) — conservative is the right failure
for a pre-flight; and it returns none of `2 years`, `4 months`, `1 year 6 months`, `2 mths`,
`6 mos`, nor the single-language `2 tahun`, `3 mnth`, `5 yo`, which the backfill already refuses.

**The fix**, not made yet: the expand SQL should refuse any string that contains an app-only unit
anywhere, not only when that unit is the one it would have matched — the same alternation as the
pre-flight above, added to its refusal set. It was not made on the branch that found this because
that file is queued for production and its own 92-check harness needs `embedded-postgres`, which
was not installed. Its J1 check also asserts that the header's pre-check query names every row the
file refuses, so a new refusal has to land in both places at once, and that consistency cannot be
verified without running it.

---

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
