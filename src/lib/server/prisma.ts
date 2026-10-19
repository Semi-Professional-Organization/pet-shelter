import { Prisma, PrismaClient } from "@prisma/client";
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
 * `DATABASE_URL` away: `db:push:local` and `db:seed:local` set it for the CLI,
 * and the app needs it in `.env.local` or the shell to read that database.
 */
function createOfflineClient(): PrismaClient {
  // Said once per process, outside tests (a build prints it from each worker).
  // The Prisma CLI and the seed script still fall back to localhost
  // (`prisma/env.ts`), so `db:push` and `db:seed` without a `DATABASE_URL` fill
  // a database this app will not read, and nothing else would tell the developer.
  if (process.env.NODE_ENV !== "test") {
    console.warn(
      "[Prisma] No DATABASE_URL is set: the app serves its in-memory fixtures and keeps writes in memory. " +
        "Set DATABASE_URL and restart to use a database (the Prisma CLI and seed script default to " +
        "localhost:5432 without it)."
    );
  }

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
  // Only the names the real client answers: its model delegates, their query
  // methods and its `$` methods. Anything else falls through to a plain object,
  // as on the real client: `then` and `asymmetricMatch` are undefined (answering
  // `then` would make `await prisma.pet` wait forever), and `toString` or
  // `JSON.stringify` behave. One object per delegate, as on the real client, so
  // `prisma.pet` is not `prisma.user`.
  const delegates = new Map<string | symbol, object>();
  const delegate = (name: string | symbol) => {
    let found = delegates.get(name);
    if (!found) {
      found = new Proxy({}, {
        get: (target, key) => (MODEL_METHODS.has(key) ? refuse : Reflect.get(target, key)),
      });
      delegates.set(name, found);
    }
    return found;
  };
  // Every `$` method the generated client declares; the `satisfies` makes
  // `typecheck` fail when a Prisma upgrade adds one. A listener or an extension
  // has nothing to attach to offline, so those hand back the client unchanged.
  const clientMethods = {
    $connect: refuse,
    $disconnect: async () => undefined,
    $transaction: refuse,
    $queryRaw: refuse,
    $queryRawUnsafe: refuse,
    $executeRaw: refuse,
    $executeRawUnsafe: refuse,
    $on: () => client,
    // ceiling: the extension is not applied, so a model method it adds is
    // undefined offline. Nothing in src/ extends the client; apply its `model`
    // methods here if something ever does.
    $extends: () => client,
  } satisfies Record<ClientMethod, unknown>;
  const client = new Proxy(
    {},
    {
      get(target, key) {
        if (typeof key === "string" && Object.hasOwn(clientMethods, key)) {
          return clientMethods[key as ClientMethod];
        }
        return MODEL_DELEGATES.has(key) ? delegate(key) : Reflect.get(target, key);
      },
    }
  ) as unknown as PrismaClient;
  return client;
}

/** A query method on a model delegate, as the generated client declares them. */
type ModelMethod = Exclude<keyof PrismaClient["pet"], symbol | "fields">;

/** A method on the client itself, as `prisma.$transaction`. */
type ClientMethod = Extract<keyof PrismaClient, `$${string}`>;

/**
 * The query methods on a model delegate, as `prisma.pet.findMany`. The `satisfies`
 * makes `typecheck` fail when a Prisma upgrade adds or drops one; otherwise the
 * offline client would answer a new method with `undefined`, and the call would
 * throw a TypeError the fallbacks cannot read as "database down".
 */
const MODEL_METHODS = new Set<string | symbol>(
  Object.keys({
    findUnique: true,
    findUniqueOrThrow: true,
    findFirst: true,
    findFirstOrThrow: true,
    findMany: true,
    create: true,
    createMany: true,
    createManyAndReturn: true,
    update: true,
    updateMany: true,
    updateManyAndReturn: true,
    upsert: true,
    delete: true,
    deleteMany: true,
    count: true,
    aggregate: true,
    groupBy: true,
  } satisfies Record<ModelMethod, true>)
);

/** One delegate per model in the schema, named as the client names them: `Pet` is `prisma.pet`. */
const MODEL_DELEGATES = new Set<string | symbol>(
  Object.values(Prisma.ModelName).map((name) => name.charAt(0).toLowerCase() + name.slice(1))
);

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return createOfflineClient();

  // No fallback if building the pool or the client throws. There used to be
  // one, `new PrismaClient()` without an adapter, but Prisma 7 refuses that
  // ("requires a driver adapter"), so it only hid the real error behind its own.
  // A database that is configured and cannot be built must fail loudly, not
  // quietly serve fixtures.
  const sslPolicy = resolveDatabaseSsl(connectionString);

  // A managed Postgres like Neon can take several seconds to wake from idle,
  // so the connect timeout is generous; `DB_CONNECT_TIMEOUT_MS` overrides it.
  // An empty or non-numeric value falls back to 10 s; `Number("")` would be 0,
  // which `pg` reads as no timeout at all. An explicit 0 is kept: that is how an
  // operator turns the timeout off.
  const configuredTimeout = process.env.DB_CONNECT_TIMEOUT_MS?.trim();
  const connectionTimeoutMillis =
    configuredTimeout && Number.isFinite(Number(configuredTimeout)) ? Number(configuredTimeout) : 10000;

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
