# New ledger entries land in no issue group until someone edits the grouping file

**Status:** open · opened 2026-10-27

Each mirrored `tasks/open` entry (every top-level entry except session claims and hand-offs, which
`scripts/ledger-issues.mjs` skips) becomes a GitHub issue only after its pull request merges, when
the ledger sync runs on master. `.github/issue-groups.json` names issues by number, so the pull
request that adds an entry cannot group it: the issue does not exist yet. (An entry re-added at a
path that had a mirror before reopens that issue, which keeps any parent it had.) A new entry's
issue therefore sits in no group, listed by every `npm run issues:groups` dry run, until a later pull
request adds its number and someone runs `--apply`. #182 waited six days this way.

Declined in #197 as new behaviour beyond that PR. A shape that works: let an entry name its group in
its own header, and have the grouping script find that entry's issue through the mirror's marker,
so the group is chosen when the entry is written.

**Settles when:** an entry can name its group where it is written and the grouping picks its issue
up without a second pull request, or the owner decides that grouping stays a manual follow-up and
this is recorded as a decision.
