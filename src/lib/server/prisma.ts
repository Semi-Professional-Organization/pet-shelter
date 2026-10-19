import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveDatabaseSsl } from "./databaseSsl";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

/**
 * What every query rejects with when no `DATABASE_URL` is configured.
 *
 * It carries Prisma's P1001, "can't reach database server", so the code that
 * tells an outage from a rejected write (`isDatabaseUnavailable`, the
 * repositories' fallbacks) treats "no database configured" exactly as it
 * treats "database down": serve the in-memory store.
 */
export class DatabaseNotConfiguredError extends Error {
  readonly code = "P1001";

  constructor() {
    super("No DATABASE_URL is configured, so there is no database to reach.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * The client for a process with no `DATABASE_URL`: every query rejects at
 * once, and no socket is ever opened.
 *
 * This used to connect to a hardcoded `localhost:5432` instead, so "no database
 * configured" really meant "whatever happens to listen on that port". Tests
 * then wrote fixture rows into another session's Postgres, and authorization
 * results flipped with what was running on the machine
 * (`tasks/decisions/2026-10-20-no-database-url-means-no-database.md`). Offline
 * behaviour is otherwise unchanged: the repositories already serve their
 * in-memory stores whenever a query fails. A local database is still one
 * `DATABASE_URL` away, and the `:local` npm scripts set it explicitly.
 */
function createOfflineClient(): PrismaClient {
  // Lazy, like Prisma's own query promises: nothing rejects until something
  // awaits it. A query built only to be handed to `$transaction([...])` is never
  // awaited on its own, and an eager rejection would surface there as an
  // unhandled rejection the real client never produces.
  const refuse = () =>
    ({
      then: (onFulfilled?: (value: never) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.reject(new DatabaseNotConfiguredError()).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        Promise.reject(new DatabaseNotConfiguredError()).catch(onRejected),
      finally: (onFinally?: () => void) =>
        Promise.reject(new DatabaseNotConfiguredError()).finally(onFinally),
    }) as unknown as Promise<never>;
  // Neither the client nor a model delegate is a thenable, as the real ones are
  // not: answering `then` would make `await prisma.pet` wait forever. Symbol
  // probes such as `util.inspect` get no answer either.
  const isQuery = (key: string | symbol): key is string => typeof key === "string" && key !== "then";
  const model = new Proxy({}, { get: (_target, key) => (isQuery(key) ? refuse : undefined) });
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "$disconnect") return async () => undefined;
        if (!isQuery(key)) return undefined;
        return key.startsWith("$") ? refuse : model;
      },
    }
  ) as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return createOfflineClient();

  try {
    const sslPolicy = resolveDatabaseSsl(connectionString);

    // A managed Postgres like Neon can take several seconds to wake from idle,
    // so the connect timeout is generous; `DB_CONNECT_TIMEOUT_MS` overrides it.
    const connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10000);

    // Reuse connection pool across Turbopack hot reloads in dev mode
    const pool =
      globalForPrisma.pgPool ??
      new Pool({
        connectionString: sslPolicy.connectionString,
        ssl: sslPolicy.ssl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.pgPool = pool;
    }

    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: process.env.PRISMA_LOG === "true" ? ["error", "warn"] : [],
    });
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Prisma] Pool initialization fallback:", err);
    }
    return new PrismaClient({
      log: process.env.PRISMA_LOG === "true" ? ["error", "warn"] : [],
    });
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Closes the Prisma client and the underlying pg pool.
 *
 * Vitest keeps a worker alive while any handle is open, so an integration suite
 * that touched the database hangs at the end of the run without this. Call it
 * from an `afterAll` in the integration setup — never from unit tests, which
 * never establish a connection in the first place.
 *
 * Safe to call more than once, and safe to call when no connection was ever made.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch {
    // Already closed, or never connected. Teardown must not fail a green run.
  }

  const pool = globalForPrisma.pgPool;
  if (pool) {
    globalForPrisma.pgPool = undefined;
    try {
      await pool.end();
    } catch {
      // Same rationale as above.
    }
  }
}

export default prisma;
