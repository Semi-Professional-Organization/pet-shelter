# When reviews flip-flop on a test, shrink the claim, not the review loop

**Learned:** 2026-10-15

**What happened:** On the bulletin store (PR #103 and its follow-up), one fallback test went
through five review rounds. Each review attacked the previous fix from the opposite side:

- pin the exact list (round 12);
- that list falsely claims feed order, so derive a set from the fixture (13);
- the derived set copies the rule, so name the load-bearing rows (14);
- the copy uses raw compare, not the product's `slice` (15);
- calling the product function makes the set blind, and the `slice` guards an impossible
  case (16).

At round 14 I concluded that the loop was noise and declared it over in the decision entry,
putting a mutant re-run in place of reviewing my own fix. PR #103 merged on that. The late
review then found real problems in the round I had skipped. They were not product bugs, but the
ledger was asserting coverage the test did not have.

The flip-flop was not reviewers being contrary. **Every round attacked a comment or ledger line
that claimed more than the assertion under it did**: "in feed order", "written independently",
"would fail spuriously". Each fix added a new, slightly-too-large claim, and the next review
found that.

**Rule:** when consecutive reviews of one test point in opposite directions, look for the claim
attached to it, and cut it down to exactly what the assertion checks ("this half catches extra
or missing rows; the named rows check the rule"). Do not add more assertions to make an
oversized claim true. Never end the loop by my own judgement that the findings are small.
CLAUDE.md step 6 has no such exit, and a mutant re-run is evidence for a test, not a review of
a diff. The exit has to be one a findings-seeking review can reach: the loop ends at a round
where every finding, after verification, is refuted or declined with a written reason. Then
run that check honestly. Round seventeen of this same history found the decision entry still
asserting something false about `freshBulletins()`, in the section that states this lesson.
