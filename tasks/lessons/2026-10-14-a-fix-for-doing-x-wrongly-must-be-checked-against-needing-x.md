# A fix for "it does X when it shouldn't" must be checked against "it must do X"

**Learned:** 2026-10-14

Round five found that re-running the bulletin migration script re-inserted notices staff had
deleted. The fix was precise and correct for that failure: seed only on the run that *creates*
the table. A re-run then never seeds, so it can never resurrect anything.

Round six found the fix had broken the launch. The migration's own header names a second way to
apply it — `prisma db execute --file` — and applied that way the table already exists when the
script runs, so it seeded nothing. Production stops serving the fixture once the table exists, so
every public feed would have been empty from the first day. The case the old behaviour handled
*correctly* — "this table needs its launch content" — was the one the fix removed.

That is a recognisable shape. A defect report describes when the code does something it should
not. The fix narrows the condition until that case is excluded. Nothing in the report describes
the cases where the code *must* still do it, so the narrowing is checked against the one bad case
and nothing else. "Seed only on creation" was a proxy for "seed only when nobody has put content
here yet", and the proxy was wrong on a path the same file documented.

**Rule.** When fixing "it does X when it shouldn't":

1. Write down, before changing anything, every case where it **must** still do X. The old code's
   behaviour is the list to start from — it was doing X for some reason.
2. State the condition you actually mean in words, then check whether your code's condition is
   that, or a proxy for it. "Was created by this run" stood in for "is empty"; "is empty" was the
   meaning.
3. Rehearse the must-do-X cases, not only the must-not one. Here that meant applying the SQL
   without the script and checking the feed still had notices — one extra command.

Related: `tasks/lessons/2026-10-13-a-comment-asserting-a-mechanism-is-a-claim-to-run.md`. Round
five's commit message said re-runs were now "safe for the content as well as the schema". It was
safe for one kind of content and fatal for the other.
