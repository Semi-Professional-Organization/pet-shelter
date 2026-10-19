/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/agent.mjs`; Windows separators in argv are normalised first.
 *
 * Two scripts keep their own copy of this check on purpose, and the copies must stay identical:
 * - `scripts/ledger-issues.mjs`: its workflow runs only when that file changes (`paths` in
 *   `.github/workflows/ledger-issues.yml`), so a dependency here would let an edit to this file
 *   silence the issue mirror without the workflow ever running on it.
 * - `scripts/commit-msg.mjs`: the commit-msg hook checks only that the linter file exists, so a
 *   checkout holding it without `scripts/lib/` would fail every commit on a missing import.
 */
export const invokedAs = (script) => Boolean(process.argv[1]) && process.argv[1].replace(/\\/g, "/").endsWith(script);
