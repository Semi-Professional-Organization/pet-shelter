# Orient's check for clones made before the rename has known gaps

**Status:** open · opened 2026-10-30 · beyond the ceiling of `againstMain` in `scripts/agent/orient.mjs`

After the default branch was renamed from `master` to `main` (2026-10-28), orient counts only
against `origin/main` and flags a clone whose `origin/HEAD` names something else, or whose
`origin/main` is missing, pointing it at CONTRIBUTING's "Clones made before the rename". Eight review
rounds on the PR that added it found these cases it gets wrong, declined as beyond its ceiling:

- No `origin/HEAD` and only a frozen `origin/master`: not flagged.
- `origin/HEAD` naming `origin/main` with `origin/main` missing: flagged, blaming the rename.
- A branch with no commit yet: reported as "no origin/main to compare with" although it exists.
- A failed `git fetch` still refreshes FETCH_HEAD, so "as of the last fetch, 0 minutes ago" can sit
  beside an `origin/main` that fetch never updated.

Its accuracy is not measured: nothing records how many sessions saw the line, or how many of those
were clones made before the rename.

**Settles when:** every clone the team uses has been repaired (orient prints no repair line in any of
them), at which point the check and its CONTRIBUTING section can be deleted, or one of the cases above
misleads a session in practice and is fixed.
