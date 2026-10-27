# New ledger entries land in no issue group until someone edits the grouping file

**Status:** open · opened 2026-10-27

Each new `tasks/open` entry is mirrored into a GitHub issue by `scripts/ledger-issues.mjs`, but
`.github/issue-groups.json` only groups the issues it names. So every new entry's issue sits in no
group, listed by every `npm run issues:groups` dry run, until a pull request adds it to the file and
someone runs `--apply`. #182 waited six days this way. Nothing warns at the pull request that adds
the entry, when its group is easiest to choose.

Declined in #197 as new behaviour beyond that PR. One shape: a CI step that runs the dry run's
ungrouped check and warns when a PR adds a `tasks/open` entry that no group will hold; another: let
an entry name its group in its own header.

**Settles when:** an entry added to `tasks/open` is grouped as part of the pull request that adds
it, or the owner decides that grouping stays a manual follow-up and this is recorded as a decision.
