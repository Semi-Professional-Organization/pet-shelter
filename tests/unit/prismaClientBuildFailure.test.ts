import { describe, expect, it, vi } from "vitest";

/**
 * With `DATABASE_URL` set, a client that cannot be built fails the import with
 * the reason it could not be built. `src/lib/server/prisma.ts` used to fall back
 * to `new PrismaClient()` without a driver adapter, which Prisma 7 refuses, so
 * every importer crashed with "requires a driver adapter" instead of the cause.
 *
 * A file of its own because the import fails: a module that threw while loading
 * must not be what the offline client's tests import next.
 */
describe("a configured Prisma client that cannot be built", () => {
  it("fails the import with the reason, not with Prisma's missing-adapter error", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://shelter@db.internal:5432/shelter");
    vi.doMock("pg", () => ({
      Pool: class {
        constructor() {
          throw new Error("the pool refused its configuration");
        }
      },
    }));

    await expect(import("@/lib/server/prisma")).rejects.toThrow("the pool refused its configuration");
  });
});
