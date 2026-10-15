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
read as senior. It is now clamped to the earliest date a `Date` holds (`-271821-04-20`), which is
older than any age that fits.

**Two more changes were dropped.** One built the fall-through from the parsed intake, so that a
non-ISO intake came back as ISO. It threw on an out-of-range intake for every age. The other
swapped `Date.UTC` for `setUTCFullYear`, because `Date.UTC` puts `2000 years` in 1926. A fifth
review showed that it also turned a hand-typed two-digit intake (`26-06-12`) from 1926 into
26 AD. It also put year-0026 dates into the pet form, where `isoDateSchema`, still on
`Date.UTC`, rejects them as "not a real calendar day". Both quirks predate this branch. A third
date validator, `isIsoDate` in `transparency.ts`, already reads years 0–99 literally, so a
century fix has to settle all three copies together.

Measured on a grid of ages and intakes, master against the branch, later extended with the three
non-ASCII strings PR #113's harness pins: 476 pairs, 389 identical, 87 where master threw, none
that differ otherwise. Every input master read without throwing reads the same here.

What remains new is only the date an overflow gets where master threw:

- **An age-side overflow** with an in-range intake clamps to `-271821-04-20`, which
  `withDerivedAge` reads as `273847 years`, senior.
- **An intake that is itself out of range**, where the derived date also overflows, comes back
  as given (`300000-01-01`), as master already did for an age with no unit. It reads as a
  newborn, the default this entry warns against, and is kept only because there is no in-range
  answer to clamp to. A derived date that fits is returned as computed, as on master, and with
  such an intake that can itself be a future date (`250000 years` before `300000-01-01`).

**This is defensive today; nothing user-visible changes.** Only a pet with an `age` and no
`birthDate` reaches `approximateBirthDate`. The Prisma `Pet` model has no `age` field, so no
database read does, even though production's `pets` table still has the column until the
birth-date migration is applied. What remains is a browser's `localStorage` copy, derived in
`usePetStore`'s initializer. There master's throw was caught, and the fixtures showed for one
render. Then the store's mount effect (`petStore.ts`, `setPets(JSON.parse(saved))`) replaced
them with the saved pets as stored, without deriving anything. That same effect discards the
clamped value on this branch. The clamp matters once that mount effect derives ages too, or once
a new caller passes an age.

Two earlier versions of this paragraph described consequences that were never traced. One was a
database swap to demo pets, the other a browser losing its saved pets. Both were wrong. See
`tasks/lessons/2026-10-15-probe-that-the-input-can-reach-the-path-not-just-that-the-path-exists.md`.

**What would let this be reversed.** A way for the function, or its callers, to say *unknown*
rather than *newborn*: for example, returning no birth date and having the read path show
"age unknown". Then a fractional or ranged age could fail closed the way the backfill does. A
narrower route is to read a range by its lower bound and a decimal by its value. That needs a
deliberate spec covering both decimal commas, the word ranges and the list false positives
above, and its result must agree with what the backfill stores, which today is nothing.

The defects themselves stay open in `tasks/open/approximate-birth-date-misreads-several-age-shapes.md`,
which arrives with PR #114.
