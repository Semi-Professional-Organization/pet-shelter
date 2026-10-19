import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  LOCAL_DATABASE_URL,
  isLocalDatabaseUrl,
  resolveDatabaseUrl,
} from "../../prisma/env";
import { withEnvFiles, snapshotProcessEnv } from "../support/envFiles";

/**
 * `resolveDatabaseUrl()` decides which database `prisma db push` and
 * `prisma/seed.ts` talk to. Everything below is a characterization of that
 * decision, because the failure mode is not a red test — it is a schema push or
 * a `deleteMany` landing on the wrong server while both commands exit 0.
 *
 * Static import is safe here: `prisma/env.ts` imports only dotenv and runs
 * nothing at module scope, so there is no client to instantiate ahead of a mock.
 * The harness's rule about early imports is about `@/lib/server/prisma`, which
 * this module never touches.
 *
 * The repo root is never the cwd inside a test. `withEnvFiles` moves the process
 * into a temp directory first; without it these tests would read the real
 * `.env.local` and pull hosted credentials into the run.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const NEON_URL =
  "postgresql://user:pw@ep-example-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const CI_URL = "postgresql://ci:ci@db:5432/ci_db?schema=public";
const SHELL_URL = "postgresql://shell:shell@localhost:5432/from_shell?schema=public";

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = snapshotProcessEnv();
  // The runner's own environment may carry DATABASE_URL (the `test:db` script
  // exports one). Cleared so that "no shell variable" means what it says.
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  restoreEnv();
});

describe("resolveDatabaseUrl - localhost fallback", () => {
  it("returns the localhost URL when no env file and no shell variable exist", () => {
    const url = withEnvFiles({}, resolveDatabaseUrl);

    expect(url).toBe(LOCAL_DATABASE_URL);
  });

  it("returns the localhost URL when the env files exist but define no DATABASE_URL", () => {
    const url = withEnvFiles(
      {
        ".env.local": "AUTH_SECRET=abc\nRESEND_API_KEY=re_test\n",
        ".env": "NODE_ENV=test\n",
      },
      resolveDatabaseUrl
    );

    expect(url).toBe(LOCAL_DATABASE_URL);
  });
});

describe("resolveDatabaseUrl - precedence", () => {
  it("prefers .env.local over .env when both define DATABASE_URL", () => {
    const url = withEnvFiles(
      {
        ".env.local": `DATABASE_URL=${NEON_URL}\n`,
        ".env": `DATABASE_URL=${CI_URL}\n`,
      },
      resolveDatabaseUrl
    );

    expect(url).toBe(NEON_URL);
  });

  it("falls through to .env when .env.local exists but omits DATABASE_URL", () => {
    // The two files merge key by key; .env.local winning does not mean .env is
    // skipped. This is the case that made `prisma db push` and `db:seed` disagree.
    const url = withEnvFiles(
      {
        ".env.local": "AUTH_SECRET=abc\n",
        ".env": `DATABASE_URL=${CI_URL}\n`,
      },
      resolveDatabaseUrl
    );

    expect(url).toBe(CI_URL);
  });

  it("reads .env when .env.local is absent", () => {
    const url = withEnvFiles({ ".env": `DATABASE_URL=${CI_URL}\n` }, resolveDatabaseUrl);

    expect(url).toBe(CI_URL);
  });

  it("lets a shell DATABASE_URL beat both files", () => {
    // This is what `db:push:local`, `db:seed:local` and `test:db` depend on:
    // cross-env pins localhost for one command without rewriting .env.local,
    // which holds real credentials.
    process.env.DATABASE_URL = SHELL_URL;

    const url = withEnvFiles(
      {
        ".env.local": `DATABASE_URL=${NEON_URL}\n`,
        ".env": `DATABASE_URL=${CI_URL}\n`,
      },
      resolveDatabaseUrl
    );

    expect(url).toBe(SHELL_URL);
  });
});

describe("resolveDatabaseUrl - empty values", () => {
  it("treats an empty DATABASE_URL in .env.local as absent and falls back to localhost", () => {
    // `||`, not `??`. Under `??` this returns "" and Prisma is handed an empty
    // connection string, which fails far from here with an opaque message.
    const url = withEnvFiles({ ".env.local": "DATABASE_URL=\n" }, resolveDatabaseUrl);

    expect(url).toBe(LOCAL_DATABASE_URL);
  });

  it("treats an empty shell DATABASE_URL as absent, discarding .env.local", () => {
    // Characterization of a sharp edge, not an endorsement. dotenv's no-override
    // rule is `hasOwnProperty`, so an exported-but-empty DATABASE_URL counts as
    // defined: it suppresses the file value AND then fails the `||`, so the
    // result is localhost rather than the .env.local target the operator sees.
    process.env.DATABASE_URL = "";

    const url = withEnvFiles({ ".env.local": `DATABASE_URL=${NEON_URL}\n` }, resolveDatabaseUrl);

    expect(url).toBe(LOCAL_DATABASE_URL);
  });
});

describe("resolveDatabaseUrl - side effect on process.env", () => {
  it("leaves the resolved value in process.env for callers that read it directly", () => {
    // `prisma/seed.ts` builds its pg Pool from the return value, but Prisma's own
    // CLI machinery reads process.env. Both must see the same string.
    withEnvFiles({ ".env.local": `DATABASE_URL=${CI_URL}\n` }, resolveDatabaseUrl);

    expect(process.env.DATABASE_URL).toBe(CI_URL);
  });

  it("does not write the localhost fallback into process.env", () => {
    // The fallback is a return value only. If it leaked into process.env, a later
    // caller in the same process could not tell "operator chose localhost" from
    // "nothing was configured".
    const url = withEnvFiles({}, resolveDatabaseUrl);

    expect(url).toBe(LOCAL_DATABASE_URL);
    expect(process.env.DATABASE_URL).toBeUndefined();
  });
});

describe("LOCAL_DATABASE_URL agrees with every other copy of itself", () => {
  // The module comment names this as the next version of the bug it exists to
  // prevent: the same connection string is written out in four places.

  it("is itself a local URL, so the seed can run against its own fallback", () => {
    // `prisma/seed.ts` resolves this constant when nothing is configured and then
    // hands it to `assertSeedTargetIsLocal`. A fallback that is not local turns
    // `npm run db:seed` on a fresh clone into a refusal.
    expect(isLocalDatabaseUrl(LOCAL_DATABASE_URL)).toBe(true);
  });

  it("matches the credentials, port and database in docker-compose.yml", () => {
    const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
    const parsed = new URL(LOCAL_DATABASE_URL);

    expect(compose).toContain(`POSTGRES_USER: ${parsed.username}`);
    expect(compose).toContain(`POSTGRES_PASSWORD: ${parsed.password}`);
    expect(compose).toContain(`POSTGRES_DB: ${parsed.pathname.slice(1)}`);
    expect(compose).toContain(`"${parsed.port}:5432"`);
  });

  it("matches the URL hardcoded in every local-database npm script", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scripts = ["db:push:local", "db:seed:local", "test:db"];

    for (const name of scripts) {
      expect(pkg.scripts[name], `missing script ${name}`).toBeDefined();
      expect(pkg.scripts[name], `${name} drifted from LOCAL_DATABASE_URL`).toContain(
        LOCAL_DATABASE_URL
      );
    }
  });
});
