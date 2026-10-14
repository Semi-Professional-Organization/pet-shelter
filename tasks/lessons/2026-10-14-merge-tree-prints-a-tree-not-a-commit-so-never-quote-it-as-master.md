# `git merge-tree --write-tree` prints a tree, not a commit — never quote it as "master"

**Learned:** 2026-10-14

Step 7 of the close-out in `CLAUDE.md` tells every session to run
`git merge-tree --write-tree --name-only HEAD origin/master`. On a clean merge its first line of
output is a 40-character hash, and nothing about it says what kind of object it is. It is the
**tree** the merge would produce. It is not a commit, and it is certainly not `master`.

During PR #42 that hash was `6d32df9…`. I told another session "merges clean against master at
`6d32df9`". It repeated the hash in good faith as "master's `approximateBirthDate` at `6d32df9`",
and I then wrote it into a ledger entry as the commit where `master` still used local-time setters.
That entry mirrors to a public GitHub issue. `git cat-file -t 6d32df9` prints `tree`; the commit
that was meant is `18c533e`. A `/code-review max` caught it — the citation could not be resolved to
the code it claimed to describe, because a tree has no history and no `petAge.ts` at "master".

It belongs to a wider habit that produced most of that review's fifteen findings: writing down a
claim about the state of `master` using evidence that was about something else — the branch I was
on, an earlier fetch, a tool's output I had not identified. Three of those were docstrings and
ledger entries describing two SQL files as transcriptions when one does no arithmetic at all;
another described a validation rule that existed only in a reverted commit.

**Rule:** a ref you quote as `master` comes from `git rev-parse origin/master` after a fetch, and
nowhere else. Before writing any hash into a commit message, ledger entry or message to another
session, run `git cat-file -t <hash>` and check it says `commit`. More generally, check a claim
about `master` against `git show origin/master:<path>` at the moment of writing — not against the
working tree, which is your branch and not theirs.
