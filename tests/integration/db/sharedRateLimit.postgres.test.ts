import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import { checkSharedRateLimit, rateLimitKeyDigest } from "@/lib/security/sharedRateLimit";
import { spendRateLimitBucket, sweepExpiredRateLimitBuckets } from "@/lib/server/rateLimitBuckets";
import { requireDatabaseUrl, assertDatabaseReachable } from "./support/database";

/**
 * The shared registration limiter, against a real server (#213).
 *
 * What only Postgres can show: that the upsert is atomic, so callers racing
 * from separate connections (standing in for separate serverless instances)
 * cannot all read "under budget", and that the window resets from the row's own
 * `expiresAt`, not from any instance's clock.
 *
 * The race is run against `spendRateLimitBucket` directly so the counts each
 * caller was handed can be read back.
 */

const PROBE_PREFIX = "probe-2999:";
const probeKey = () => `${PROBE_PREFIX}${randomUUID()}`;
const hashed = rateLimitKeyDigest;
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

  it("hands 25 concurrent hits on one key the counts 1 to 10, then the cap", async () => {
    const k = key();
    const counts = await Promise.all(
      Array.from({ length: 25 }, () => spendRateLimitBucket(hashed(k), 60_000, 11).then((r) => r.count))
    );

    // Atomic: every count from 1 to 10 handed out exactly once, so exactly ten
    // callers read "under budget"; the rest are held at the cap.
    expect(counts.sort((a, b) => a - b)).toEqual([...Array.from({ length: 10 }, (_, i) => i + 1), ...Array(15).fill(11)]);
    const row = await prisma.rateLimitBucket.findUnique({ where: { key: hashed(k) } });
    expect(row?.count).toBe(11);
  });

  it("sweeps expired rows and only those", async () => {
    const spent = key();
    const live = key();
    await spendRateLimitBucket(hashed(spent), 60_000, 2);
    await spendRateLimitBucket(hashed(live), 60_000, 2);
    await prisma.$executeRaw`
      UPDATE "rate_limit_buckets" SET "expiresAt" = now() - interval '1 second' WHERE "key" = ${hashed(spent)}`;

    await sweepExpiredRateLimitBuckets();

    expect(await prisma.rateLimitBucket.findUnique({ where: { key: hashed(spent) } })).toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: hashed(live) } })).not.toBeNull();
  });

  it("refuses a second instance once the first has spent the budget", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) expect((await checkSharedRateLimit(k, 3, 60_000)).success).toBe(true);
    const elsewhere = await checkSharedRateLimit(k, 3, 60_000);
    expect(elsewhere).toMatchObject({ success: false, remaining: 0 });
    expect(elsewhere).not.toHaveProperty("unavailable");
  });

  it("stores the keyed digest, never the key it was given", async () => {
    const k = key();
    await checkSharedRateLimit(k, 5, 60_000);

    expect(await prisma.rateLimitBucket.findUnique({ where: { key: hashed(k) } })).toMatchObject({ count: 1 });
    const raw = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "rate_limit_buckets" WHERE "key" LIKE ${PROBE_PREFIX + "%"}`;
    expect(raw[0].n).toBe(0);
  });

  it("accepts a window that is not a whole number of milliseconds or fits no int4", async () => {
    await expect(spendRateLimitBucket(hashed(key()), 1.5, 2)).resolves.toMatchObject({ count: 1 });
    await expect(spendRateLimitBucket(hashed(key()), 3_000_000_000, 2)).resolves.toMatchObject({ count: 1 });
  });

  it("tells a refused caller how long the window has left", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) await checkSharedRateLimit(k, 3, 60_000);
    const refused = await checkSharedRateLimit(k, 3, 60_000);

    expect(refused.success).toBe(false);
    const retry = "retryAfterSeconds" in refused ? refused.retryAfterSeconds : NaN;
    expect(retry).toBeGreaterThan(50);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window once the row's window has ended", async () => {
    const k = key();
    for (let i = 0; i < 4; i++) await spendRateLimitBucket(hashed(k), 60_000, 4);
    expect((await checkSharedRateLimit(k, 3, 60_000)).success).toBe(false);

    // Age the row past its window rather than sleep a minute.
    await prisma.$executeRaw`
      UPDATE "rate_limit_buckets" SET "expiresAt" = now() - interval '1 second' WHERE "key" = ${hashed(k)}`;
    const fresh = await checkSharedRateLimit(k, 3, 60_000);
    expect(fresh).toEqual({ success: true, remaining: 2, retryAfterSeconds: 0 });
  });
});
