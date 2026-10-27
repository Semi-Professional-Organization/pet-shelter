# Sub-issue links surviving the ledger sync is read from the code, not observed

**Status:** ASSERTED · opened 2026-10-21 · updated 2026-10-27

`scripts/issue-groups.mjs` links issues under parent issues with GitHub's native sub-issues, and
most of them are `ledger` mirrors that `scripts/ledger-issues.mjs` rewrites (64 of the 70 grouped
issues carry the label; 63 still have an entry the sync reads). The claim that the links survive
rests on reading that script: it edits a mirror's title and body (`gh issue edit --title
--body-file`), and opens and closes it, and never calls a sub-issue API. Relationships are stored
apart from the body, so a rewrite or a close should leave them alone.

What has been observed so far:

- The grouping was applied on 2026-10-21 and `--apply` printed "Verified".
- A close by a pull request's closing keyword kept the link: #157 was closed by #195 at
  2026-10-27T11:54:50Z and still has parent #191. The sync itself did not close it; its run a
  second later found nothing to do. So neither a sync close nor a sync body rewrite of a linked
  mirror has been seen yet.
- Every body rewrite the sync has made so far predates the parents: the last ones (#159 at
  16:20:31Z, #59 at 16:20:34Z on 2026-10-21) came before the first parent, #183, at 16:20:42Z.

**Settles when:** a ledger sync that updates a linked mirror's body, and one that closes a linked
mirror (posting its close comment), each leave `parent` set on it (read with `gh api graphql` on
`issue(number: N) { parent { number } }`). If the link is gone, the
grouping script has to re-link after every sync, and the decision in
`tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md` is wrong on that point.
