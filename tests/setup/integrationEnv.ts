import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { afterAll } from "vitest";

/**
 * Tier-3b environment wiring, registered on the `integration-db` project only.
 *
 * Two jobs, both of which have to happen before anything from `src/lib` loads:
 *
 *  1. Put `DATABASE_URL` (and the auth secrets) into `process.env`.
 *  2. Close the pg pool when the run ends.
 *
 * Ordering matters. `setupFiles` are evaluated in order, and
 * `@/lib/server/prisma` reads `DATABASE_URL` once, when it first loads.
 * Registering this file after anything that loads it would leave Prisma with no
 * database at all, and every strict assertion would then fail for a missing
 * connection instead of the real schema, which is indistinguishable from a
 * genuine failure.
 */

/**
 * Vitest does not read `.env.local`.
 *
 * That is a Next.js behaviour, not a Vite one — Vite exposes only `VITE_`-
 * prefixed variables, and only on `import.meta.env`, never on `process.env`.
 * Nothing in `vitest.config.mts` fills the gap, so without this call (or a
 * `DATABASE_URL` exported by the npm script) this lane would have no database.
 *
 * `.env.local` first (developer machine), then `.env` (CI writes one next to
 * its service container). `override: false` is the default and is what makes an
 * explicitly exported `DATABASE_URL` win over the file — which is exactly how
 * the "point it at a nonexistent database and prove the suite goes red" check
 * is performed.
 */
for (const filename of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) {
    loadDotenv({ path, quiet: true });
  }
}

/**
 * Closes the Prisma client and the pg pool once the file's tests finish.
 *
 * Vitest keeps a worker alive while any handle is open, so an integration file
 * that touched the database hangs at the end of the run without this. Imported
 * dynamically for the same reason `nextMocks.ts` defers its own imports: a
 * static import here would instantiate the real Prisma client before a test
 * file's own `vi.mock("@/lib/server/prisma")` could register.
 *
 * `disconnectPrisma()` is safe to call twice and safe when no connection was
 * ever made, so this is unconditional.
 */
afterAll(async () => {
  const { disconnectPrisma } = await import("@/lib/server/prisma");
  await disconnectPrisma();
});
