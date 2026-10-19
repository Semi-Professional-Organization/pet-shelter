/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/agent.mjs`, matched as whole path segments (`myscripts/agent.mjs` is not it); Node
 * always gives argv[1] as an absolute path. Windows separators are normalised first, and on
 * Windows and macOS, where paths are case-insensitive, so is the comparison.
 *
 * Two scripts keep their own copy of the same check on purpose, written out in full:
 * - `scripts/ledger-issues.mjs`: its workflow runs only when that file changes (`paths` in
 *   `.github/workflows/ledger-issues.yml`), so a dependency here would let an edit to this file
 *   silence the issue mirror without the workflow ever running on it.
 * - `scripts/commit-msg.mjs`: the commit-msg hook checks only that the linter file exists, so a
 *   checkout holding it without `scripts/lib/` would fail every commit on a missing import.
 * `tests/unit/agentEntryPoint.test.ts` keeps all three answering alike.
 */

/** A path as a file system on `platform` compares it: Windows and macOS ignore case by default. */
export const caseFolder = (platform = process.platform) =>
  platform === "win32" || platform === "darwin" ? (path) => path.toLowerCase() : (path) => path;

export const invokedAs = (script) => {
  if (!process.argv[1]) return false;
  const fold = caseFolder();
  return fold(process.argv[1].replace(/\\/g, "/")).endsWith(fold(`/${script}`));
};
