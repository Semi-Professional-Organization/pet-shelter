import { beforeEach, describe, expect, it, vi } from "vitest";
import { senFromRinggit } from "@/lib/domain/money";

const doubles = vi.hoisted(() => ({
  create: vi.fn(),
  findPet: vi.fn(),
  findSponsor: vi.fn(),
  findSponsorship: vi.fn(),
  updateMany: vi.fn(),
}));

const donationDoubles = vi.hoisted(() => {
  class ReceiptIssuanceError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ReceiptIssuanceError";
    }
  }

  return {
    ReceiptIssuanceError,
    withReceiptTransaction: vi.fn(),
  };
});

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    petSponsorship: {
      create: doubles.create,
      findUnique: doubles.findSponsorship,
      updateMany: doubles.updateMany,
    },
    pet: { findUnique: doubles.findPet },
    sponsor: { findUnique: doubles.findSponsor },
  },
}));

vi.mock("@/lib/server/donationLedger", () => ({
  ReceiptIssuanceError: donationDoubles.ReceiptIssuanceError,
  drawAndInsert: vi.fn(),
  isLedgerPersistent: vi.fn(() => true),
  issueReceiptInMemory: vi.fn(),
  resetDonationLedger: vi.fn(),
  withReceiptTransaction: donationDoubles.withReceiptTransaction,
}));

const draft = {
  petId: "pet-live",
  petName: "Milo",
  sponsorName: "Aisyah Rahman",
  sponsorEmail: "aisyah@example.com",
  userId: "sponsor-deleted",
  displayOnWall: true,
  tierId: "vaccine",
  tierName: "Core Vaccination & Deworming",
  frequency: "one_time" as const,
  amountSen: senFromRinggit(50),
  paymentMethod: "duitnow_qr" as const,
  pledgeRef: "HFS-PLG-RECOVERY",
};

const storedRow = {
  id: "pledge-1",
  ...draft,
  userId: null,
  status: "PENDING_PAYMENT",
  receiptNumber: null,
  sponsorPhone: null,
  taxIdOrIc: null,
  notes: null,
  createdAt: new Date("2026-09-14T12:00:00.000Z"),
};

const ISSUER = {
  taxDeductibleRef: "TEST-TAX-REFERENCE",
  shelterRegistrationNo: "TEST-REGISTRATION",
};

function foreignKeyViolation(): Error & { code: string } {
  return Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
}

describe("persistent sponsorship write recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doubles.findSponsorship.mockReset();
    doubles.updateMany.mockReset().mockResolvedValue({ count: 0 });
    donationDoubles.withReceiptTransaction.mockReset();
  });

  it("rejects a non-string pledge filter before Prisma sees it", async () => {
    const { cancelSponsorshipForUser } = await import("@/lib/server/sponsorshipLedger");

    await expect(
      cancelSponsorshipForUser("spn-test-01", { not: "" } as unknown as string)
    ).rejects.toThrow(new TypeError("pledgeRef must be a string"));

    expect(doubles.updateMany).not.toHaveBeenCalled();
  });

  it("drops only a sponsor link deleted between identity lookup and insert", async () => {
    doubles.create.mockRejectedValueOnce(foreignKeyViolation()).mockResolvedValueOnce(storedRow);
    doubles.findPet.mockResolvedValueOnce({ id: draft.petId });
    doubles.findSponsor.mockResolvedValueOnce(null);

    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");
    const record = await recordSponsorshipPledge(draft);

    expect(doubles.create).toHaveBeenCalledTimes(2);
    expect(doubles.create.mock.calls[1][0].data).toMatchObject({
      petId: draft.petId,
      userId: null,
    });
    expect(record.petId).toBe(draft.petId);
    expect(record.userId).toBeNull();
  });

  it("wraps a second foreign-key race in the ledger's declared error", async () => {
    doubles.create.mockRejectedValueOnce(foreignKeyViolation()).mockRejectedValueOnce(
      foreignKeyViolation()
    );
    doubles.findPet.mockResolvedValueOnce({ id: draft.petId });
    doubles.findSponsor.mockResolvedValueOnce(null);

    const { recordSponsorshipPledge, SponsorshipWriteError } = await import(
      "@/lib/server/sponsorshipLedger"
    );

    await expect(recordSponsorshipPledge(draft)).rejects.toBeInstanceOf(SponsorshipWriteError);
  });

  it("classifies a different actor's committed receipt as a lost race", async () => {
    const uncertainty = new donationDoubles.ReceiptIssuanceError("receipt outcome unknown");
    donationDoubles.withReceiptTransaction.mockRejectedValueOnce(uncertainty);
    doubles.findSponsorship.mockResolvedValueOnce({
      receiptNumber: "HFS-DON-202609-0042",
      reconciledBy: "other-coordinator@example.com",
    });
    const { settleSponsorship } = await import("@/lib/server/sponsorshipLedger");

    await expect(
      settleSponsorship(draft.pledgeRef, ISSUER, "current-coordinator@example.com")
    ).resolves.toEqual({
      status: "already_reconciled",
      receiptNumber: "HFS-DON-202609-0042",
    });
  });

  it("keeps a same-actor committed receipt uncertain without an operation id", async () => {
    const uncertainty = new donationDoubles.ReceiptIssuanceError("receipt outcome unknown");
    donationDoubles.withReceiptTransaction.mockRejectedValueOnce(uncertainty);
    doubles.findSponsorship.mockResolvedValueOnce({
      receiptNumber: "HFS-DON-202609-0042",
      reconciledBy: "current-coordinator@example.com",
    });
    const { settleSponsorship } = await import("@/lib/server/sponsorshipLedger");

    await expect(
      settleSponsorship(draft.pledgeRef, ISSUER, "current-coordinator@example.com")
    ).rejects.toBe(uncertainty);
  });

  it("keeps a failed receipt transaction uncertain when no receipt committed", async () => {
    const uncertainty = new donationDoubles.ReceiptIssuanceError("receipt outcome unknown");
    donationDoubles.withReceiptTransaction.mockRejectedValueOnce(uncertainty);
    doubles.findSponsorship.mockResolvedValueOnce({ receiptNumber: null, reconciledBy: null });
    const { settleSponsorship } = await import("@/lib/server/sponsorshipLedger");

    await expect(
      settleSponsorship(draft.pledgeRef, ISSUER, "current-coordinator@example.com")
    ).rejects.toBe(uncertainty);
  });

  it("preserves the original uncertainty when the recovery read also fails", async () => {
    const uncertainty = new donationDoubles.ReceiptIssuanceError("receipt outcome unknown");
    donationDoubles.withReceiptTransaction.mockRejectedValueOnce(uncertainty);
    doubles.findSponsorship.mockRejectedValueOnce(new Error("database still unavailable"));
    const { settleSponsorship } = await import("@/lib/server/sponsorshipLedger");

    await expect(
      settleSponsorship(draft.pledgeRef, ISSUER, "current-coordinator@example.com")
    ).rejects.toBe(uncertainty);
  });
});

/**
 * The reference collision, and its composition with the foreign-key recovery.
 *
 * `COLLISION` is the `code` and `meta` of a real duplicate insert into
 * `pet_sponsorships`, captured against PostgreSQL 18 on 2026-10-13 and re-observed
 * in `tests/integration/db/uniqueViolation.postgres.test.ts`. The memory branch of
 * `recordSponsorshipPledge` returns before any of this, so without these cases the
 * retry would be covered only by the tier that needs a server.
 */
describe("a colliding sponsorship pledge reference", () => {
  const COLLISION = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: {
      modelName: "PetSponsorship",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage:
            'duplicate key value violates unique constraint "pet_sponsorships_pledgeRef_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ['"pledgeRef"'] },
        },
      },
    },
  });
  const FOREIGN_KEY = Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
  const echo = async (args: { data: Record<string, unknown> }) => ({ ...storedRow, ...args.data });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    doubles.findPet.mockResolvedValue({ id: "pet-live" });
    doubles.findSponsor.mockResolvedValue({ id: "sponsor-deleted" });
  });

  it("is redrawn once and the commitment kept", async () => {
    doubles.create.mockRejectedValueOnce(COLLISION).mockImplementationOnce(echo);
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");

    const record = await recordSponsorshipPledge(draft);

    expect(doubles.create).toHaveBeenCalledTimes(2);
    expect(record.pledgeRef).not.toBe(draft.pledgeRef);
    expect(record.pledgeRef).toMatch(/^HFS-PLG-\d{8}-\d{6}$/);
    // Only the reference changed; the relations were not touched on the way.
    expect(record.petId).toBe(draft.petId);
  });

  it("propagates a second collision rather than looping", async () => {
    doubles.create.mockRejectedValue(COLLISION);
    const { recordSponsorshipPledge, SponsorshipWriteError } = await import(
      "@/lib/server/sponsorshipLedger"
    );

    const attempt = recordSponsorshipPledge(draft);
    await expect(attempt).rejects.toBeInstanceOf(SponsorshipWriteError);
    // Named, so a log can tell a double collision from any other failed write.
    await expect(attempt).rejects.toThrow(/after a reference collision/);
    expect(doubles.create).toHaveBeenCalledTimes(2);
  });

  it("can be followed by the foreign-key recovery", async () => {
    // The two recoveries used to be separate branches that each ended in a throw,
    // so a pledge needing both was lost whichever error Postgres raised first.
    doubles.findSponsor.mockResolvedValue(null);
    doubles.create
      .mockRejectedValueOnce(COLLISION)
      .mockRejectedValueOnce(FOREIGN_KEY)
      .mockImplementationOnce(echo);
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");

    const record = await recordSponsorshipPledge(draft);

    expect(doubles.create).toHaveBeenCalledTimes(3);
    expect(record.pledgeRef).not.toBe(draft.pledgeRef);
    expect(record.userId).toBeNull();
    expect(record.petId).toBe(draft.petId);
  });

  it("can follow the foreign-key recovery", async () => {
    doubles.findSponsor.mockResolvedValue(null);
    doubles.create
      .mockRejectedValueOnce(FOREIGN_KEY)
      .mockRejectedValueOnce(COLLISION)
      .mockImplementationOnce(echo);
    const { recordSponsorshipPledge } = await import("@/lib/server/sponsorshipLedger");

    const record = await recordSponsorshipPledge(draft);

    expect(doubles.create).toHaveBeenCalledTimes(3);
    expect(record.pledgeRef).not.toBe(draft.pledgeRef);
    expect(record.userId).toBeNull();
  });
});
