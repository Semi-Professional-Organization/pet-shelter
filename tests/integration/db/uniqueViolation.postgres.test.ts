import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, disconnectPrisma } from "@/lib/server/prisma";
import { uniqueViolationOn } from "@/lib/server/uniqueViolation";
import { recordSponsorshipPledge } from "@/lib/server/sponsorshipLedger";
import { senFromInteger } from "@/lib/domain/money";
import {
  requireDatabaseUrl,
  assertDatabaseReachable,
  cleanProbeLedger,
  PROBE_INSTANT,
  PROBE_GIFT_PREFIX,
  PROBE_PLEDGE_PREFIX,
} from "./support/database";

/**
 * The unique-violation reader, against errors a real server raises.
 *
 * Three call sites reasoned about a P2002 from `meta.target`, which this client
 * never sets, and every unit test that covered them fabricated the error object —
 * so the suites were green while one retry never fired and another retried
 * everything. A hand-built error can only ever agree with the reading it was built
 * from. This file is where the shape is *observed*: if a Prisma or adapter upgrade
 * moves the columns again, it fails here rather than silently in production.
 */

const GIFT = {
  donorName: "Probe Donor",
  donorEmail: "probe.unique@example.test",
  tierId: "kibble",
  tierName: "Kibble Fund",
  amountSen: 5_000,
  paymentMethod: "online_banking",
};

const SPONSORSHIP = {
  petName: "Probe Pet",
  sponsorName: "Probe Sponsor",
  sponsorEmail: "probe.unique@example.test",
  tierId: "kibble",
  tierName: "Kibble Fund",
  amountSen: 5_000,
  paymentMethod: "online_banking",
};

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("expected the insert to be refused");
}

beforeAll(async () => {
  requireDatabaseUrl();
  await assertDatabaseReachable();
});

beforeEach(async () => {
  await cleanProbeLedger();
});

afterAll(async () => {
  await cleanProbeLedger();
  await disconnectPrisma();
});

describe("uniqueViolationOn reads the error PostgreSQL really raises", () => {
  it("names the pledge reference, and not the receipt number, on a gift", async () => {
    const pledgeRef = `${PROBE_GIFT_PREFIX}-U001`;
    await prisma.donationPledge.create({ data: { ...GIFT, pledgeRef } });

    const err = await caught(() => prisma.donationPledge.create({ data: { ...GIFT, pledgeRef } }));

    expect((err as { code?: string }).code).toBe("P2002");
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(true);
    // The guard that was dead code for two commits: it must tell these apart.
    expect(uniqueViolationOn(err, "receiptNumber")).toBe(false);
  });

  it("names the receipt number when that is the unique that was hit", async () => {
    const receiptNumber = "HFS-DON-2999-UNIQUE-PROBE";
    await prisma.donationPledge.create({
      data: { ...GIFT, pledgeRef: `${PROBE_GIFT_PREFIX}-U002`, receiptNumber },
    });

    const err = await caught(() =>
      prisma.donationPledge.create({
        data: { ...GIFT, pledgeRef: `${PROBE_GIFT_PREFIX}-U003`, receiptNumber },
      })
    );

    expect(uniqueViolationOn(err, "receiptNumber")).toBe(true);
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(false);
  });

  it("carries no meta.target on this client, which is why it is not read first", async () => {
    const pledgeRef = `${PROBE_GIFT_PREFIX}-U004`;
    await prisma.donationPledge.create({ data: { ...GIFT, pledgeRef } });
    const err = (await caught(() =>
      prisma.donationPledge.create({ data: { ...GIFT, pledgeRef } })
    )) as { meta?: Record<string, unknown> };

    // The premise of the whole module. If a future client starts populating
    // `target` again this fails, and the comment in `uniqueViolation.ts` that says
    // it is never set should be corrected rather than left to mislead.
    expect(err.meta?.target).toBeUndefined();
    expect(err.meta?.driverAdapterError).toBeDefined();
  });

  it("is false for an error that is not a unique violation", async () => {
    const err = await caught(() =>
      prisma.petSponsorship.create({
        data: { ...SPONSORSHIP, pledgeRef: `${PROBE_PLEDGE_PREFIX}-U005`, petId: "no-such-pet" },
      })
    );

    expect((err as { code?: string }).code).toBe("P2003");
    expect(uniqueViolationOn(err, "pledgeRef")).toBe(false);
  });
});

describe("a colliding sponsorship reference is redrawn, not lost", () => {
  it("keeps both commitments when two supporters draw the same reference", async () => {
    const pledgeRef = `${PROBE_PLEDGE_PREFIX}-U006`;
    const draft = {
      petId: null,
      petName: "Probe Pet",
      sponsorName: "Probe Sponsor",
      sponsorEmail: "probe.unique@example.test",
      tierId: "kibble",
      tierName: "Kibble Fund",
      frequency: "one_time" as const,
      amountSen: senFromInteger(5_000),
      paymentMethod: "online_banking" as const,
      pledgeRef,
    };

    const first = await recordSponsorshipPledge(draft, { now: PROBE_INSTANT });
    // Until 2026-10-13 this second call threw `SponsorshipWriteError`, and the
    // supporter was told the outcome was unconfirmed and not to try again.
    const second = await recordSponsorshipPledge(
      { ...draft, sponsorEmail: "second.sponsor@example.test" },
      { now: PROBE_INSTANT }
    );

    expect(first.pledgeRef).toBe(pledgeRef);
    expect(second.pledgeRef).not.toBe(pledgeRef);
    expect(second.pledgeRef).toMatch(/^HFS-PLG-\d{8}-\d{6}$/);
    expect(second.status).toBe("PENDING_PAYMENT");

    const rows = await prisma.petSponsorship.count({
      where: { pledgeRef: { in: [first.pledgeRef, second.pledgeRef] } },
    });
    expect(rows).toBe(2);
  });
});
