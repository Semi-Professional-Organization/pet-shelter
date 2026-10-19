/**
 * Whether this process was started as `node <...>/<script>`, so a script module can run its CLI
 * when executed and stay importable by tests. `script` is the path from the repo root, such as
 * `scripts/commit-msg.mjs`; Windows separators in argv are normalised first.
 */
export const invokedAs = (script) => Boolean(process.argv[1]) && process.argv[1].replace(/\\/g, "/").endsWith(script);
