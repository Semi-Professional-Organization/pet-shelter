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

**The file is the identity: each group records its parent's number.** `--apply` writes
`"parent": <n>` into the working copy's file for each parent it creates or adopts, for the owner to
commit. A recorded parent that lost its `group` label, had it recased, or had its marker line edited
is repaired (relabelled, re-rendered, reopened), never replaced. Until a number is recorded, a group
adopts the one issue that carries the label (compared ignoring case, as GitHub does) and a
`<!-- issue-group: <key> -->` marker as its first line; two open claimants are refused rather than
guessed between. Label plus marker is the rule `2026-09-18-ledger-issues-are-a-one-way-mirror.md` set
for the same public-repository reason. Every other labelled, marked issue is retired: it lets go of
its sub-issues and closes. *Rejected:* identity from label and marker alone, which the audit of
2026-10-21 showed duplicates a parent whenever a person edits either. *Rejected:* a separate
generated lock file, a second copy of the same fact.

Parents never carry `ledger`, so `scripts/ledger-issues.mjs` never edits them; that script rewrites
`ledger` issues' titles and bodies and never touches relationships, so links survive it (read from
its code). A renamed ledger entry gets a new issue; the old one closes and stays linked, and the run
reports it.

**The plan compares two whole states, by node id.** The links the file wants against every link on
a parent this script manages, keyed by GitHub node id and never by number, since sub-issues may
cross repositories. *Rejected:* walking the file group by group, which needed a special case for
every state found and missed the rest (departed groups, closed duplicates, foreign children).

**GitHub's rules are checked on the finished tree, before any write.** One parent per issue, 100
sub-issues, no loops at any depth, eight levels of nesting, title and body limits. The links are
ordered by simulating them against those rules, so no link is refused for a slot or a loop another
link would have cleared. What no order can make legal (a parent nested under its own member) is
refused by the dry run. A refusal at apply is then run-wide (access, network, rate limit), which is
why apply stops at the first one. Rate limits are waited out (60s, 120s, 180s; `gh` hides
Retry-After). An issue under a parent this account cannot see is left alone with a note.

**Dry run from the working copy; `--apply` from the default branch, and it must finish.** A dry run
plans the working copy, so an edit shows before it is committed, and says when it differs from
master. `--apply` reads the file from `origin/<default>` after a fetch, as the ledger mirror does,
so a stale or unmerged checkout cannot undo what master holds; it needs write access, the least that
can create a label and label a new issue. After writing it reads GitHub again and plans again with
every parent recorded: that plan must be empty, or it prints what is left and exits non-zero.
Nothing publishes on push: grouping is a judgement a person makes. *Rejected:* a workflow on push to
master, which would make every merged edit a change to a public repository with no dry run between.

**Tested as one rule over many states.** `tests/unit/issueGroupsConverge.test.ts` runs the planner
against a fake GitHub that enforces GitHub's documented rules, over 3,000 generated states (missing,
closed, duplicate, unlabelled, recased and edited parents; departed groups; foreign, hidden and
hand-made links). Every state converges in one apply, without a refused write, a second parent, or
a touched link the file does not own, or is refused for a reason the test confirms (a real loop, an
emptied file). Measured 2026-10-21: 2,685 converged, 203 refused a real loop, 112 an emptied file.

**By design, and stated here so nobody files them:** nesting a person adds among a group's own
issues is flattened; hand edits to links the file owns are reverted; renaming a group key retires
the old parent, with its comments; sub-issue order is not managed.

**`--suggest` only proposes.** For each ungrouped issue it ranks the groups by TF-IDF similarity to
each group's members (named files, identifiers and words) and prints the overlap as evidence. A
person adds the issue to the file. Measured on 2026-10-21 by `--suggest --evaluate`, leave-one-out
over the first grouping's 69 issues and judged as `--suggest` prints them: **79.7%** got a clear
proposal of their real group, **11.6%** a clear proposal of another, and **8.7%** "no clear group";
the real group ranked in the top two for **95.7%**, with a tie counted against it. Group parents are left out of the weights, so
applying the grouping does not move these figures. Misses cluster where a group is about a subject
rather than about files: #64 and #121 ranked their real group 10th and 7th. An earlier
count of 81.2% scored the raw top guess, including ones `--suggest` prints as no clear group.
