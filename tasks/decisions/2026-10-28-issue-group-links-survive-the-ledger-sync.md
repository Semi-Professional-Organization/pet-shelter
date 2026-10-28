# Issue group links survive the ledger sync, observed

**Decided:** 2026-10-28

`2026-10-21-issue-groups-are-native-sub-issues.md` says the sub-issue links survive
`scripts/ledger-issues.mjs`, and says it was read from that script's code: the sync edits a
mirror's title and body and opens and closes it, and never calls a sub-issue API. That claim was
tracked as an open entry until a sync body rewrite and a sync close of a linked mirror had both
been seen. Both have now been seen, on GitHub, and the links held each time.

**Body rewrites.** Each issue below was linked once, on 2026-10-21, and has no
`ParentIssueRemovedEvent` since. `github-actions` then rewrote its body, and on 2026-10-28 the
parent is still set:

- #168, linked to #189 at 16:21:45Z on 2026-10-21, body rewritten 2026-10-27T15:53:34Z.
- #69, linked to #191 at 16:22:00Z on 2026-10-21, body rewritten 2026-10-27T16:09:41Z.
- #101, linked to #184 at 16:21:05Z on 2026-10-21, body rewritten 2026-10-27T15:53:37Z.

#182 does not count: its body was rewritten at 16:46:05Z on 2026-10-27 and it was linked to #193
fifty seconds later.

**Closes.** #91 was closed by `github-actions` at 2026-10-27T15:53:47Z, a second after the sync
posted its close comment (its entry left `tasks/open/` in 51c8ebb, #199), and still has parent
#184. Closes by a pull request's closing keyword kept their links too: #157 (closed by #195,
parent #191) and #101 (closed by #198 at 2026-10-27T16:34:29Z, parent #184).

`github-actions` is `.github/workflows/ledger-issues.yml`, the only workflow that edits issues, and
the close comment on #91 is the sync's own text. Read with `gh api graphql`, `issue(number: N)`:

```graphql
parent { number }
userContentEdits(first: 20) { nodes { editedAt editor { login } } }
timelineItems(first: 20, itemTypes: [PARENT_ISSUE_ADDED_EVENT, PARENT_ISSUE_REMOVED_EVENT, CLOSED_EVENT]) {
  nodes { __typename ... on ParentIssueAddedEvent { createdAt parent { number } }
          ... on ParentIssueRemovedEvent { createdAt parent { number } }
          ... on ClosedEvent { createdAt actor { login } } }
}
```

So the grouping script does not need to re-link after a sync, and the 2026-10-21 decision stands
on that point.
