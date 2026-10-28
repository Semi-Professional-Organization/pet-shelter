# Rebasing a pushed branch loops when GitHub Desktop pulls it back

**Learned:** 2026-10-28

`feature/frontend` was rebased onto `master` (32 commits, conflicts resolved, all gates green)
but not force-pushed. GitHub Desktop then saw the local branch diverged from
`origin/feature/frontend` and pulled, which **merged the pre-rebase copies back in** (`6c496e9c`)
and pushed that. A second `rebase master` then tried to linearise the merge: 32 rebased commits
applied, then the 32 old duplicates started replaying and conflicting. Every remaining pick was a
duplicate; resolving them would have replayed old versions over new ones. `git rebase --abort`
returned the branch to the pushed merge, in sync with GitHub, with nothing lost.

**Rule:** a branch already on GitHub is brought up to date with `master` by **merging** it, not
rebasing — unless the same step force-pushes with `--force-with-lease`. If a rebase's remaining
picks have the same subjects as its done list, it is replaying a merged-back history: abort it,
do not resolve it.
