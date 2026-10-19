import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` is resolved by Next at build time and is not an npm dependency
  // here, so the sponsor data-access layer that imports it needs a stub to load.
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
};

/**
 * Shared by every project below. Kept as one object so a project cannot quietly
 * drift onto a different alias table or skip the global mock harness.
 *
 * `hermeticEnv.ts` runs first and scrubs the developer's shell environment;
 * `hermeticRuntime.ts` pins the time zone and blocks the network. Both run
 * before anything under test loads. `integration-db` takes this list without
 * the scrub, because that tier needs its database.
 */
const shared = {
  globals: true,
  setupFiles: ["./tests/setup/hermeticEnv.ts", "./tests/setup/hermeticRuntime.ts", "./tests/setup/nextMocks.ts"],
  // Every tier has files now, so an empty run means a moved folder or a broken
  // glob, and must fail rather than report green. A command that may select
  // nothing on purpose (`vitest related`) passes `--passWithNoTests` itself.
  passWithNoTests: false,
  // `vi.stubEnv` and `vi.stubGlobal` are undone between tests (Vitest 4 restores
  // them as each test starts), so a test cannot leak an environment variable or a
  // global into the next one.
  unstubEnvs: true,
  unstubGlobals: true,
  // A test that makes no assertion fails instead of passing vacuously.
  expect: { requireAssertions: true },
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Needed at the root as well as per-project: the "nothing matched at all"
    // check runs before any project config is consulted.
    passWithNoTests: false,

    // Environment and env-var routing is per-project rather than
    // `environmentMatchGlobs`: that option was deprecated in Vitest 3 and
    // REMOVED in Vitest 4 (this repo runs 4.1.10), where it is silently ignored
    // rather than reported. Projects are the supported replacement.
    projects: [
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "unit",
          environment: "node",
          // Tiers 1-2: domain logic and architectural guards. Server Components
          // and Server Actions are deliberately NOT rendered in jsdom — see the
          // "Server Component / jsdom Trap" in
          // docs/tasks/TESTING_STRATEGY_AND_MULTI_AGENT_PLAN.md.
          include: ["tests/unit/**/*.test.{ts,tsx}"],

          // Same cause as the components tier below, and the same fix. The
          // architectural guards here walk the whole source tree synchronously;
          // under full-suite parallel load on Windows three of them crossed the
          // 5s default and failed as timeouts rather than assertions, while
          // passing in isolation. Observed: shelterIdentity (~6s), agentGuard
          // (5507ms), clinical5NF. Raised rather than worked around — trimming
          // a guard to fit the clock would mean scanning less.
          testTimeout: 20_000,

          // Off, whatever the shell says: a `STRICT_PERSISTENCE=true` copied from the
          // integration tier would make every fallback here rethrow.
          env: { STRICT_PERSISTENCE: "false" },
        },
      },
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "integration",
          environment: "node",
          // Single-level glob on purpose. `tests/integration/db/` holds the
          // Tier-3b suites that require a reachable Postgres; they belong to the
          // `integration-db` project below and must not be swept up here, or
          // every run without a database goes red. Narrowing `include` rather
          // than setting `exclude` keeps Vitest's default exclude list (which
          // covers node_modules and dist) intact — assigning `exclude` replaces
          // those defaults rather than adding to them.
          include: ["tests/integration/*.test.{ts,tsx}"],
          // Strict persistence is a property of this tier, not of the command
          // that launched it. Declaring it here means `npm run test:integration`,
          // `npm run test:all`, a bare `vitest` watch, and an IDE run all get it.
          // Relying solely on `cross-env` in the npm script would let `test:all`
          // run these specs against the forgiving in-memory fallback and report
          // green while verifying nothing — the exact failure mode this tier
          // exists to prevent.
          env: { STRICT_PERSISTENCE: "true" },
          // The same budget as the other two lanes. Several suites here import
          // Server Actions whose first load is heavy, and under the load of
          // concurrent sessions the 5s default failed them for time, not
          // behaviour (`rbacAuthorization`'s "rejects an anonymous caller").
          testTimeout: 20_000,
        },
      },
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "integration-db",
          environment: "node",
          include: ["tests/integration/db/**/*.test.{ts,tsx}"],

          // The shared list without `hermeticEnv.ts`, which would delete the
          // `DATABASE_URL` this tier exists to use. `integrationEnv.ts` comes
          // first because the repositories build the Prisma pool from
          // `DATABASE_URL` when they load; loading `.env.local` after them would
          // hand Prisma no database at all, and every assertion below would
          // then fail for a missing connection instead of the real schema —
          // which is indistinguishable from a genuine schema failure.
          setupFiles: [
            "./tests/setup/integrationEnv.ts",
            ...shared.setupFiles.filter((file) => file !== "./tests/setup/hermeticEnv.ts"),
          ],

          // Tier 3b: the only suites that talk to a real PostgreSQL server.
          //
          // Opt-in, via `npm run test:db`, and deliberately NOT part of
          // `npm run test:all`. Every other tier runs anywhere — the app is
          // designed to work with no database at all — so folding these in would
          // make a green tree depend on Docker being up, and CI would fail for a
          // missing container rather than a broken change.
          //
          // The opposite mistake is the more dangerous one, so these suites
          // *fail* rather than skip when `DATABASE_URL` is unset. A skip reads as
          // a pass in the summary line, which is precisely how "verified against
          // Postgres" became a claim nobody had actually tested.
          //
          env: { STRICT_PERSISTENCE: "true" },

          // These suites share one database, so they must not race each other
          // over the same receipt-sequence rows.
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        test: {
          ...shared,
          name: "components",
          environment: "jsdom",
          // Tier 4: client components only.
          include: ["tests/components/**/*.test.{ts,tsx}"],

          // Vitest's 5s default is a node-lane number. Mounting a Base UI
          // dialog in jsdom and driving it with `user-event` — which advances a
          // real timer per keystroke — costs seconds per test, and with four
          // files in parallel the slowest legitimately crossed 5s and failed for
          // load rather than for behaviour. Raised rather than worked around,
          // because trimming the interactions to fit would mean testing less.
          testTimeout: 20_000,

          // Appended, so `nextMocks.ts` still wins the ordering it documents.
          // This half is strictly jsdom-shaped — jest-dom matchers, RTL
          // `cleanup()`, and the browser APIs jsdom omits — and must not reach
          // the node lanes, where `document` does not exist.
          setupFiles: [...shared.setupFiles, "./tests/setup/componentSetup.ts"],

          // Off, whatever the shell says; see the unit project.
          env: { STRICT_PERSISTENCE: "false" },
        },
      },
    ],
  },
});
