# "Review, then open the PR" is satisfied only if the review postdates the last code commit

**Learned:** 2026-10-14

Asked to "code review and open PR", a session ran `/code-review` over the whole diff, got fifteen
findings, fixed them in `243412d`, re-ran the gates, and opened PR #104. Every gate was green and
CI passed. The fix commit itself was never reviewed.

That is the exact case `CLAUDE.md` close-out step 6 names — "including every commit that fixed an
earlier review's findings" — and the step exists because PR #38 shipped an unreviewed fix commit
whose second review found eleven defects. The rule was in the checklist the session was working
from. It was missed anyway, because the request read as two steps, review then open, and the fix
round felt like part of the first step rather than new code arriving after it. On this same branch,
the round before had found two false-green holes in a guard written during a fix round.

What made it visible was only that later work forced another review, which then had three
unreviewed commits to cover instead of one.

**Rule:** before opening or updating a PR, list the commits since the last review completed —
`git log --no-merges <reviewed-head>..HEAD`. If that list is not empty, the review is stale,
however recent it feels and however green the gates are. A fix round is new code; the request to
review covers it whether or not the person asking says so.
