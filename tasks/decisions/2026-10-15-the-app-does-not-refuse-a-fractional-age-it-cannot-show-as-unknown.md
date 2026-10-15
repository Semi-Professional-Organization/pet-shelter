# The app does not refuse a fractional age while it has no way to show "unknown"

**Decided:** 2026-10-15

`approximateBirthDate` reads the digits beside a unit, so a decimal, fraction or range comes out as
the wrong whole number: `0,5 tahun` (a six-month kitten) reads as five years, and `3-4 years` as
four. The backfill refuses all of these. The fix that looked obvious was to refuse them in the app
as well. It was implemented, reviewed and withdrawn in the same branch, and this entry records why,
so it is not tried again in the same form.

**"Refuse" means something different in the two places.** In the backfill, a refusal aborts the
migration and nothing is stored. `approximateBirthDate` must return a date, so a refused age falls
through to the intake date, and the animal is shown as a newborn in the `puppy_kitten` band. That
is fine for junk. For an age with a real magnitude it is worse than the misreading:

- `3-4 years` had read as four years, which is close. Refused, it became a newborn.
- Checking for a digit and punctuation just before the matched number also catches ordinary
  ages written after a list: `Born 2022, 3 yrs` and `lahir 12/06/2023, 3 tahun` became newborns.
  A Malay decimal uses the same comma (`0,5`), so the shape alone cannot tell a decimal from a
  list.
- Word ranges (`6 to 8 months`, `between 2 and 3 years`, `3~4 years`) went straight past the
  check, so "refused as the backfill refuses" was not true in either direction.

**The same reasoning removed a sixty-year ceiling.** The branch also capped the count at the
backfill's sixty years, so `61 years` gave the intake date. A second review showed the same
trade: `61 years`, probably a typo for `16`, had read as a senior and now read as a newborn.
What shipped guards only the case that was actually broken. A count whose date leaves the range
a `Date` can hold (`15000000 weeks`) threw `RangeError`. A third review rejected sending that to
the intake date as well, because then `15000000 weeks` read as a newborn while `12345678 wks`
read as senior. It is now clamped to the earliest date a `Date` holds (`-271821-04-20`), so a
larger age is always older. Dates are built with `setUTCFullYear`, because `Date.UTC` put
`2000 years` in 1926.

Measured on a 425-pair grid of ages and intakes, master against the branch: 272 identical, 81
where master threw, and 72 that differ. Every one of the 72 has an intake year or a derived
year from 0 to 99, so it is the century fix. No pair that master read without throwing and that
stays in four-digit years moved.

The clamped date (`-271821-04-20`), like master's own readings of such ages (`1926-06-12`,
`-234583-03-21`), cannot be saved through the pet form, which refuses a birth date more than
sixty years ago. Opening such a pet to edit asks the operator for a real date. On master the
same pet threw before the page rendered. A third change, building the fall-through from the parsed
intake so that a non-ISO intake comes back as ISO, was dropped too. It turned `26-06-12` into
1926, and it threw on an out-of-range intake for every age. That leak predates this branch and
is noted in the open entry below.

**What would let this be reversed.** A way for the function, or its callers, to say *unknown*
rather than *newborn*: for example, returning no birth date and having the read path show
"age unknown". Then a fractional or ranged age could fail closed the way the backfill does. A
narrower route is to read a range by its lower bound and a decimal by its value. That needs a
deliberate spec covering both decimal commas, the word ranges and the list false positives
above, and its result must agree with what the backfill stores, which today is nothing.

The defects themselves stay open in `tasks/open/approximate-birth-date-misreads-several-age-shapes.md`,
which arrives with PR #114.
