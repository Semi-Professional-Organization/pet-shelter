import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * What `listPendingSponsorships` hands back, in both of its branches: never the
 * supporter's tax identifier.
 *
 * `tests/integration/db/sponsorshipLedger.postgres.test.ts` runs the Prisma branch
 * against a real server, but only where one exists — CI's Postgres job, or
 * `embedded-postgres` locally. This file is the signal `npm test` gives without one.
 * For the Prisma branch, `DATABASE_URL` is stubbed to an unreachable dummy so
 * `isLedgerPersistent()` takes it, and `@/lib/server/prisma` is doubled so nothing
 * dials it. **Never the real `.env.local` value**: that is the production branch
 * (`.claude/templates/triage-rules.md` §1).
 *
 * The double honours `select` the way Prisma does — the selected columns, or every
 * column when there is no `select`. A double that returned a fixed row whatever it was
 * asked would make the tax-identifier assertion pass for any query, an experiment whose
 * input equals its control.
 *
 * Its own file because `vi.mock` is file-scoped: a double that knows only
 * `petSponsorship` breaks any neighbouring test that reaches another model. It did
 * exactly that when first added to a reconciliation suite, where `recordAuditLog`
 * calls `prisma.auditLog.create` unconditionally.
 */
const prismaMock = vi.hoisted(() => ({ petSponsorship: { findMany: vi.fn() } }));
vi.mock("@/lib/server/prisma", () => ({ prisma: prismaMock }));

import {
  findSponsorshipByPledgeRef,
  listPendingSponsorships,
  recordSponsorshipPledge,
} from "@/lib/server/sponsorshipLedger";
import { isLedgerPersistent } from "@/lib/server/donationLedger";
import { senFromInteger } from "@/lib/domain/money";

const TAX_ID = "880101-14-5523";

/** Every column the table holds for a pending pledge, the tax identifier included. */
const STORED: Record<string, unknown> = {
  id: "spn-db-001",
  petId: "pet-db-001",
  petName: "Kopi",
  sponsorName: "Tan Wei Ling",
  sponsorEmail: "weiling@example.com",
  sponsorPhone: null,
  userId: null,
  displayOnWall: false,
  tierId: "vaccine",
  tierName: "Core Vaccination & Deworming",
  frequency: "monthly",
  amountSen: 5000,
  paymentMethod: "duitnow_qr",
  status: "PENDING_PAYMENT",
  pledgeRef: "HFS-PLG-20260910-424242",
  receiptNumber: null,
  taxIdOrIc: TAX_ID,
  notes: null,
  createdAt: new Date("2026-09-10T01:30:00.000Z"),
  reconciledAt: null,
  reconciledBy: null,
};

function project(select?: Record<string, boolean>): Record<string, unknown> {
  if (!select) return { ...STORED };
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, wanted]) => wanted)
      .map(([column]) => [column, STORED[column]])
  );
}

describe("the Prisma branch of the pending read", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://never:never@127.0.0.1:1/never");
    prismaMock.petSponsorship.findMany.mockReset();
    prismaMock.petSponsorship.findMany.mockImplementation(
      async (args: { select?: Record<string, boolean> }) => [project(args.select)]
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks for pending rows oldest first, ties broken on id, bounded by take", async () => {
    expect(isLedgerPersistent()).toBe(true);

    const records = await listPendingSponsorships(25);

    const [args] = prismaMock.petSponsorship.findMany.mock.calls[0];
    expect(args).toMatchObject({
      where: { status: "PENDING_PAYMENT" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 25,
    });

    // And maps what the projection returns, including the Date -> ISO string
    // conversion the memory branch never exercises because it stores strings already.
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      pledgeRef: STORED.pledgeRef,
      amountSen: 5000,
      frequency: "monthly",
      status: "PENDING_PAYMENT",
      createdAt: "2026-09-10T01:30:00.000Z",
    });
  });

  it("never reads the supporter's tax identifier", async () => {
    const [record] = await listPendingSponsorships();

    // The row did come back; only the identifier is missing from it.
    expect(record.pledgeRef).toBe(STORED.pledgeRef);
    expect(record.taxIdOrIc).toBeUndefined();
  });
});

describe("the in-memory branch of the pending read", () => {
  it("returns the Prisma branch's shape, and stores no smuggled NRIC", async () => {
    expect(isLedgerPersistent()).toBe(false);

    // The draft type no longer accepts an NRIC (#239). A wider object can still
    // carry one past the type checker, so smuggle it in with `Object.assign`.
    await recordSponsorshipPledge(Object.assign({
      petId: null,
      petName: "Kopi",
      sponsorName: "Tan Wei Ling",
      sponsorEmail: "weiling@example.com",
      tierId: "vaccine",
      tierName: "Core Vaccination & Deworming",
      frequency: "monthly",
      amountSen: senFromInteger(5000),
      paymentMethod: "duitnow_qr",
      pledgeRef: "HFS-PLG-MEMORY-000001",
    } as const, { taxIdOrIc: TAX_ID }));
    // Not stored at all: the memory branch drops it, as the Postgres insert does.
    expect(await findSponsorshipByPledgeRef("HFS-PLG-MEMORY-000001")).toBeDefined();
    expect((await findSponsorshipByPledgeRef("HFS-PLG-MEMORY-000001"))?.taxIdOrIc).toBeUndefined();

    const [record] = await listPendingSponsorships();
    expect(record.pledgeRef).toBe("HFS-PLG-MEMORY-000001");
    expect(record.taxIdOrIc).toBeUndefined();
  });
});
