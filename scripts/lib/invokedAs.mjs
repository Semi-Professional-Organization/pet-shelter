/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/commit-msg.mjs`; Windows separators in argv are normalised first.
 *
 * `scripts/ledger-issues.mjs` keeps its own copy on purpose: its workflow runs only when that file
 * changes (`paths` in `.github/workflows/ledger-issues.yml`), so a dependency here would let an
 * edit to this file silence the issue mirror without the workflow ever running on it.
 */
export const invokedAs = (script) => Boolean(process.argv[1]) && process.argv[1].replace(/\\/g, "/").endsWith(script);
