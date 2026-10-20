#!/usr/bin/env node
/**
 * One entry point for the agent scripts: `node scripts/agent.mjs <command> [args]`.
 *
 * Each command lives in `scripts/agent/<command>.mjs` as a pure core plus a `main(argv)` shell
 * that returns its exit code. Conventions every command follows: line 1 of output is
 * `<command>: PASS|FAIL|ERROR <summary>`, at most 30 lines, a
 * `next:` line when there is a single next action, a `log:` line with the full log, `--json` for
 * machine output. Exit codes as the rest of the repo: 0 pass, 1 finding, 2 could not run.
 *
 * Dependency-free on purpose, like `commit-msg.mjs`.
 */

import { invokedAs } from "./lib/invokedAs.mjs";

/** Listed in `--help`, classed by side effect so a reader knows what running one can touch. */
export const COMMANDS = {
  usage: {
    effect: "read-only",
    summary: "what agent sessions in this repo cost, at official per-model rates",
    load: () => import("./agent/usage.mjs"),
  },
  meter: {
    effect: "hook",
    summary: "this session's context size, what a call costs at it, and when to hand off",
    load: () => import("./agent/meter.mjs"),
  },
  orient: {
    effect: "read-only",
    summary: "where this session is: checkout, branch, uncommitted work, hand-offs waiting",
    load: () => import("./agent/orient.mjs"),
  },
  ledger: {
    effect: "writes tasks/",
    summary: "handoff: write this session's hand-off state for a fresh session to continue from",
    load: () => import("./agent/ledger.mjs"),
  },
  recall: {
    effect: "read-only",
    summary: "search the transcript of the session that wrote a hand-off",
    load: () => import("./agent/recall.mjs"),
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

async function run(argv, commands, out) {
  const [name, ...rest] = argv;
  if (!name) {
    out.write(`agent: ERROR no command\nnext: node scripts/agent.mjs --help\n`);
    return 2;
  }
  if (name === "--help" || name === "-h" || name === "help") {
    out.write(`${helpText()}\n`);
    return 0;
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) {
    // A hook's stdout goes into the agent's context, so a hook says nothing it was not built to.
    if (!rest.includes("--hook")) out.write(`agent: ERROR unknown command ${name}\nnext: node scripts/agent.mjs --help\n`);
    return 2;
  }
  const loaded = await command.load();
  return loaded.main(rest);
}

/**
 * The exit code for a command line. A hook's exit 2 is not "could not run": on UserPromptSubmit
 * it throws the person's message away. So a command run as a hook exits 0 whatever happens here,
 * a module that will not load included, and says nothing.
 *
 * @param {string[]} argv
 * @param {{ commands?: Record<string, { load: () => Promise<any> }>, out?: { write: (text: string) => unknown } }} [options]
 */
export async function cli(argv, options = {}) {
  const { commands = COMMANDS, out = process.stdout } = options;
  const hook = argv.includes("--hook");
  try {
    const code = await run(argv, commands, out);
    return hook ? 0 : code;
  } catch (error) {
    if (!hook) out.write(`agent: ERROR ${error.message}\n`);
    return hook ? 0 : 2;
  }
}

if (invokedAs("scripts/agent.mjs")) {
  cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

