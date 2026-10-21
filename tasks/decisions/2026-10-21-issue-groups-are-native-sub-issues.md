# Issue groups are native sub-issues, applied from a file

**Decided:** 2026-10-21

Asked for: a script that organises the open issues into parent issues with child issues, preferring
prebuilt tools and solving in the script what they leave out. It is `scripts/issue-groups.mjs`
(`npm run issues:groups`), reading `.github/issue-groups.json`. Each choice below is one someone
could reasonably reverse.

**GitHub's native sub-issues, not labels, milestones or a Project board.** Sub-issues give each
parent a progress bar and a nested list, and GitHub renders both itself. Labels group but show no
progress; a milestone or a Project board adds a surface nobody here asked for. Checked on this
repository on 2026-10-21: `GET /repos/fergeley/pet-shelter/issues/90/sub_issues` answered 200, and
GraphQL's `AddSubIssueInput` takes `issueId`, `subIssueId`, `subIssueUrl` and `replaceParent`.

**A script of our own rather than a `gh` extension.** `gh` 2.98 has no sub-issue command. Third-party
extensions wrap the same calls, one link at a time, and would add an unpinned binary. What none of the
prebuilt pieces do, and the script does: look up the node id each call needs; diff a list against
GitHub so a dry run is exact and a second run is a no-op; move an issue that already has a parent
(GitHub refuses a second parent unless `replaceParent` is set); and list open issues in no group.

**The file is the source of truth, and parents are their own issues.** A parent counts only with the
`group` label *and* a `<!-- issue-group: <key> -->` marker as its first line, the rule
`2026-09-18-ledger-issues-are-a-one-way-mirror.md` set for the same reason: the repository is
public. Parents never carry `ledger`, so `scripts/ledger-issues.mjs` never edits them; that script
rewrites `ledger` issues' titles and bodies and never touches relationships, so links survive it
(read from its code). A renamed ledger entry gets a new issue; the old one closes and stays linked,
and the run reports it.

**Read from the working tree, run by hand.** Unlike the ledger mirror, nothing publishes on push:
grouping is a judgement a person makes, so a dry run of an edited file before committing it is the
point. *Rejected:* a workflow on push to master, which would make every merged edit to the file a
change to a public repository with no dry run in between.

**`--suggest` only proposes.** For each ungrouped issue it ranks the groups by TF-IDF similarity to
each group's members (named files, identifiers and words) and prints the overlap as evidence. A
person adds the issue to the file. Measured on 2026-10-21 by `--suggest --evaluate`, leave-one-out
over the first grouping's 69 issues: the top guess was the real group for **81.2%**, and the real
group was in the top two for **92.8%**. Misses cluster where a group is about a subject rather than
about files: #62, #64 and #121 ranked their real group 5th, 10th and 6th.
