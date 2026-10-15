import { prisma } from "@/lib/server/prisma";

/**
 * Shared plumbing for Tier 3b — the only suites that talk to a real PostgreSQL
 * server. Not a `*.test.ts` file, so Vitest's glob does not collect it.
 */

/**
 * Fails the run when no database is configured, with the command that fixes it.
 *
 * This tier must never *skip*. `src/lib/server/donationLedger.ts` chooses its
 * storage from `Boolean(process.env.DATABASE_URL)`, while
 * `src/lib/server/prisma.ts` quietly falls back to a hardcoded localhost URL. So
 * with `DATABASE_URL` unset, a probe written to exercise Postgres takes the
 * in-memory branch instead and passes — green, fast, and having verified nothing.
 * That is the exact failure mode this tier exists to catch, so the absence of a
 * database is an error rather than a reason to opt out.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      [
        "Tier 3b requires a real PostgreSQL server, and DATABASE_URL is unset.",
        "",
        "Without it the donation ledger silently uses its in-memory branch, so these",
        "assertions would pass without touching Postgres at all.",
        "",
        "  npm run db:up",
        "  npm run db:push:local && npm run db:seed:local",
        "  npm run test:db",
      ].join("\n")
    );
  }

  assertProbeTargetIsLocal(url);
  return url;
}

/**
 * Hostnames that are unambiguously a throwaway database on this machine.
 *
 * Deliberately duplicated from `prisma/env.ts` rather than imported. This is a
 * safety property of the test tier, and it must hold even if the seed tooling is
 * refactored, moved, or excluded from a build — a guard that can be disconnected
 * by an unrelated refactor is not a guard. The two lists are small and static;
 * `tests/unit/layerBoundaries.test.ts` is the place to add a parity check if they
 * ever start drifting.
 */
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

/**
 * Refuses to run the probes against anything but a local database.
 *
 * This tier is destructive: `cleanProbeLedger()` issues `deleteMany` before and
 * after every file, and the suites insert rows. That is fine against a throwaway
 * container and unacceptable anywhere else.
 *
 * The guard is not hypothetical. `tests/setup/integrationEnv.ts` loads `.env.local`
 * into this tier so that `DATABASE_URL` is populated at all, and on a developer
 * machine `.env.local` points at a hosted Neon branch. Running
 * `vitest --project integration-db` directly — without the `npm run test:db`
 * wrapper that pins localhost — would therefore aim the probes at that branch.
 * `npm run test:db` remains the supported entry point; this makes the unsupported
 * one fail loudly rather than quietly write to someone's real database.
 */
export function assertProbeTargetIsLocal(url: string): void {
  if (process.env.ALLOW_REMOTE_DB_TESTS === "true") return;

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a parseable connection string: ${url}`);
  }

  if (LOCAL_HOSTS.has(hostname)) return;

  throw new Error(
    [
      `Refusing to run the destructive Tier-3b probes against a non-local database (host: ${hostname}).`,
      "",
      "These suites delete and insert receipt rows. Run them against the local",
      "container instead:",
      "",
      "  npm run db:up && npm run test:db",
      "",
      "If this host really is a disposable database, set ALLOW_REMOTE_DB_TESTS=true.",
    ].join("\n")
  );
}

/**
 * Receipt scope used by every ledger probe.
 *
 * Dated in year 2999 so it can never collide with a real receipt series, which
 * matters because these suites delete rows by scope to clean up after themselves.
 * `receiptScopeFor` resolves the month in Asia/Kuala_Lumpur, so the UTC instant
 * below is unambiguously January 2999 in both zones.
 */
export const PROBE_INSTANT = new Date("2999-01-15T04:00:00.000Z");

/** Every scope this tier is allowed to create, and therefore allowed to delete. */
export const PROBE_SCOPE_PREFIX = "HFS-DON-2999";

/**
 * Every pledge reference this tier is allowed to create, and therefore allowed to
 * delete. Same year-2999 convention as the receipt scope, for the same reason: a
 * real pledge reference is `HFS-PLG-<today>-…`, so nothing real can start with this.
 */
export const PROBE_PLEDGE_PREFIX = "HFS-PLG-2999";

/**
 * Every general-gift reference this tier may create, and therefore may delete.
 *
 * Its own prefix rather than a reuse of `PROBE_PLEDGE_PREFIX`: the two live in
 * different tables with separate unique indexes, and a shared fence would let a
 * cleanup written for one reach rows of the other.
 */
export const PROBE_GIFT_PREFIX = "HFS-GFT-2999";

/** Actor/reason captured by every rejection probe. */
export const PROBE_REJECTION_AUDIT_CONTEXT = {
  actorId: "probe-coordinator-id",
  actorEmail: "coordinator@example.test",
  actorRole: "VOLUNTEER_COORDINATOR",
  reason: "No transfer received after 30 days",
};

/**
 * Whether `assertDatabaseReachable()` has succeeded in this worker.
 *
 * Teardown consults this so that an unreachable database produces one clear error
 * from `beforeAll` instead of that error plus a second, misleading one from every
 * `afterAll` that tried to clean up a connection which was never established.
 */
let databaseReady = false;

/** True once the server has answered a query in this worker. */
export function isDatabaseReady(): boolean {
  return databaseReady;
}

/**
 * Removes only rows this tier created. Scoped by the 2999 prefix rather than
 * truncating the tables, so running the probes against a database that also holds
 * seed or development data leaves that data untouched.
 *
 * A no-op when the database was never reachable — see `databaseReady`. Errors are
 * *not* swallowed once it is reachable: a cleanup that fails against a live server
 * leaves rows behind and would make the next run fail confusingly.
 */
export async function cleanProbeLedger(): Promise<void> {
  if (!databaseReady) return;

  // Audit rows first: their target is a string rather than a foreign key, but they
  // are part of a rejected probe pledge's durable record. The same year-2999 fence
  // means cleanup cannot reach an application audit row.
  await prisma.auditLog.deleteMany({
    where: { targetId: { startsWith: PROBE_PLEDGE_PREFIX } },
  });
  // A settled probe pledge carries a probe receipt number. There is no database
  // foreign key, but deleting in dependency order keeps the intent legible.
  await prisma.auditLog.deleteMany({
    where: { targetId: { startsWith: PROBE_GIFT_PREFIX } },
  });
  await prisma.petSponsorship.deleteMany({
    where: { pledgeRef: { startsWith: PROBE_PLEDGE_PREFIX } },
  });
  await prisma.donationPledge.deleteMany({
    where: { pledgeRef: { startsWith: PROBE_GIFT_PREFIX } },
  });
  await prisma.donation.deleteMany({
    where: { sequenceScope: { startsWith: PROBE_SCOPE_PREFIX } },
  });
  await prisma.receiptSequence.deleteMany({
    where: { scope: { startsWith: PROBE_SCOPE_PREFIX } },
  });
}

/** Asserts the server is reachable, turning a connection failure into a clear message. */
export async function assertDatabaseReachable(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch (err) {
    throw new Error(
      [
        `Could not reach PostgreSQL at ${process.env.DATABASE_URL}`,
        "",
        "Start the local database and apply the schema:",
        "",
        "  npm run db:up",
        "  npm run db:push:local && npm run db:seed:local",
        "",
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      ].join("\n")
    );
  }
}
