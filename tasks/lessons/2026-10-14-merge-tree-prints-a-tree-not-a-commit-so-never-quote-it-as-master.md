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

**A second, quieter version: a real commit that is not on `master`.** The review of the branch that
fixed the above caught the same session citing `925b7c6` as where a fix "landed". `925b7c6` is a
genuine commit — but on `feat/pet-form-birth-date`, which `master` received as a single squash,
`187593c`. `git merge-base --is-ancestor 925b7c6 origin/master` exits 1. So `git log master` never
shows it, and once the feature branch is deleted after merge the hash resolves to nothing at all.
`git cat-file -t` says `commit` and is no help here; ancestry is the question.

The same review caught a third shape in the same text: stating as fact that an open PR "deletes"
a file. The PR had not merged, and on `master` the file was still there and still cited. A claim
about another branch's future is a claim about state, and it goes stale the moment that branch is
revised.

**Rule:** a ref you quote as `master` comes from `git rev-parse origin/master` after a fetch, and
nowhere else. Before writing any hash into a commit message, ledger entry or message to another
session, run `git cat-file -t <hash>` and check it says `commit` — and if the text says the hash is
where something *landed*, also `git merge-base --is-ancestor <hash> origin/master`, which a squash
merge fails. Cite the squash, and keep branch hashes for when the branch history is the point.
Claim another PR will do something only as a conditional, with its state as of writing. More generally, check a claim
about `master` against `git show origin/master:<path>` at the moment of writing — not against the
working tree, which is your branch and not theirs.
