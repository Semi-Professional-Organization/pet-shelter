# Sub-issue links surviving the ledger sync is read from the code, not observed

**Status:** ASSERTED · opened 2026-10-21

`scripts/issue-groups.mjs` links issues under parent issues with GitHub's native sub-issues, and 63
of the issues it links are `ledger` mirrors that `scripts/ledger-issues.mjs` rewrites. The claim that
the links survive rests on reading that script: it edits a mirror's title and body
(`gh issue edit --title --body-file`), and opens and closes it, and never calls a sub-issue API.
Relationships are stored apart from the body, so a rewrite should leave them alone. Nobody has yet
seen a mirror keep its parent through a sync that edited it, because no links existed before this
script.

The grouping has not been applied either. Until it is, nothing shows that a second run plans no
actions against the real repository, which the tests show only against a recorded state.

**Settles when:** after `npm run issues:groups -- --apply`, a second dry run prints "in sync", and a
ledger sync that updates a linked mirror's body leaves `parent` set on it (read with
`gh api graphql` on `issue(number: N) { parent { number } }`). If the link is gone, the grouping
script has to re-link after every sync, and the decision in
`tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md` is wrong on that point.
