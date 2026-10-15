# The second member of a class means close the class

**Learned:** 2026-10-15

The birth-date backfill and the app read `age` with two regex engines, Postgres and JS. A review
found that a no-break space split them: JS `\s` matches it, Postgres `[[:space:]]` does not, so
`1<NBSP>year 6 months` stored a different birthday from the app's. I fixed it by refusing a list
of Unicode whitespace code points. My own comment beside the fix named the real class (any
non-ASCII character makes the engines disagree) and the alternative (a refusal stage of its own),
and I chose the list anyway because the stage was more code.

The next review found two more members within the hour: U+0085, which splits the engines in the
*opposite* direction, and a non-ASCII letter glued to an English unit, which splits their word
boundaries. Neither was whitespace in the sense my list meant, and one of them I had already
written down as a "residual". The class fix took the same number of lines as the list, removed
every escape from the file, and made the database's unmeasured ctype irrelevant.

**Rule:** when a fix enumerates members of a set, and the defect is really about the set (two
engines that disagree outside some known-safe domain), ask how the *next* member would be found.
If the answer is "by the next review", fix the set: restrict input to the domain both sides
provably agree on, and refuse the rest by name. The first member found is evidence of a class;
the second is proof. A `ceiling:` comment that already names the class-level fix is a signal to
take it, not a licence to defer it.
