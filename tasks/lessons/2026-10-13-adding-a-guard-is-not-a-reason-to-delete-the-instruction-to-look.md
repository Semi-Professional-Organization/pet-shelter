# Adding a guard is not a reason to delete the instruction to look

**Learned:** 2026-10-13

The birth-date backfill reads an age out of prose. Its range guard looked five characters back,
so `"6 months - 1 year"` was stored as one year. For one commit that limit was written in the
header in capitals, with the instruction that mattered: read the `age` column for any row holding
two numbers.

The next commit replaced the window with a count of number-and-unit quantities, which catches
that string at any distance. In the same commit the instruction was deleted and the header said
such ages are refused "however it is spelled".

They are not. The count sees only the unit words the file knows. `"8 weeks - 1 year"`,
`"six months - 1 year"` and `"6 mnths - 1 year"` each hold a second quantity it cannot read, and
each is still stored as one year. The guard had got better and the file had got worse, because
the one control that covered the remainder, a person reading the column, had been removed on the
strength of a rule that was not total. A review caught it the same day.

It was the fourth consecutive fix to that guard, and each had been answered with a narrower
pattern that had its own hole. The fifth answer was to stop: name what the count cannot see,
with examples, pin them in a check that asserts they are stored, and put the instruction back.

**Rule:** before deleting a "check this by hand" instruction because code now checks it, state
what inputs the code cannot see and confirm there are none. For anything that parses free text
there will be some, so the instruction stays and gets narrower, it does not go. And when three
fixes to one pattern have each needed a fourth, the next change is to the claim, not the pattern.
