# The birth-date backfill refuses any age containing a non-ASCII character, first

**Decided:** 2026-10-15 · reverses one paragraph of
`2026-10-14-the-backfill-refuses-any-age-with-a-unit-it-does-not-read.md`, which stands otherwise

That entry refused ages containing Unicode *whitespace*, listed code point by code point, and said
"whitespace only, deliberately not every non-ASCII character". The next review found two more
silent divergences the list could not see. Measured on pglite (UTF8, ctype C.UTF-8), intake
2026-06-12, matching the file's own unit patterns against the real `approximateBirthDate`:

| age | app | Postgres patterns |
|---|---|---|
| `1<NBSP>year 6 months` | one year (`2025-06-12`) | sees only the months |
| `1<U+0085>year 6 months` | six months (`2025-12-12`) | sees the year first |
| `1 year` + n-tilde + ` 6 months` | one year (`2025-06-12`) | sees only the months |

The second runs in the *opposite* direction from the first: JS `\s` does not match U+0085, and
Postgres `[[:space:]]` does under that ctype. The third is a word-boundary disagreement, not
whitespace at all; the 2026-10-14 entry listed it as a Malay-only residual, and it is not. A deny
list found incomplete twice in two reviews is replaced, not extended.

**Decided:** `prisma/migrations/manual/20260922_pets_birth_date/migration.sql` refuses any `age`
containing a character outside ASCII, **as its first refusal**, with its own message and a
`non-ASCII age` verdict that the header's pre-check also tests first.

- **Tested as `octet_length(age) <> char_length(age)`**, which under UTF8 is true exactly when a
  non-ASCII character is present. It uses no regex and no escape, so no editor can decode it and
  no ctype can reinterpret it.
- **First, not after the fractional check.** A first version of this change, reviewed the same
  day, placed the stage after the unit and fractional checks so an en-dash range would keep the
  "fractional" message. That left every earlier regex reading non-ASCII text. A no-break-space age
  was then named "cannot be derived" or "fractional" depending on the ctype, and some invisible
  separators were told to "pick one whole number". Placed first, every regex stage reads ASCII
  only, where `[[:space:]]`, `\M` and `lower()` agree under any ctype. **Production's ctype has
  never been measured, and this makes that unnecessary rather than measured.** The cost is that
  dash ranges and vulgar fractions are now named as non-ASCII, so that message says to retype as
  one whole number and unit.
- **A non-UTF8 database is refused** where the backfill runs, since the byte test means
  "non-ASCII" only under UTF8. The pre-check reports `database not UTF8` on every row in that
  case. Neon is UTF8. The guard sits inside the backfill branch, so a database that only needs
  the NOT NULL relax still gets it.

**Accepted cost:** an otherwise-plain age with an accented word in it ("2 years, très calme") is
refused and has to be retyped. That is one manual correction, named before anything runs.

## Verified

- **Contract harness** (`20260922_pets_birth_date_contract/rehearse.mjs`, scenario 0, pglite,
  real SQL, real `approximateBirthDate`):
  - The app's half of the three divergences above is asserted by exact date.
  - The reproduced J1 and J3 run ten non-ASCII strings: no-break space, NEL, n-tilde, narrow
    no-break space, en-dash and em-dash ranges, and a vulgar fraction. All read `non-ASCII age`
    and are refused under that message, naming the row.
  - A non-ASCII age with a bad intake date also reads `non-ASCII age`.
  - A tab still reads `ok: years`.
- **Expand's own harness**: its M1, N1, L3 and M2 expectations were updated for the new stage, and
  its J1 and J3 gained a non-ASCII and an app-only fixture, with J3 now checking the file's
  message for each verdict, not just "it failed". **Run in full, 92/92**, with `embedded-postgres`
  installed into the worktree's own `node_modules`. That also retires the 2026-10-14 entry's
  "expand's own harness was not re-run". Its O1 and O2 still compare against the hand copy
  `appRule`; that is the open timezone entry, unchanged here.
- **Mutation-tested** for the final placement: disabling the file's stage fails J3, with the
  non-ASCII strings accepted silently; dropping the pre-check's verdict fails J1, with them read
  as `ok`.

## Corrections to the 2026-10-14 entry

Its "What is verified" list miscounts. The agreeing corpus is nineteen strings in total, and those
include the rollover cases, the compound and `pet-008`. The single-unit app-only list has eight
entries, not seven, one of them a no-break-space string. Its count of 93 checks is out of date:
the eleven-string mixed loop was removed because the reproduced J1 and J3 assert the same refusals
more strictly. The script prints the current count.
