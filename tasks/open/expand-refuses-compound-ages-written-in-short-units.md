# The expand migration refuses compound ages written in short units, and blames a decimal

**Status:** open · opened 2026-10-14 · found by `/code-review max`, not fixed on that branch

`prisma/migrations/manual/20260922_pets_birth_date/migration.sql` guards against fractional and
ranged ages — "1.5 years", "1,5 tahun", "3-4 years" — which it will not round. The guard is:

    lower(coalesce(p."age", ''))
      ~ '[0-9][^0-9]{1,5}[0-9]+[[:space:]]*(years|year|yrs|yr|y|months|month|mths|mth|mos|mo|m)\M'

`[^0-9]{1,5}` is any run of one to five non-digits, which a **unit word plus spaces also
satisfies**. Measured against the same alternation and `\M` anchor:

| `age` | verdict | correct? |
|---|---|---|
| `2 yrs 6 mos` | REFUSED as fractional | no — ordinary compound age |
| `1 yr 6 mo` | REFUSED as fractional | no |
| `2 y 6 m` | REFUSED as fractional | no |
| `1 year 6 months` | `ok: 1 years` | yes |
| `3 years 2 months` | `ok: 3 years` | yes |
| `1.5 years` | REFUSED as fractional | yes |

The only thing separating the first three from the next two is whether the unit word fits inside
the five-character window — and the short spellings the file itself accepts (`yr`, `yrs`, `mo`,
`mos`, `y`, `m`) are exactly what makes it fit. The header states the compound shape is meant to be
read, not refused: "Years are tried first, so '1 year 6 months' backfills as 1 year".

**Consequence.** One such row aborts the whole migration with

    pets rows whose "age" is fractional, which this file will not round: ...
    Rewrite each in whole units -- "18 months" for "1.5 years"

so the operator is told to fix a decimal that is not there, and the live catalogue keeps serving
`src/data/pets.json` until someone works out that the advice is wrong. The header's own pre-check
query carries the same regex, so a pre-flight read reports the same wrong verdict.

## Why it was not fixed on the branch that found it

It fails **closed** — nothing is written, nothing is lost, and the transaction aborts — so it
blocks the fix rather than corrupting anything. Fixing it means editing the regex in both the guard
and the header's pre-check query, in a file whose own 92-check harness needs
`npm i --no-save embedded-postgres` to run. Changing a refusal rule without being able to re-run the
harness that covers it is how a safe failure becomes an unsafe one.

The likely shape of the fix is to stop treating "any non-digits" as a fraction separator and name
the punctuation instead — `[0-9][[:space:]]*[.,/–—-][[:space:]]*[0-9]+` — which still catches
`1.5 years`, `1,5 tahun`, `3-4 years` and the en/em-dash variants while leaving `2 yrs 6 mos`
alone. Unverified against that harness.

## Settles when

The guard accepts compound ages in short units and still refuses genuine fractions and ranges, with
the twelve-shape corpus in that file's `rehearse.mjs` extended to cover `2 yrs 6 mos`, `1 yr 6 mo`
and `2 y 6 m` — and the header's pre-check query updated to match, since it is what the owner reads
before applying.
