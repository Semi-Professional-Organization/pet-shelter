# A fix for a review finding can disable the design it was protecting

**Learned:** 2026-09-22

A review found that the pet birth-date migration would silently discard its own derived dates if
`birthDate` already held values while `age` was still present — the state left by hand-patching
`ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01'` to stop a read storm. The fix was a
guard: refuse when `age` exists and any row has a non-null `birthDate`. It was correct, it came
with a remediation hint, and the rehearsal asserted the refusal and the hint's remedy.

It also broke the thing the branch existed to do. A parallel session's migration was the *expand*
half of an expand/contract pair — it adds `birthDate`, backfills it, and relaxes `age` to nullable
— and to this guard its output is indistinguishable from the hand-patch: `age` present,
`birthDate` populated. Running the two in sequence produced `5 pets row(s) already have a birthDate
while "age" is still present`. The sequence could not run at all.

Nothing caught it. The guard's own rehearsal passed, because it rehearsed the guard against the
case it was written for. The full suite passed. Two rounds of `/code-review` passed, both reviewing
one file. It surfaced only when the two files were executed back to back, which happened because
the owner asked for expand/soak/contract and the composition had to be demonstrated rather than
assumed — and the last demonstration of it predated the guard by several hours.

The eventual fix was better than the original: the two states *are* distinguishable, just not by
the signal chosen. Expand ends with `DROP NOT NULL` on `age`; a hand-patch leaves it `NOT NULL`. A
structural check on nullability separates them exactly, costs one catalog lookup, and needs no
re-derivation — which in turn let a whole duplicated backfill rule be deleted.

**Rule:** when a review finding is fixed by *adding a refusal*, list what else lands in the state
being refused. A guard is a claim that a state is always wrong, and states are usually reached by
more than one route. Then re-run the end-to-end demonstration, not just the unit the guard lives
in: a passing rehearsal of the guard proves the guard fires, never that it should have. Treat any
"verified composes" result taken before a later fix as expired.
