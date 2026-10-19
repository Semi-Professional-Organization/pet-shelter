# Prove a test fails without the fix by aliasing the old module, not by reverting the tree

**Learned:** 2026-10-19

The role dead-end session had to show every new test failing without its fix, in a main checkout
other sessions share, where breaking code "to prove it" is forbidden
(`.claude/templates/triage-rules.md` §5). It worked without touching a tracked or untracked file:
write `git show origin/master:<path>` for each changed module under
`node_modules/.probe/<name>/<path>` (inside `node_modules`, so the copy resolves bare imports the
way the original does), and run vitest with a config that is a plain object (`export default
{ root: <repo>, resolve: { alias: [...] }, test: {...} }`, so it needs no `vitest/config` import and
can live in the scratchpad) whose first aliases map `@/app/admin/page`-style specifiers to those
copies, then `@/` to `src/`. Seventeen probes ran this way. One failed for the wrong reason at
first: the old settings page keeps its test-email button on a second tab, so the test failed on
not finding that button instead of on the "Save All Settings" button it was about. Only the
failure message showed it; reordering the assertions made the probe fail on the real defect.

Two traps: an old module that imports a file the branch deleted needs that file overridden too
(the old FAQ page needed `src/lib/domain/faqAccess.ts`), and a copy placed outside `node_modules`
fails on its first bare import.

**Rule:** to show a test discriminates, alias the changed modules to their base-branch copies under
`node_modules/.probe/` and run the unchanged test; read the failure message, not just the count.
