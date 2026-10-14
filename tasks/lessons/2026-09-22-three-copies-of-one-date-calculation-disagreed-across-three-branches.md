# Three copies of one date calculation disagreed, one per branch, all defensible alone

**Learned:** 2026-09-22

`approximateBirthDate` in `src/lib/domain/petAge.ts` turns "2 years" into a birthday. On
2026-09-22 three branches each held a version of that calculation, and no two agreed on what
happens when the day of month does not exist in the target month:

- **`feat/pet-form-birth-date`** changed the TypeScript to clamp: 31 March less a month becomes
  28 February.
- **`worktree-pet-birth-date-migration`** (PR #94) transcribes the function into SQL for the
  production backfill, and builds the subtraction as `make_date(y, m, 1) + (day - 1)`
  *deliberately*, with a header comment saying it "reproduces JavaScript's Date overflow, where
  2024-02-29 minus one year rolls FORWARD to 2023-03-01".
- **`fix/pets-birth-date-production-migration`** transcribes the same function and uses
  `make_interval`, which clamps — its comment names the divergence outright: "PostgreSQL clamps
  2026-03-31 minus one month to 2026-02-28; the app's JS rolls it forward." It even reports the
  clamped rows separately so a human can inspect them.

Every one of the three is defensible read alone. Two of them are *correct* about what the app did
at the moment they were written. The trouble is that a backfill's whole job is to produce the
value the application would have produced, so "match the app" and "be right" were the same
requirement until one branch changed the app — and then the SQL comment asserting fidelity became
false without a single line of SQL changing.

This matters beyond tidiness: the rollover shortens a year to eleven months, and
`AGE_BAND_MIN_MONTHS.young` is 12, so a leap-day yearling backfills as a puppy. Probed:
birthday 2023-03-01 against 2024-02-29 computes 11 months, `puppy_kitten`; clamped to 2023-02-28
it computes 12, `young`.

Nothing detected it. Each branch's tests passed, each PR was reviewed on its own, and CI never
compares two branches. It surfaced only because one session read the other two branches' SQL
while answering a question about something else.

**How it resolved, which is the part worth copying.** Not by the best rule winning. The expand
session, told about the divergence, changed its SQL to roll forward and then ended; two of the
three were then finalised on roll-forward, with one of them on a branch nobody was holding any
more. So the clamp — defensible, and better on its own merits — was dropped, because the cheap
move is the one that leaves a single rule in three places rather than the best rule in one.

What replaced it is the actual fix: the rollover is now **pinned by tests that are expected to
fail if someone improves it**, and the docstring names both SQL files and says why the behaviour
is not to be corrected in isolation. The four cases the expand session had rehearsed against
embedded Postgres are now the four cases the unit suite asserts, so the SQL and the TypeScript
are checked against the same numbers from two directions.

**Rule:** When a function gets reimplemented in another language — a SQL backfill, a worker in
another service, a spreadsheet a human maintains — say so in the *original's* docstring, name the
transcriptions by path, and pin the disputed cases with tests that say they are expected to fail
on an improvement. Then, before changing that function, `git log --all -S` its name and grep
sibling branches for a transcription. A comment claiming fidelity to code on a different branch
is an assertion with no test behind it, and it silently stops being true the day someone improves
the thing it copied.

**Second rule, about the fix rather than the defect:** when the copies have already diverged and
one of them is finalised or its author is gone, converge on the *status quo* rather than on the
best answer, and spend the effort on making the rule checkable instead. A correct rule in one of
three places is worth less than a mediocre rule in three of three with a test holding it there.
