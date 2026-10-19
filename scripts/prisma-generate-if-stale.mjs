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
 * field into a `//` comment.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEMA_PATH = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

/** The schema copy beside the client `@prisma/client` loads: `node_modules/.prisma/client`. */
export function generatedSchemaPath() {
  const clientEntry = createRequire(import.meta.url).resolve("@prisma/client");
  return join(dirname(clientEntry), "..", "..", ".prisma", "client", "schema.prisma");
}

/** True when the generated client was built from this schema, spacing within lines aside. */
export function isClientCurrent(schemaText, generatedSchemaText) {
  if (generatedSchemaText === null || generatedSchemaText === undefined) return false;
  const lines = (text) => text.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim());
  return lines(schemaText).join("\n") === lines(generatedSchemaText).join("\n");
}

function main() {
  const generatedPath = generatedSchemaPath();
  const generated = existsSync(generatedPath) ? readFileSync(generatedPath, "utf8") : null;

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
