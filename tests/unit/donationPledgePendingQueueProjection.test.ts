import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The gift lane's twin of `sponsorshipPendingQueueProjection.test.ts`: the Prisma branch of
 * `listPendingDonationPledges` reads through an allow-list `select`.
 *
 * `DATABASE_URL` is stubbed to an unreachable dummy so `isLedgerPersistent()` takes the
 * Prisma branch, and `@/lib/server/prisma` is doubled so nothing dials it. **Never the real
 * `.env.local` value**: that is the production branch.
 */
const prismaMock = vi.hoisted(() => ({ donationPledge: { findMany: vi.fn() } }));
vi.mock("@/lib/server/prisma", () => ({ prisma: prismaMock }));

import { listPendingDonationPledges } from "@/lib/server/donationPledgeLedger";
import { isLedgerPersistent } from "@/lib/server/donationLedger";

describe("the Prisma branch of the pending gift read", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://never:never@127.0.0.1:1/never");
    prismaMock.donationPledge.findMany.mockReset();
    prismaMock.donationPledge.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads through an allow-list, so a column it does not name stays in Postgres", async () => {
    expect(isLedgerPersistent()).toBe(true);

    await listPendingDonationPledges(25);

    const [args] = prismaMock.donationPledge.findMany.mock.calls[0];
    expect(args.select).toBeDefined();
    expect(args.omit).toBeUndefined();
    // `reconciledBy` is a coordinator's address the queue has no use for.
    expect(args.select).not.toHaveProperty("reconciledBy");
  });
});
