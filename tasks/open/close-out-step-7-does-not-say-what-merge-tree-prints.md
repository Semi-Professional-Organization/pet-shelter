# The close-out tells every session to run a command whose output is easy to misquote

**Status:** open · opened 2026-10-14 · a proposed change to `CLAUDE.md`, awaiting the owner

Step 7 of the close-out in `CLAUDE.md` tells every session to run
`git merge-tree --write-tree --name-only HEAD origin/main` as a dry-run merge check. On a clean
merge, the first line it prints is a 40-character hash — and nothing says what kind of object that
is. It is the **tree** the merge would produce. It is not a commit, and it is not `master`.

That has already caused a public error. During PR #42 the hash `6d32df9` was quoted to another
session as "master", repeated in good faith, and written into a ledger entry as the commit where
`master` still used local-time setters. The entry mirrors to a public GitHub issue.
`git cat-file -t 6d32df9` prints `tree`. The full account is in
`tasks/lessons/2026-10-14-merge-tree-prints-a-tree-not-a-commit-so-never-quote-it-as-master.md`.

**Why a lesson is not enough.** `CLAUDE.md` step 6 itself records that a rule kept only in
`tasks/lessons/` — and not in the close-out list — was ignored, and let PR #38 ship an unreviewed fix
commit. The command lives in step 7, so the warning belongs next to it.

**Proposed addition to step 7**, after the sentence introducing the command:

> Its first output line is the **tree** the merge would produce, not a commit — never quote it as a
> ref. Use the exit status for clean or conflicted, and cite `git rev-parse origin/main` for the
> commit.

Not applied by the session that found it: `CLAUDE.md` is the process every session follows, and
changing it is the owner's decision rather than a ride-along on a branch about ledger entries.

**Settles when:** the owner adds the clause to step 7, or decides the lesson file is enough and says
why.
