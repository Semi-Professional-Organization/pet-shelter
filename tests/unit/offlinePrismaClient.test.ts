import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * With no `DATABASE_URL`, `src/lib/server/prisma.ts` hands out a client that
 * refuses every query and never opens a socket. It used to connect to a
 * hardcoded `localhost:5432`, so a unit run wrote fixture rows into whatever
 * Postgres happened to be listening there, and authorization results flipped
 * with it (`tasks/decisions/2026-10-20-no-database-url-means-no-database.md`).
 *
 * `tests/setup/hermeticEnv.ts` removes `DATABASE_URL` before this file loads,
 * so the import below gets the offline client.
 */
describe("the Prisma client with no DATABASE_URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a query with P1001, the code the fallbacks read as 'database down'", async () => {
    const { prisma, DatabaseNotConfiguredError } = await import("@/lib/server/prisma");

    const query = prisma.pet.findMany();

    await expect(query).rejects.toBeInstanceOf(DatabaseNotConfiguredError);
    await expect(query).rejects.toMatchObject({ code: "P1001" });
  });

  it("opens no socket at all", async () => {
    const connect = vi.spyOn(net.Socket.prototype, "connect");
    const { prisma } = await import("@/lib/server/prisma");

    await expect(prisma.user.findUnique({ where: { id: "usr-admin-01" } })).rejects.toThrow();
    await expect(prisma.$queryRaw`SELECT 1`).rejects.toThrow();

    expect(connect).not.toHaveBeenCalled();
  });

  it("does not reject a query nobody awaits, as Prisma's own lazy queries do not", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { prisma } = await import("@/lib/server/prisma");

      // Built for a batched transaction and never awaited on its own.
      const batched = [prisma.pet.update({ where: { id: "x" }, data: {} })];
      await expect(prisma.$transaction(batched)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("hands out a client and model delegates that are not thenables, as the real ones are not", async () => {
    const { prisma } = await import("@/lib/server/prisma");

    // Awaiting a thenable that never settles would hang the caller for good.
    expect((prisma as unknown as { then?: unknown }).then).toBeUndefined();
    expect((prisma.pet as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(prisma.pet)).resolves.toBe(prisma.pet);
  });

  it("answers only the names the real client has, and behaves as a plain object otherwise", async () => {
    const { prisma } = await import("@/lib/server/prisma");
    const client = prisma as unknown as Record<string, unknown>;
    const pet = prisma.pet as unknown as Record<string, unknown>;

    expect(client.notAModel).toBeUndefined();
    expect(pet.notAQuery).toBeUndefined();
    // A test matcher treats any object with a function `asymmetricMatch` as a matcher.
    expect(pet.asymmetricMatch).toBeUndefined();
    expect(String(prisma.pet)).toBe("[object Object]");
    expect(JSON.stringify(prisma.pet)).toBe("{}");
  });

  it("disconnects cleanly, so teardown that always disconnects still works", async () => {
    const { disconnectPrisma } = await import("@/lib/server/prisma");

    await expect(disconnectPrisma()).resolves.toBeUndefined();
  });
});
