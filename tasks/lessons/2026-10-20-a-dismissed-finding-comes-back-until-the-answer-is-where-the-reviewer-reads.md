# A dismissed finding comes back until the answer is written where the next review will read it

**Learned:** 2026-10-20

The test-harness branch (PR #141) went through 18 `/code-review` rounds and 144 findings before the
owner stopped the loop. Roughly ten findings repeated items already answered in an earlier round:
the database tier's environment, the shared `src/` walker, reset registration in production code,
`crypto.ts` reading its secret at import. The pet form's save lock drew findings in 14 rounds, and
some contradicted earlier ones: one round wanted failure recovery added, a later one called it
speculative; two suggested gating on `open`, which a mutation showed saves twice. Each review
starts fresh and sees the diff, not the conversation, so an answer given only in chat does not
exist for it. Repeats stopped once the answer sat in the code (a `ceiling:` comment), a
`tasks/decisions/` entry, or a `tasks/open/` filing. Six of the real bugs were introduced by
earlier fixes, which only a further round could catch.

**Rule:** when you decline or defer a finding, put the reason in what the reviewer reads: a comment
at the line, a decision entry, or one `tasks/open/` entry per class, and name those filings in the
next review's arguments. Count repeats separately when you tally a round. A round made mostly of
repeats is a sign the answers are not on the page, not that the code needs more work.
