/**
 * Whether the installed Prisma client was generated from a given schema, for
 * `scripts/prisma-generate-if-stale.mjs`. Pure apart from reading the files it is
 * pointed at, so the tests import it without running the script.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The package `@prisma/client` loads from: its `node_modules/@prisma/client`
 * directory, found the way Node finds it, so a worktree that borrows its parent's
 * `node_modules` is pointed at the client it will actually load.
 */
function clientPackageDir() {
  return dirname(createRequire(import.meta.url).resolve("@prisma/client"));
}

/** The version of `@prisma/client` that is installed. */
export function installedClientVersion() {
  return JSON.parse(readFileSync(join(clientPackageDir(), "package.json"), "utf8")).version;
}

/** The generated client beside it, which `@prisma/client` requires: `node_modules/.prisma/client`. */
export function generatedClientDir() {
  return join(clientPackageDir(), "..", "..", ".prisma", "client");
}

export function generatedSchemaPath() {
  return join(generatedClientDir(), "schema.prisma");
}

const CLIENT_FILES = ["default.js", "index.js", "package.json", "schema.prisma"];

/**
 * True when every file the runtime loads is there, from the installed Prisma
 * version. A client with a file missing (a generation that was interrupted) or
 * built by another Prisma version is stale whatever its schema.
 *
 * ceiling: a generation interrupted after every checked file was written but
 * before the rest still reads as complete; `npm run db:generate` repairs it.
 */
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

/**
 * True when the generated client was built from this schema, alignment aside.
 * Spacing within a line is ignored: `prisma format` realigns columns without
 * changing the schema. Line breaks are not, because joining two lines can move a
 * field into a `//` comment.
 */
export function isClientCurrent(schemaText, generatedSchemaText) {
  if (generatedSchemaText === null || generatedSchemaText === undefined) return false;
  const lines = (text) => text.split(/\r?\n/).map(normalizeLine);
  return lines(schemaText).join("\n") === lines(generatedSchemaText).join("\n");
}
