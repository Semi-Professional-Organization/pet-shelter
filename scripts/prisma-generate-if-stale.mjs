#!/usr/bin/env node
/**
 * Regenerates the Prisma client only when `prisma/schema.prisma` differs from the
 * schema the installed client was generated from.
 *
 * Every `npm test` used to run `prisma generate` unconditionally (the `pre*` test
 * scripts). That keeps the client from going stale, which matters here: a stale
 * client fails in files nobody touched. But `prisma generate` deletes and rewrites
 * `node_modules/.prisma/client`, and several sessions share one `node_modules` on
 * this machine, so one session's `npm test` broke another session's run mid-flight
 * with `Cannot find module '.prisma/client/default'` (seen 2026-10-20). Skipping the
 * rewrite when nothing changed keeps the guarantee and removes the collision.
 *
 * Whitespace is ignored in the comparison: `prisma format` realigns columns without
 * changing the schema, and the client built from either spelling is the same.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SCHEMA_PATH = "prisma/schema.prisma";
export const GENERATED_SCHEMA_PATH = "node_modules/.prisma/client/schema.prisma";

/** True when the generated client was built from this schema, whitespace aside. */
export function isClientCurrent(schemaText, generatedSchemaText) {
  if (generatedSchemaText === null || generatedSchemaText === undefined) return false;
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  return normalize(schemaText) === normalize(generatedSchemaText);
}

function main() {
  const generated = existsSync(GENERATED_SCHEMA_PATH)
    ? readFileSync(GENERATED_SCHEMA_PATH, "utf8")
    : null;

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
