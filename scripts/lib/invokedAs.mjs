/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/agent.mjs`, matched as whole path segments (`myscripts/agent.mjs` is not it); Windows
 * separators in argv are normalised first, and on Windows and macOS, where paths are
 * case-insensitive, so is the comparison (`node Scripts/agent.mjs` runs).
 *
 * Two scripts keep their own copy of the original, case-sensitive check on purpose:
 * - `scripts/ledger-issues.mjs`: its workflow runs only when that file changes (`paths` in
 *   `.github/workflows/ledger-issues.yml`), so a dependency here would let an edit to this file
 *   silence the issue mirror without the workflow ever running on it.
 * - `scripts/commit-msg.mjs`: the commit-msg hook checks only that the linter file exists, so a
 *   checkout holding it without `scripts/lib/` would fail every commit on a missing import.
 * Both are invoked by fixed lowercase paths (the workflow, the hook), where the case cannot differ.
 */
export const invokedAs = (script) => {
  if (!process.argv[1]) return false;
  // Windows and macOS file systems are case-insensitive by default.
  const fold = (path) => (process.platform === "win32" || process.platform === "darwin" ? path.toLowerCase() : path);
  const path = fold(process.argv[1].replace(/\\/g, "/"));
  const wanted = fold(script);
  return path === wanted || path.endsWith(`/${wanted}`);
};
