# Run a GitHub script against the real API after every query change, because unit tests cannot see GitHub's limits

**Learned:** 2026-10-21

`scripts/issue-groups.mjs` reads parent issues with their sub-issues in one GraphQL query. Review
round 2 added the child's labels to that read so a child carried the same fields as every other
issue. All 38 unit tests passed, because they feed `issuesFromPages` recorded pages and never send
a query. The next live dry run failed outright: `This query requests up to 515,100 possible nodes
which exceeds the maximum limit of 500,000`. Nested page sizes multiply (100 parents x 100
children x 50 labels), and only GitHub counts them.

**Rule:** after any change to a query string in a script that talks to GitHub, run its read-only
path (its default dry run, or `--suggest`) against the real repository before the next review
round. Keep the read cheap enough to run every time: a nested connection asks only for the fields
the planner uses.
