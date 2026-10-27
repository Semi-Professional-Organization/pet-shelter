# New ledger entries land in no issue group until someone edits the grouping file

**Status:** open · opened 2026-10-27

Each mirrored `tasks/open` entry (every top-level entry except session claims and hand-offs, which
`scripts/ledger-issues.mjs` skips) becomes a GitHub issue only after its pull request merges, when
the ledger sync runs on master. `.github/issue-groups.json` names issues by number, so the pull
request that adds an entry cannot group it: the issue does not exist yet. A new entry's issue
therefore sits in no group, listed by every `npm run issues:groups` dry run, until a later pull
request adds its number and someone runs `--apply`. #182 waited six days this way.

Declined in #197 as new behaviour beyond that PR. No fix has been designed: any that takes group
membership from somewhere other than the grouping file would revisit
`tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`, which keeps the file as the one
source of truth.

**Settles when:** a new entry's issue can be grouped without a second pull request, or the owner
decides that grouping stays a manual follow-up and this is recorded as a decision.
