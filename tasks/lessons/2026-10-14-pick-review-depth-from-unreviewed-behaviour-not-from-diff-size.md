# Pick review depth from unreviewed behaviour, not from diff size

**Learned:** 2026-10-14

Prompted by the user: "dont do max review bro, why are you wasting tokens?"

I ran `/code-review max` on a 41-file, +4963-line diff. The reasoning was "big diff, and 2,570
lines of SQL I did not write". Both halves of that were bad measures.

- **Markdown dominated the diff.** Decision entries, lessons and `todo.md` streams were the bulk of
  those lines. None of it carries behaviour, and no amount of review depth finds a bug in prose.
  Review cost scales with the diff you hand it, so a ledger-heavy branch buys the most expensive
  tier the least to look at.
- **The merged-in SQL arrived pre-reviewed, and said so in its own commit subjects.** The expand
  branch's log reads `Close six defects review found`, `Anchor unit tokens and make rollback
  symmetric`, `Refuse hyphenated ages and rehearse in UTF8`. That is three review rounds, visible
  from `git log --oneline` before I merged it. I merged it and then paid for a fourth.
- **I had already reviewed the same feature twice** at `high`. The genuinely unreviewed,
  behaviour-bearing change since round 2 was three files: the contract rewrite, the estimate-flag
  fix, and the harness.

So the proportionate call was `high` against those paths, or `medium` given two prior rounds — not
`max` against everything.

**The complication, and the reason this is not simply "I was wasteful".** The `max` run found
fourteen real defects, including one that makes the documented rollback path destroy every
production birthday. A cheaper review scoped to "what changed since round 2" would plausibly have
missed it, because it lives in the *interaction* between the merged-in expand rollback and my
contract — neither file is new, and the defect is in the seam. Depth paid off here. The lesson is
therefore not "always go cheaper"; it is that **I did not choose, I escalated by reflex**, and a
reflex that happens to pay is still not a decision. Had I thought about it I would have reached for
`high` on the full diff, which is the shape that catches a seam without paying `max` to read
prose — and I should have said out loud why a tier was warranted rather than letting diff size
decide.

**Rule:** before choosing a review tier, state in one line what is unreviewed and
behaviour-bearing, and size the tier to that — not to `git diff --shortstat`. Check `git log
--oneline` on anything merged in: commit subjects naming review rounds are evidence it has been
reviewed, and re-reviewing it is a cost with a known-low yield. Escalate past `high` only for a
named reason — a cross-file seam, a one-way door, a destructive migration — and say the reason.
Diff size is a proxy for reading cost, never for risk.
