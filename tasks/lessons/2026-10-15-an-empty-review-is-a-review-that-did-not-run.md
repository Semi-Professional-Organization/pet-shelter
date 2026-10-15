# An empty review result is a review that did not run, not a clean one

**Learned:** 2026-10-15

**What happened:** On PR #103 the forked `/code-review` of round eight's fixes
(`ec8fbce..b9ffbba`) came back with no result after one tool call and about seven seconds. I
recorded it as not having run, which was right, and then reviewed the delta by hand and
recorded "no findings", which was the mistake. The next day the same review, retried at
`medium`, ran for over a minute and returned seven findings. Four of them were real enough to
fix: a schedule parameter whose default kept the per-row footgun round eight claimed to
remove; a fallback path that took a second instant from the query's; console spies left
mocked when an assertion failed; and the fact that **no test failed if round eight's headline
fix was reverted.** Three mutants confirmed that last one.

The hand review was not careless. It checked the two edge cases it thought of, and both
checked out. It missed the rest because it was mine. That is
`2026-09-03-self-review-is-blindest-where-it-is-most-confident.md`, triggered here by a tool
failure rather than by choice.

**Rule:** before recording a review, read its tool count and duration. One tool call or a few
seconds means the review did not run. Retry it, at the same level or higher. Do not
substitute your own read for it and count that as the review the standing order asks for. If
retrying is impossible, record the gap as a gap, so the next session runs the review instead
of trusting "no findings".
