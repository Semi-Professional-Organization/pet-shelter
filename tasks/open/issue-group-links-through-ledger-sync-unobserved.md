# Sub-issue links surviving the ledger sync is read from the code, not observed

**Status:** ASSERTED · opened 2026-10-21 · updated 2026-10-27

`scripts/issue-groups.mjs` links issues under parent issues with GitHub's native sub-issues, and 64
of the 70 issues it links are `ledger` mirrors that `scripts/ledger-issues.mjs` rewrites. The claim
that the links survive rests on reading that script: it edits a mirror's title and body
(`gh issue edit --title --body-file`), and opens and closes it, and never calls a sub-issue API.
Relationships are stored apart from the body, so a rewrite should leave them alone.

What has been observed so far:

- The grouping was applied on 2026-10-21 and `--apply` printed "Verified".
- A sync *closing* a linked mirror kept the link: #157 was closed by the sync after #195 merged and
  still has parent #191 (read 2026-10-27).
- No sync has yet *rewritten the body* of a linked mirror. The two rewrites so far (#59, #159) ran
  at 16:20:20-39Z on 2026-10-21, before the first parent (#183) existed at 16:20:42Z.

**Settles when:** a ledger sync that updates a linked mirror's body leaves `parent` set on it (read
with `gh api graphql` on `issue(number: N) { parent { number } }`). If the link is gone, the
grouping script has to re-link after every sync, and the decision in
`tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md` is wrong on that point.
