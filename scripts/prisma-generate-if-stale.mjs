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
 * rewrite when nothing changed keeps the guarantee and removes that collision
 * between checkouts with the same schema.
 *
 * Only the schema can change between installs. `postinstall` runs `prisma
 * generate`, so a Prisma upgrade regenerates the client as it installs, and
 * `prisma.config.ts` holds the schema path and the datasource URL, neither of
 * which reaches the generated client. The checks live in
 * `scripts/lib/prismaClientState.mjs`.
 *
 * ceiling: checkouts with different schemas cannot share one generated client.
 * Each `npm test` regenerates it for its own schema and can break the other's run
 * as before; a worktree on a branch that changes the schema needs its own
 * `node_modules` (`npm ci`). Likewise a client another process is generating at
 * that moment reads as incomplete, so this run generates too and the two race.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  generatedClientDir,
  installedClientVersion,
  isClientComplete,
  isClientCurrent,
  readGeneratedSchema,
} from "./lib/prismaClientState.mjs";

const SCHEMA_PATH = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

const complete = isClientComplete(generatedClientDir(), installedClientVersion());
const generated = complete ? readGeneratedSchema() : null;

if (isClientCurrent(readFileSync(SCHEMA_PATH, "utf8"), generated)) {
  console.log("Prisma client is current with prisma/schema.prisma; not regenerating.");
} else {
  const result = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) console.error(`Could not run \`npx prisma generate\`: ${result.error.message}`);
  process.exit(result.status ?? 1);
}
