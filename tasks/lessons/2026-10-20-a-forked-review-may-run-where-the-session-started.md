# A forked review may run where the session started, not where your shell is

**Learned:** 2026-10-20

This session worked in a full clone at `scratch/tsr`, inside the main checkout, to stay off a
branch another session had checked out there. Three `/code-review high origin/master...HEAD`
rounds reviewed the clone. The fourth, the first after the context was compacted, reviewed the
main checkout instead: nine findings, all in the other session's files, and none in the 82 files
of this branch. The likeliest cause is that the forked skill took the folder the session started
in rather than the one earlier `cd`s had moved the shell to; that was not confirmed. It left no
edits behind (same `git status`, nothing in the drift log), but a review's probes can edit the
tree they run in.

**Rule:** when the work lives somewhere other than the session's starting folder, name the folder
in the review's arguments ("run every git and file command in <path>; never touch <other
checkout>"), and check the findings' paths against `git diff --name-only` before acting on any.
