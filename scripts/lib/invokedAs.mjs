/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/agent.mjs`, matched as whole path segments (`myscripts/agent.mjs` is not it); Node
 * always gives argv[1] as an absolute path. Windows separators are normalised first, and on
 * Windows and macOS, where paths are case-insensitive, so is the comparison.
 *
 * Used by the agent scripts. Three older scripts (`commit-msg.mjs`, `ledger-issues.mjs`,
 * `check-doc-invariants.mjs`) still carry their own looser check; aligning them was out of the
 * scope of the change that added this file and is recorded in
 * `tasks/open/three-scripts-keep-their-own-invocation-check.md`.
 */

/** A path as a file system on `platform` compares it: Windows and macOS ignore case by default. */
export const caseFolder = (platform = process.platform) =>
  platform === "win32" || platform === "darwin" ? (path) => path.toLowerCase() : (path) => path;

export const invokedAs = (script) => {
  if (!process.argv[1]) return false;
  const fold = caseFolder();
  return fold(process.argv[1].replace(/\\/g, "/")).endsWith(fold(`/${script}`));
};
