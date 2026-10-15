# The birth-date backfill refuses any age containing a non-ASCII character

**Decided:** 2026-10-15 · reverses one paragraph of
`2026-10-14-the-backfill-refuses-any-age-with-a-unit-it-does-not-read.md`, which stands otherwise

That entry refused ages containing Unicode *whitespace*, listed code point by code point, and said
"whitespace only, deliberately not every non-ASCII character". The same day's next review found
two more silent divergences the list could not see:

- **U+0085 (NEL).** Postgres `[[:space:]]` matches it and JS `\s` does not, the reverse of the
  no-break space. `1<NEL>year 6 months` was one year to the backfill and six months to the app.
- **A non-ASCII letter glued to an English unit.** `1 year` followed by an n-tilde, then
  ` 6 months`: JS `\b` ends the word at the n-tilde, Postgres `\M` does not, so the app read one
  year and the backfill six months. The old entry recorded this as a residual and called it
  Malay-only; it is not.

Each stored a different birthday from the app's with no error. A deny list of code points was
found incomplete twice in two reviews, so it is replaced rather than extended.

**Decided:** `prisma/migrations/manual/20260922_pets_birth_date/migration.sql` refuses any `age`
containing a character outside ASCII, in a stage of its own, with its own message and a
`non-ASCII age` verdict in the header's pre-check.

- **Tested as `octet_length(age) <> char_length(age)`**, which under UTF8 is true exactly when a
  non-ASCII character is present. No regex and no escape: nothing for the editor to decode (the
  trap that put a literal byte-order mark into this file's regex once), and nothing for the
  database's ctype to reinterpret.
- **The file refuses a non-UTF8 database outright**, since the test means "non-ASCII" only there.
  Neon is UTF8; this makes it checked rather than believed.
- **Placed after the fractional check.** The old entry's reason for not refusing all non-ASCII
  was that an en-dash range must still be refused *as fractional*. Ordering keeps that: a range
  is refused under the name that says what to fix, and only what survives reaches this stage.
- **Locale question closed rather than measured.** Production's `datctype` has never been read.
  On ASCII alone, `[[:space:]]`, `\M` and `lower()` behave the same under every ctype, so the
  backfill's reading no longer depends on it.

**Accepted cost:** an otherwise-plain age with an accented word in it ("2 years, très calme") is
refused and has to be retyped. One manual correction, named before anything runs.

## Verified

`prisma/migrations/manual/20260922_pets_birth_date_contract/rehearse.mjs`, scenario 0, runs the
real SQL on pglite and imports the real `approximateBirthDate`. Its reproduced J1 and J3 now
cover the no-break space, NEL and glued-letter strings (`non-ASCII age`), en-dash, spaced en-dash
and em-dash ranges (still `fractional age`), a vulgar fraction (still `unparseable age`), and a
tab (still `ok: years`, since both sides read ASCII whitespace alike). J3 matches each verdict
to the file's own message and the row id.

Mutation-tested, each run once and reverted: disabling the file's stage fails J3 with four
non-ASCII strings silently stored; removing it from the pre-check fails J1 with four reading
`ok`; giving it precedence over the fractional stage fails J3 on the two dash ranges.

**Not verified:** expand's own 92-check harness still cannot run (it needs `embedded-postgres`).
Its L3, M1, M2 and N1 fixtures were read and reasoned through: each is refused at a stage before
this one, under the same message. The M1 and N1 range shapes are reproduced in the contract
harness above, so that part is measured.

## Corrections to the 2026-10-14 entry

Its "What is verified" list miscounts: the agreeing corpus is nineteen strings in total, which
include the rollover cases, the compound and `pet-008`; and the single-unit app-only list has eight
entries, not seven, one of them a no-break-space string. Its count of 93 checks is now 82: the
eleven-string mixed loop was removed because the reproduced J1 and J3 already assert the same
refusals more strictly.
