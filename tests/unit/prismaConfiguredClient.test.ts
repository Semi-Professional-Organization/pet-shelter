import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The client `src/lib/server/prisma.ts` builds when `DATABASE_URL` is set. `pg`'s
 * `Pool` is replaced by one that records its options and then refuses, so nothing
 * here connects: the import fails at the pool, after the options are fixed.
 *
 * A file of its own because those imports fail: a module that threw while loading
 * must not be what the offline client's tests import next.
 */
const poolOptions = vi.hoisted(() => [] as Array<Record<string, unknown>>);

beforeEach(() => {
  poolOptions.length = 0;
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://shelter@db.internal:5432/shelter");
  vi.doMock("pg", () => ({
    Pool: class {
      constructor(options: Record<string, unknown>) {
        poolOptions.push(options);
        throw new Error("the pool refused its configuration");
      }
    },
  }));
});

describe("a configured Prisma client", () => {
  it("fails the import with the reason it could not be built, not Prisma's missing-adapter error", async () => {
    // `createPrismaClient` used to fall back to `new PrismaClient()` without a driver
    // adapter, which Prisma 7 refuses, so every importer crashed with "requires a
    // driver adapter" instead of the cause.
    await expect(import("@/lib/server/prisma")).rejects.toThrow("the pool refused its configuration");
  });

  it("keeps the 10 s connect timeout when DB_CONNECT_TIMEOUT_MS is set but empty", async () => {
    // `Number("")` is 0, and `pg` reads a 0 timeout as none: a blackholed database
    // would hang every query instead of failing over to the fixtures.
    vi.stubEnv("DB_CONNECT_TIMEOUT_MS", "");

    await expect(import("@/lib/server/prisma")).rejects.toThrow();
    expect(poolOptions[0]).toMatchObject({ connectionTimeoutMillis: 10000 });
  });

  it("takes DB_CONNECT_TIMEOUT_MS when it is a number", async () => {
    vi.stubEnv("DB_CONNECT_TIMEOUT_MS", "2500");

    await expect(import("@/lib/server/prisma")).rejects.toThrow();
    expect(poolOptions[0]).toMatchObject({ connectionTimeoutMillis: 2500 });
  });
});
