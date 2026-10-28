# Sub-issue links surviving the ledger sync is read from the code, not observed

**Status:** ASSERTED · opened 2026-10-21 · updated 2026-10-28

`scripts/issue-groups.mjs` links issues under parent issues with GitHub's native sub-issues, and
most of them are `ledger` mirrors that `scripts/ledger-issues.mjs` rewrites (81 of the 87 grouped
issues carry the label; 70 of those are open, with an entry the sync reads). The claim that the
links survive rests on reading that script: it edits a mirror's title and body (`gh issue edit --title
--body-file`), and opens and closes it, and never calls a sub-issue API. Relationships are stored
apart from the body, so a rewrite or a close should leave them alone.

What has been observed so far:

- The grouping was applied on 2026-10-21 and `--apply` printed "Verified".
- A close by a pull request's closing keyword kept the link: #157 was closed by #195 at
  2026-10-27T11:54:50Z and still has parent #191. The sync itself did not close it; its run a
  second later found nothing to do.
- A sync close kept the link: #91 was closed by `github-actions` at 2026-10-27T15:53:47Z, a second
  after the sync posted its close comment (the entry left `tasks/open/` in 51c8ebb, #199), and on
  2026-10-28 it still has parent #184. A sync body rewrite of a linked mirror has not been seen yet.
- Every body rewrite the sync has made so far predates the parents: the last ones (#159 at
  16:20:31Z, #59 at 16:20:34Z on 2026-10-21) came before the first parent, #183, at 16:20:42Z.

**Settles when:** a ledger sync that updates a linked mirror's body leaves `parent` set on it
(read with `gh api graphql` on `issue(number: N) { parent { number } }`). If the link is gone,
the grouping script has to re-link after every sync, and the decision in
`tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md` is wrong on that point.
