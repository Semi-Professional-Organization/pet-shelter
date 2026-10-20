# An invariant checked on a corpus is a sample; enforce it where the rows are

**Learned:** 2026-10-13

The birth-date backfill's header promised that every date it stores is what the app's
`approximateBirthDate` computes, and pointed at rehearsal check O2 as the proof. O2 compared
twelve hand-picked age strings, and it was green.

`"2 young pups, 6 months"` was not one of the twelve. The app's `/(\d+)\s*y/` reads it as two
years, because `young` begins with `y`. The SQL's whole-word tokens skip `young` and read six
months. Two more strings diverged the same way. The corpus could not find them, because a corpus
holds the strings its author thought of, and the author of the corpus was the author of the
tokens.

The repair was not a thirteenth string. The migration now reads every `age` a second time with
the app's own patterns and refuses the row when the two readings differ. The property stopped
being a claim about a test and became a branch in the file that runs against production's rows.

**Rule:** when a one-shot write claims "equal to what X computes" for all rows, and X is cheap to
restate beside the write, compute both in the write and refuse on a difference. Keep the corpus
check for the half that cannot be restated (here, the date arithmetic), and say in the header
which half is enforced and which is measured. "Checked across N shapes" and "for every row" are
different sentences; do not let the second stand on the first.
