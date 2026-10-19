#!/usr/bin/env node
/**
 * Regenerates the Prisma client only when `prisma/schema.prisma` differs from the
 * schema the installed client was generated from.
 *
 * Every `npm test` used to run `prisma generate` unconditionally (the `pre*` test
 * scripts). That keeps the client from going stale, which matters here: a stale
 * client fails in files nobody touched. But `prisma generate` deletes and rewrites
 * the generated client, and several sessions share one `node_modules` on this
 * machine, so one session's `npm test` broke another session's run mid-flight
 * with `Cannot find module '.prisma/client/default'` (seen 2026-10-20). Skipping the
 * rewrite when nothing changed keeps the guarantee and removes the collision.
 *
 * The installed client is found the way Node finds it, so a worktree that borrows
 * its parent's `node_modules` compares against the client it will actually load,
 * and leaves it alone when the schemas match.
 *
 * Spacing within a line is ignored: `prisma format` realigns columns without
 * changing the schema. Line breaks are not, because joining two lines can move a
 * field into a `//` comment. A client with a file missing (a generation that was
 * interrupted) or built by another Prisma version is stale whatever its schema.
 *
 * ceiling: a generation interrupted after every checked file was written but
 * before the rest still reads as current; `npm run db:generate` repairs it.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

/** The package `@prisma/client` loads from: its `node_modules/@prisma/client` directory. */
function clientPackageDir() {
  return dirname(createRequire(import.meta.url).resolve("@prisma/client"));
}

/** The generated client beside it, which `@prisma/client` requires: `node_modules/.prisma/client`. */
export function generatedClientDir() {
  return join(clientPackageDir(), "..", "..", ".prisma", "client");
}

export function generatedSchemaPath() {
  return join(generatedClientDir(), "schema.prisma");
}

const CLIENT_FILES = ["default.js", "index.js", "package.json", "schema.prisma"];

/** True when every file the runtime loads is there, from the installed Prisma version. */
export function isClientComplete(clientDir, expectedVersion) {
  if (!CLIENT_FILES.every((file) => existsSync(join(clientDir, file)))) return false;
  try {
    const { version } = JSON.parse(readFileSync(join(clientDir, "package.json"), "utf8"));
    return version === expectedVersion;
  } catch {
    // A package.json cut off mid-write is an incomplete client, not a reason to crash.
    return false;
  }
}

/** One line with runs of spaces and tabs collapsed, except inside double-quoted strings. */
function normalizeLine(line) {
  let out = "";
  let inString = false;
  let pendingSpace = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (!inString && (ch === " " || ch === "\t")) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && out !== "") out += " ";
    pendingSpace = false;
    if (ch === '"' && line[i - 1] !== "\\") inString = !inString;
    out += ch;
  }
  return out;
}

/** True when the generated client was built from this schema, alignment aside. */
export function isClientCurrent(schemaText, generatedSchemaText) {
  if (generatedSchemaText === null || generatedSchemaText === undefined) return false;
  const lines = (text) => text.split(/\r?\n/).map(normalizeLine);
  return lines(schemaText).join("\n") === lines(generatedSchemaText).join("\n");
}

function main() {
  const { version } = JSON.parse(readFileSync(join(clientPackageDir(), "package.json"), "utf8"));
  const complete = isClientComplete(generatedClientDir(), version);
  const generated = complete ? readFileSync(generatedSchemaPath(), "utf8") : null;

  if (isClientCurrent(readFileSync(SCHEMA_PATH, "utf8"), generated)) {
    console.log("Prisma client is current with prisma/schema.prisma; not regenerating.");
    return 0;
  }

  const result = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

// Only run when executed directly, so the module stays importable by tests. By
// the path's end, as `scripts/commit-msg.mjs` does: Node resolves the entry
// script's symlinks and junctions in `import.meta.url` but not in `argv[1]`, so
// comparing the two skipped the check silently when run through a link.
const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/prisma-generate-if-stale.mjs");
if (invokedDirectly) {
  process.exit(main());
}
