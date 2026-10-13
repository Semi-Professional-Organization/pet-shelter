# A regex that finds a number beside a unit does not find the number

**Learned:** 2026-09-22

The birth-date backfill reads a prose age with `([0-9]+)[[:space:]]*(?:y|yr|year|thn|tahun)`, which
reads as "the number of years". It is not. It is "the leftmost digit run that happens to be
followed by a unit token", and for `"1.5 years"` that run is **5**. The animal gets a birthday five
years before intake instead of eighteen months — a three-and-a-half-year error, in a one-shot
production backfill, from prose an intake volunteer plausibly types.

`"2.5 months"` gives 5. `"1,5 tahun"` gives 5. `"1 1/2 years"` gives 2. Master's own
`approximateBirthDate` (`/(\d+)\s*y/`) does the same thing, which is how it survived a reading:
the SQL agreed with the app, and agreeing with the app was the bar being checked.

Nothing downstream could catch it. The plausibility bound (over 60 years) passes — 5 is a fine
number of years. The month-end clamping notice does not fire. The header's pre-check reported
`ok: years`. And the follow-up migration is scheduled to drop the `age` column, taking the only
evidence with it. It was found by `/code-review`, which ran the regex on inputs the rehearsal's
fixtures did not contain: every fixture was `"N years"` or `"N months"`, because those are the
shapes the repo's own seed data uses.

The fix is a refusal, not a rounding: `[0-9][.,/][0-9]` anywhere in the age aborts the file naming
the row. Rounding `"1.5 years"` up or down is a claim about an animal nobody in the repo has met.

**Rule:** when a pattern extracts a quantity by proximity to a unit, write down what it does on the
inputs the unit *invites* — decimals, fractions, ranges, two quantities in one string — before
trusting it on a value you cannot re-derive later. Fixtures drawn from existing data test the
shapes that already exist, which is exactly the set that never contained the bug; a parser's test
cases have to come from the grammar people actually type, not from the rows already stored. And
where the extracted value is written once and the source is then deleted, prefer refusing an input
you did not design for over guessing at it.
