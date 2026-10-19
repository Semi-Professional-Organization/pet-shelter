#!/usr/bin/env node
/**
 * One entry point for the agent scripts: `node scripts/agent.mjs <command> [args]`.
 *
 * Each command lives in `scripts/agent/<command>.mjs` as a pure core plus a `main(argv)` shell
 * that returns its exit code. Conventions every command follows (the agent-scripts catalog,
 * section 3): line 1 of output is `<command>: PASS|FAIL|ERROR <summary>`, at most 30 lines, a
 * `next:` line when there is a single next action, a `log:` line with the full log, `--json` for
 * machine output. Exit codes as the rest of the repo: 0 pass, 1 finding, 2 could not run.
 *
 * Dependency-free on purpose, like `commit-msg.mjs`.
 */

/** Listed in `--help`, classed by side effect so a reader knows what running one can touch. */
export const COMMANDS = {
  usage: {
    effect: "read-only",
    summary: "what agent sessions in this repo cost, at official per-model rates",
    load: () => import("./agent/usage.mjs"),
  },
};

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    "usage: node scripts/agent.mjs <command> [args]   (<command> --help for its options)",
    "",
    "commands:",
    ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  [${c.effect}] ${c.summary}`),
    "",
    "Exit codes: 0 pass, 1 finding, 2 could not run.",
  ].join("\n");
}

async function run(argv) {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    process.stdout.write(`${helpText()}\n`);
    return name ? 0 : 2;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) {
    process.stdout.write(`agent: ERROR unknown command ${name}\nnext: node scripts/agent.mjs --help\n`);
    return 2;
  }
  const loaded = await command.load();
  return loaded.main(rest);
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/agent.mjs");
if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stdout.write(`agent: ERROR ${error.message}\n`);
      process.exitCode = 2;
    },
  );
}
