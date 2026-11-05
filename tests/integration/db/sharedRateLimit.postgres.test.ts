import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import { checkSharedRateLimit } from "@/lib/security/sharedRateLimit";
import { requireDatabaseUrl, assertDatabaseReachable } from "./support/database";

/**
 * The shared registration limiter, against a real server (#213).
 *
 * What only Postgres can show: that the upsert is atomic, so callers racing
 * from separate connections (standing in for separate serverless instances)
 * cannot all read "under budget", and that the window resets from the row's own
 * `expiresAt`, not from any instance's clock.
 */

const PROBE_PREFIX = "probe-2999:";
const probeKey = () => `${PROBE_PREFIX}${randomUUID()}`;
const hashed = (key: string) => createHash("sha256").update(key).digest("hex");
const probeKeys: string[] = [];

function key(): string {
  const k = probeKey();
  probeKeys.push(hashed(k));
  return k;
}

describe("checkSharedRateLimit against Postgres", () => {
  beforeAll(async () => {
    requireDatabaseUrl();
    await assertDatabaseReachable();
  });

  afterEach(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: probeKeys } } });
    probeKeys.length = 0;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it("admits exactly `limit` of 25 concurrent hits on one key", async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 25 }, () => checkSharedRateLimit(k, 10, 60_000)));

    expect(results.filter((r) => r.success)).toHaveLength(10);
    expect(results.filter((r) => !r.success && !r.unavailable)).toHaveLength(15);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key: hashed(k) } });
    // Capped at limit + 1, so a flood cannot run the counter up.
    expect(row?.count).toBe(11);
  });

  it("stores a digest, never the key it was given", async () => {
    const k = key();
    await checkSharedRateLimit(k, 5, 60_000);
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "rate_limit_buckets" WHERE "key" LIKE ${PROBE_PREFIX + "%"}`;
    expect(rows[0].n).toBe(0);
  });

  it("tells a refused caller how long the window has left", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) await checkSharedRateLimit(k, 3, 60_000);
    const refused = await checkSharedRateLimit(k, 3, 60_000);

    expect(refused.success).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(50);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window once the row's window has ended", async () => {
    const k = key();
    for (let i = 0; i < 4; i++) await checkSharedRateLimit(k, 3, 60_000);
    expect((await checkSharedRateLimit(k, 3, 60_000)).success).toBe(false);

    // Age the row past its window rather than sleep a minute.
    await prisma.$executeRaw`
      UPDATE "rate_limit_buckets" SET "expiresAt" = now() - interval '1 second' WHERE "key" = ${hashed(k)}`;

    const fresh = await checkSharedRateLimit(k, 3, 60_000);
    expect(fresh).toEqual({ success: true, remaining: 2, retryAfterSeconds: 0 });
  });
});
