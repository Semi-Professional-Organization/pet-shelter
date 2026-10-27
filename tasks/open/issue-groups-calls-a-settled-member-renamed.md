# The grouping dry run calls a settled member "renamed"

**Status:** open · opened 2026-10-27

`scripts/lib/issueGroups/plan.mjs` notes every closed member of a group with "If its ledger entry
was renamed, put the new issue in its place." Since #195 settled the master ruleset entry, every dry
run prints that note for #157, whose entry was settled, not renamed: there is no new issue to put
in its place. Removing #157 from the file to silence the note would plan an unlink from #191 and
lose its completed-progress link, so the note has no clean answer today.

Declined in #197 as a behaviour change beyond that PR. The planner could tell the two apart by
whether an open ledger issue now carries the closed one's title, or the file could mark a member
as done.

**Settles when:** a closed member whose entry was settled reads as done, not as a rename to fix, in
the dry run.
