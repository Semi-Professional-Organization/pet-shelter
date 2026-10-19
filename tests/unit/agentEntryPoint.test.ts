import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";

import { COMMANDS } from "../../scripts/agent.mjs";

/**
 * AGENTS.md carries one line pointing at `node scripts/agent.mjs --help`, and docs may name a
 * command where they prescribe its procedure. An agent follows the doc it is reading, so a doc
 * naming a command that does not exist (renamed, cut, or not built yet) sends it to an error.
 * This is the "one copy of each fact" rule of the agent-scripts plan, made mechanical.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SKIP = new Set(["node_modules", ".git", ".next", "worktrees"]);

function markdown(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markdown(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

describe("agent scripts entry point", () => {
  const docs = [join(ROOT, "AGENTS.md"), join(ROOT, "CLAUDE.md"), ...["docs", "tasks", ".claude"].flatMap((d) => markdown(join(ROOT, d)))];
  const named = docs.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/node scripts\/agent\.mjs\s+([a-z][\w-]*)/g)].map((m) => ({ file: relative(ROOT, file), command: m[1] })),
  );

  it("is pointed at from AGENTS.md", () => {
    expect(readFileSync(join(ROOT, "AGENTS.md"), "utf8")).toContain("node scripts/agent.mjs --help");
  });

  it("has every command a doc names", () => {
    const missing = named.filter((n) => !Object.hasOwn(COMMANDS, n.command));
    expect(missing).toEqual([]);
  });

  it("finds the names it checks, so an empty scan cannot pass as a clean one", () => {
    expect(named.map((n) => n.command)).toContain("usage");
  });
});
