# A rebase abort resets its branch to where the rebase started, even after the branch moved

**Learned:** 2026-10-20

On 2026-10-19 two rebases of `feature/frontend` existed at once:

- a stale, paused one in the main checkout;
- a fresh one in a worktree, on a new branch.

Checked in a scratch repository before relying on it, while a branch is mid-rebase in one worktree:

- `git worktree add <path> <branch>` is refused, and so is `git branch -f <branch>`;
- `git update-ref` still moves the branch;
- a later `git rebase --abort` puts it back to the rebase's `orig-head`, discarding the move without
  a warning.

**Rule:** before moving a branch, run `git worktree list` and read each worktree's
`rebase-merge/head-name`. If any paused rebase names that branch, abort it first, then move the
branch — never the other way round.
