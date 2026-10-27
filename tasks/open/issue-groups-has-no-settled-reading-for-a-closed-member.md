# The grouping dry run has only rename advice for a closed member

**Status:** open · opened 2026-10-27

`scripts/lib/issueGroups/plan.mjs` notes every closed member of a group with "is closed. If its
ledger entry was renamed, put the new issue in its place." Since #195 settled the master ruleset
entry, every dry run prints that for #157, whose entry was settled, not renamed: there is no new
issue to put in its place, and the note offers no settled reading. Removing #157 from the file to
silence it would plan an unlink from #191 and lose its completed-progress link, so the note has no
clean answer today.

Declined in #197 as a behaviour change beyond that PR. No way to tell a settle from a rename has
been designed or tested yet.

**Settles when:** a closed member whose entry was settled reads as done, not as a rename to fix, in
the dry run.
