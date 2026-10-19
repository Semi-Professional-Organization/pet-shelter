import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

import { COMMANDS } from "../../scripts/agent.mjs";
import { invokedAs } from "../../scripts/lib/invokedAs.mjs";

/**
 * AGENTS.md carries one line pointing at `node scripts/agent.mjs --help`, and docs may name a
 * command where they prescribe its procedure. An agent follows the doc it is reading, so a doc
 * naming a command that does not exist (renamed, cut, or not built yet) sends it to an error.
 * This is the "one copy of each fact" rule of the agent-scripts plan, made mechanical.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const NAMED = /node scripts\/agent\.mjs\s+([a-z][\w-]*)/g;

/** Commands a text names, as `node scripts/agent.mjs <command>`. */
const commandsNamed = (text: string) => [...text.matchAll(NAMED)].map((m) => m[1]);

describe("agent scripts entry point", () => {
  // Tracked markdown only, as `docs:check` reads it, so an untracked local note cannot make this
  // pass or fail differently from CI.
  const docs = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);

  it("is pointed at from AGENTS.md", () => {
    expect(readFileSync(join(ROOT, "AGENTS.md"), "utf8")).toContain("node scripts/agent.mjs --help");
  });

  it("has every command a tracked doc names", () => {
    const missing = docs.flatMap((file) =>
      commandsNamed(readFileSync(join(ROOT, file), "utf8"))
        .filter((command) => !Object.hasOwn(COMMANDS, command))
        .map((command) => ({ file, command })),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the two inline copies of the invocation check the same as each other", () => {
    // scripts/lib/invokedAs.mjs says why these two keep their own, original copy.
    for (const script of ["scripts/commit-msg.mjs", "scripts/ledger-issues.mjs"]) {
      const source = readFileSync(join(ROOT, script), "utf8");
      expect(source, script).toContain(`process.argv[1] && process.argv[1].replace(/\\\\/g, "/").endsWith("${script}")`);
    }
  });

  it("knows a script by its path from the repo root, in either separator, and on Windows in any case", () => {
    const saved = process.argv[1];
    try {
      process.argv[1] = "D:\\Dev\\Repos\\pet-shelter\\scripts\\agent.mjs";
      expect(invokedAs("scripts/agent.mjs")).toBe(true);
      expect(invokedAs("scripts/commit-msg.mjs")).toBe(false);
      process.argv[1] = "D:/tools/myscripts/agent.mjs";
      expect(invokedAs("scripts/agent.mjs")).toBe(false);
      process.argv[1] = "D:/Dev/Repos/pet-shelter/Scripts/Agent.mjs";
      expect(invokedAs("scripts/agent.mjs")).toBe(process.platform === "win32" || process.platform === "darwin");
    } finally {
      process.argv[1] = saved;
    }
  });

  it("reads a command name the way a doc writes it, and not the --help pointer", () => {
    // Pins the pattern itself, so the scan above cannot go quietly blind.
    expect(commandsNamed("run `node scripts/agent.mjs usage --json`, then node scripts/agent.mjs --help")).toEqual(["usage"]);
    expect(docs).toContain("AGENTS.md");
  });
});
