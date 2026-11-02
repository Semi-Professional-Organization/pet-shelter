import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveE2eDatabaseUrl } from "./prisma/env";

/**
 * Tier 5 — golden-path browser journeys.
 *
 * Loaded before anything else here: the auth fixture seals a real session
 * cookie with `SESSION_SECRET`, and the app itself needs `DATABASE_URL`. Neither
 * Playwright nor Vitest reads `.env.local` on its own — that is a Next.js
 * behaviour — so without this the fixture would sign sessions with the insecure
 * development fallback while `next dev` signed them with the real secret, and
 * every authenticated spec would be silently rejected as a forgery.
 */
for (const filename of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) loadDotenv({ path, quiet: true });
}

/**
 * Defaults to 3100 rather than 3000 so a run cannot collide with a dev server
 * someone already has open — including one belonging to another agent session
 * on this machine.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * The only database the web server may reach: a local one, or none. See
 * `resolveE2eDatabaseUrl` in `prisma/env.ts` for why, and for the opt-in.
 */
const DATABASE_URL = resolveE2eDatabaseUrl();
if (process.env.DATABASE_URL && !DATABASE_URL) {
  const message =
    "[e2e] DATABASE_URL is not a local database, so the web server runs without one. " +
    "Set E2E_ALLOW_REMOTE_DATABASE=true to run against it.";
  // CI's e2e job provisions Postgres because the database is what it tests. Offline, every
  // spec still passes, so a warning there would be a green job that checked less.
  if (process.env.CI) throw new Error(message);
  console.warn(message);
}

export default defineConfig({
  testDir: "./e2e/specs",

  // Vitest owns `tests/`; keeping the two roots disjoint is what stops each
  // runner from collecting the other's files and failing on unknown globals.
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Fail the run when a test only passes on its retry so flakiness is visible on CI (#145).
  failOnFlakyTests: !!process.env.CI,

  // One worker: the specs share a single database and a single shelter
  // catalogue, so a parallel admin mutation would change what a public spec
  // sees mid-assertion.
  workers: 1,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    // Artifacts on failure only — a green run should leave nothing behind.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // `next dev` rather than `build && start`: the specs assert on rendered
    // content, not on production bundling, and a dev server removes a
    // multi-minute build from every local run.
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    // Set explicitly rather than inherited, because this process has just loaded
    // `.env.local`. An empty value is also what stops `next dev` loading its own copy.
    // RESEND_API_KEY is blank in every mode: the specs mail real-looking addresses and
    // the shelter's notification inbox, and a blank key simulates the send.
    env: { DATABASE_URL, RESEND_API_KEY: "" },
    // Never attach to a server already listening. Its environment is whatever it was
    // started with — a `next dev` on `.env.local` would take every write below
    // straight to production, and the `env` above could not reach it. A port in use
    // now fails the run instead.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
