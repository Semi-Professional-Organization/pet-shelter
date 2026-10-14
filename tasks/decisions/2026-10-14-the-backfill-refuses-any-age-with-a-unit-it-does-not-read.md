# The birth-date backfill refuses any age containing a unit it does not read

**Decided:** 2026-10-14 · closes `tasks/open/malay-age-units-outpace-the-backfill.md`

Since #42, `approximateBirthDate` reads more age spellings than the expand migration
(`prisma/migrations/manual/20260922_pets_birth_date/`): weeks in both languages (`weeks`, `wks`,
`minggu`, `mggu`), Malay years and months (`tahun`, `thn`, `bulan`, `bln`), and `mnth`, `yo`.

**Decided:** the migration does not transcribe any of them. **Any `age` containing one, anywhere in
the string, is refused** and named — including a string that also contains an English unit the
migration does read. **So is any `age` containing Unicode whitespace** (a no-break space and its
relatives), for the reason below. Refused in full: `tahun`, `thn`, `bulan`, `bln`, `minggu`,
`mggu`, `week(s)`, `wk(s)`, `mnth(s)`, and `yo` — including the run-together `5yo` — wherever they
appear.

## Why "anywhere", and how that was found

A first version of this decision, written earlier the same day, said the migration "stores exactly
what the app computes, or refuses". It never reached master: a review disproved it in one probe.
`1 tahun 6 months` was **not** refused. The app tries years first, reads `tahun`, and stops at one
year; the migration skipped `tahun`, found `6 months` further along, and stored six months. Three
of five mixed strings measured that way, silently.

Then a second review, after the fix, found the same divergence through **whitespace**.
`1<NBSP>year 6 months` — the no-break space being what pasting from Word or a web page produces —
is one year to the app, because JS `\s` matches U+00A0, and was six months to the migration,
because Postgres `[[:space:]]` does not under UTF8: the year was invisible to it and the month was
not. So the refusal also covers any Unicode whitespace. **Whitespace only, deliberately not every
non-ASCII character**: the migration's own M1 check asserts an en-dash or em-dash range is refused
*with "fractional" in the message*, and a broader clause would intercept it first under a different
one. The exact bytes of every non-ASCII fixture in that harness were read before choosing.

So refusing only strings whose *sole* unit is unread was not enough. The migration's unit
classification now returns NULL — the existing "cannot be derived" refusal — for any age matching
an app-only unit, before it looks for an English one. The header's pre-check query carries the same
clause, so it names those rows `unparseable age` before anything runs.

## Why refuse rather than transcribe

Two ways the two sides can disagree, not equally bad:

- **The migration refuses a row the app could read.** It stops, names the animal, and a human
  rewrites the age or sets the birthday. Cost: one manual correction.
- **The migration stores a row differently from the app.** A birthday is written that the app would
  never compute, and nothing flags it.

Transcribing a unit means a second copy of the app's rule for it in SQL, and every copy is a place
to drift — #42 drifted the existing copy twice in one change. Refusing keeps the migration to one
rule it can be checked against.

**Accepted cost:** `3 minggu 2 months` and `2 years 3 weeks` used to agree by luck (both sides read
the English unit) and are now refused. Distinguishing agree-by-luck from agree-by-rule would need
the app's unit precedence copied into SQL — the thing being avoided. The migration header gives a
normalisation `UPDATE` that rewrites Malay years and months into English, after which both sides
agree.

## What is verified, and what is not

`prisma/migrations/manual/20260922_pets_birth_date_contract/rehearse.mjs`, scenario 0, imports the
**real** function and runs the **real** SQL on pglite. 93/93:

- nineteen English spellings, the four rollover cases, a compound and `pets.json` `pet-008`: the
  stored birthday equals the function's output;
- seven single-unit app-only strings: the app reads each to its exact expected date, and the
  migration refuses each with its refusal message naming the row;
- eleven mixed strings, including `2 tahun 3 years`, `5 yo and 3 years` and three no-break-space
  cases: refused, named;
- expand's own J1 and J3, reproduced — same pre-check extraction, same eight fixtures, plus the new
  cases: the pre-check's verdict is right for all twenty-one, and matches what the file does, with
  each refusing verdict matched to the file's own message for it and the row id, not "any error".

**Mutation-tested, twice:** removing the clause from the pre-check while leaving it in the file
fails J1, naming each mixed fixture as `ok: months`; removing the whitespace clause from the file
fails four checks — two no-break-space strings silently stored, one refused under the wrong reason,
and J3 flagging the pre-check and file disagreeing.

The migration's regex is written with ASCII `\uXXXX` escapes, verified by reading the file's bytes:
the editor used to write it decoded the escapes into literal characters on the first attempt,
including a byte-order mark inside the regex. The file now contains no non-ASCII byte at all.

The only executable change to the migration is three lines; everything else in that diff is
comment, checked by filtering the diff.

**Not verified, and why:**

- **This is a claim about a corpus, not a proof about every string.** An earlier version of this
  bullet said an English divergence "would need two rules disagreeing on English, which no
  measurement has shown". The no-break space was exactly that, measured the same day. Two residuals
  are known and not closed:
  - **A non-ASCII letter glued to a unit**, e.g. `tahun` followed by `ñ`. JS `\b` treats `ñ` as a
    boundary; Postgres `\M` treats it as part of the word. Unrealistic as age prose, and closing it
    needs a separate refusal stage after the fractional check. Recorded as a `ceiling:` in the SQL.
  - **Compact compounds such as `2y3m`.** Today the app and the migration *both* read the trailing
    unit, three months — they agree by accident. A fix to the app alone, making it read the larger
    unit, would open a new silent divergence. Any change to how the app reads compact forms must
    land together with the SQL. The session on #42 holds that follow-up and has been told so.
- **Expand's own 92-check harness was not re-run.** It needs `embedded-postgres`, not installed into
  a `node_modules` other worktrees share. The checks this change touches are J1 and J3, reproduced
  above; L1 and O3 assert single-unit app-only strings are refused naming the row, which they still
  are, through the same path with the same message.
- **The comparison is not in CI.** It is a manual `npx tsx` script, so a future change to
  `approximateBirthDate` does not run it on its own.

## What would reverse this

Production holding many ages in Malay, weeks or mixed spellings. The pre-check counts them before
anything runs. If the count is large, widen the migration **one unit at a time**, each added to
scenario 0's corpus before it is added to the SQL, so the comparison exists before the
transcription does — and run the normalisation `UPDATE` first, since it removes the Malay cases
without any transcription at all.
