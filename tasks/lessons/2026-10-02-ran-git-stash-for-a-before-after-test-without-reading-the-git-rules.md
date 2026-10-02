# Ran `git stash` for a before/after test without reading the git rules first

**Learned:** 2026-10-02

On 1 Oct, to show that a failing guard was pre-existing, a session ran `git stash` → test →
`git stash pop` on this shared tree. `.claude/templates/triage-rules.md` §5 forbids `git stash`
outright: another session may be running against the same working tree, and a stash pulls its
in-flight files out from under it. Nothing was lost — the pop restored everything — but only
because no other session was mid-write.

**Rule:** a before/after comparison never touches the shared tree. Export the baseline to a
scratch directory instead (`git checkout-index -a --prefix=<scratch>/` or `git worktree add`),
symlink `node_modules`, and run the test there. Read §5 before the first git command of a session
that will compare states, not only before committing.
