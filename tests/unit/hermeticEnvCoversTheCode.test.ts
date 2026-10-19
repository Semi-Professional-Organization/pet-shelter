import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AMBIENT_VARIABLES, PINNED_VARIABLES } from "../setup/ambientVariables";

/**
 * `tests/setup/hermeticEnv.ts` deletes a fixed list of environment variables so a
 * developer's shell cannot change what a test sees. A fixed list goes stale the
 * day `src/` reads a new variable, and nothing would say so: the new variable
 * would simply leak from the shell into local runs and not into CI. This reads
 * every variable the code under test names and fails on any the harness neither
 * deletes nor pins.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/** `process.env.NAME` anywhere, and the names passed to the secrets resolver. */
function variablesRead(text: string): string[] {
  const direct = [...text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);
  const secrets = [...text.matchAll(/resolveSecret\("([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]);
  return [...direct, ...secrets];
}

const FILES = [...sourceFiles(join(ROOT, "src")), join(ROOT, "prisma", "env.ts")];
const READ = new Map<string, string>();
for (const file of FILES) {
  for (const name of variablesRead(readFileSync(file, "utf8"))) {
    if (!READ.has(name)) READ.set(name, relative(ROOT, file).replace(/\\/g, "/"));
  }
}

describe("the hermetic environment", () => {
  it("finds the variables it is meant to be checking", () => {
    // A floor, so a broken pattern cannot pass by finding nothing.
    expect(READ.size).toBeGreaterThanOrEqual(15);
    expect([...READ.keys()]).toEqual(expect.arrayContaining(["DATABASE_URL", "RESEND_API_KEY", "SESSION_SECRET"]));
  });

  it("deletes or pins every variable the code under test reads", () => {
    const covered = new Set<string>([...AMBIENT_VARIABLES, ...PINNED_VARIABLES]);
    const uncovered = [...READ.entries()]
      .filter(([name]) => !covered.has(name))
      .map(([name, file]) => `${name} (read in ${file})`);

    expect(uncovered, "add each to tests/setup/ambientVariables.ts").toEqual([]);
  });
});
