import { beforeEach, describe, expect, it, vi } from "vitest";

type DeferredWork = () => Promise<unknown>;

const doubles = vi.hoisted(() => ({
  // Explicit test doubles for the two durable-write boundaries.
  recordSponsorshipPledge: vi.fn(),
  recordDonationPledge: vi.fn(),
  // Explicit test doubles for the external email boundary.
  sendSponsorshipWelcomeEmail: vi.fn(),
  sendDonationPledgeEmail: vi.fn(),
  // This spy captures lifecycle-owned work without running it during the action.
  scheduleAfterResponse: vi.fn(),
  scheduledWork: [] as DeferredWork[],
}));

vi.mock("@/lib/server/sponsorshipLedger", () => {
  class SponsorshipWriteError extends Error {
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
      super(message);
      this.name = "SponsorshipWriteError";
      this.cause = cause;
    }
  }

  return {
    SponsorshipWriteError,
    recordSponsorshipPledge: doubles.recordSponsorshipPledge,
    listPendingSponsorships: vi.fn(),
    rejectPendingSponsorship: vi.fn(),
    settleSponsorship: vi.fn(),
    summarizeSponsorshipsForPet: vi.fn(),
    listSponsorshipsByUserId: vi.fn(),
    reconcileSponsorship: vi.fn(),
    memorySponsorshipCount: vi.fn(() => 0),
    resetSponsorshipLedger: vi.fn(),
  };
});

vi.mock("@/lib/server/donationLedger", () => {
  class ReceiptIssuanceError extends Error {
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
      super(message);
      this.name = "ReceiptIssuanceError";
      this.cause = cause;
    }
  }

  return {
    ReceiptIssuanceError,
    listDonationsOrThrow: vi.fn(),
    isLedgerPersistent: vi.fn(() => false),
    formatReceiptNumber: vi.fn(),
    receiptScopeFor: vi.fn(),
    resetDonationLedger: vi.fn(),
  };
});

/**
 * The donation form's durable-write boundary moved on 2026-09-22.
 *
 * It used to be `issueDonationReceipt` — the form allocated an official
 * `HFS-DON-*` receipt on submission, from a supporter's word that they had paid.
 * It is now `recordDonationPledge`, which writes a `PENDING_PAYMENT` row and no
 * receipt number at all. The lifecycle contract this file guards is unchanged:
 * nothing observable leaves the system until that write is confirmed.
 */
vi.mock("@/lib/server/donationPledgeLedger", () => {
  class DonationPledgeWriteError extends Error {
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
      super(message);
      this.name = "DonationPledgeWriteError";
      this.cause = cause;
    }
  }

  return {
    DonationPledgeWriteError,
    recordDonationPledge: doubles.recordDonationPledge,
    settleDonationPledge: vi.fn(),
    rejectPendingDonationPledge: vi.fn(),
    listPendingDonationPledges: vi.fn(),
    findDonationPledgeByRef: vi.fn(),
    memoryDonationPledgeCount: vi.fn(() => 0),
    // Required: the global harness calls this in its own `beforeEach`.
    resetDonationPledgeLedger: vi.fn(),
  };
});

vi.mock("@/lib/email", () => ({
  sendSponsorshipWelcomeEmail: doubles.sendSponsorshipWelcomeEmail,
  sendDonationPledgeEmail: doubles.sendDonationPledgeEmail,
  sendDonationReceiptEmail: vi.fn(),
}));

vi.mock("@/lib/scheduleAfterResponse", () => ({
  scheduleAfterResponse: doubles.scheduleAfterResponse,
}));

vi.mock("@/lib/security/sponsorSession", () => ({
  getCurrentSponsorSession: vi.fn(async () => null),
}));

vi.mock("@/lib/server/petRepository", () => ({
  findServerPetByIdAsync: vi.fn(async (id: string) => ({
    id,
    name: "Submitted Bella",
  })),
  resetPets: vi.fn(),
}));

const sponsorshipInput = {
  petId: "pet-bella",
  petName: "Submitted Bella",
  sponsorName: "Submitted Sponsor",
  sponsorEmail: "submitted@example.com",
  tierId: "vaccine" as const,
  amountMYR: 50,
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
};

const persistedSponsorship = {
  id: "spn-persisted-1",
  petId: "pet-bella",
  petName: "Persisted Bella",
  sponsorName: "Persisted Sponsor",
  sponsorEmail: "persisted@example.com",
  userId: null,
  displayOnWall: false,
  tierId: "vaccine",
  tierName: "Persisted Vaccination Tier",
  frequency: "one_time" as const,
  amountSen: 12_345,
  paymentMethod: "duitnow_qr" as const,
  status: "PENDING_PAYMENT" as const,
  pledgeRef: "HFS-PLG-20260914-123456",
  receiptNumber: null,
  createdAt: "2026-09-14T12:00:00.000Z",
};

const donationInput = {
  donorName: "Submitted Donor",
  donorEmail: "submitted.donor@example.com",
  tierId: "kibble" as const,
  amountMYR: 30,
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
};

const persistedPledge = {
  id: "gift-persisted-1",
  donorName: "Persisted Donor",
  donorEmail: "persisted.donor@example.com",
  tierId: "kibble" as const,
  tierName: "Persisted Nutrition Tier",
  amountSen: 4_321,
  currency: "MYR",
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
  status: "PENDING_PAYMENT" as const,
  pledgeRef: "HFS-GFT-20260914-004242",
  receiptNumber: null,
  createdAt: "2026-09-14T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  doubles.scheduledWork.length = 0;
  doubles.scheduleAfterResponse.mockImplementation((work: DeferredWork) => {
    doubles.scheduledWork.push(work);
  });
  doubles.recordSponsorshipPledge.mockResolvedValue(persistedSponsorship);
  doubles.recordDonationPledge.mockResolvedValue(persistedPledge);
  doubles.sendSponsorshipWelcomeEmail.mockResolvedValue({ success: true });
  doubles.sendDonationPledgeEmail.mockResolvedValue({ success: true });
});

describe("contribution email lifecycle", () => {
  it("registers the persisted sponsorship DTO and dispatches it only through scheduled work", async () => {
    // Dynamic by harness contract: all repository mocks are registered before the
    // Server Action instantiates its imports.
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorshipInput);

    expect(result).toMatchObject({
      success: true,
      data: {
        pledgeRef: persistedSponsorship.pledgeRef,
        petName: persistedSponsorship.petName,
        sponsorName: persistedSponsorship.sponsorName,
        sponsorEmail: persistedSponsorship.sponsorEmail,
        tierName: persistedSponsorship.tierName,
        amountMYR: 123.45,
      },
    });
    expect(doubles.scheduleAfterResponse).toHaveBeenCalledTimes(1);
    expect(doubles.sendSponsorshipWelcomeEmail).not.toHaveBeenCalled();

    await doubles.scheduledWork[0]();

    expect(doubles.sendSponsorshipWelcomeEmail).toHaveBeenCalledOnce();
    expect(doubles.sendSponsorshipWelcomeEmail).toHaveBeenCalledWith(result.data);
  });

  it("registers the persisted pledge DTO and dispatches it only through scheduled work", async () => {
    const { submitDonationPledgeAction } = await import("@/actions/donations");

    const result = await submitDonationPledgeAction(donationInput);

    expect(result).toMatchObject({
      success: true,
      data: {
        pledgeRef: persistedPledge.pledgeRef,
        donorName: persistedPledge.donorName,
        donorEmail: persistedPledge.donorEmail,
        tierName: persistedPledge.tierName,
        amountMYR: 43.21,
        status: "PENDING_PAYMENT",
      },
    });
    // The acknowledgement carries no receipt number, because none was drawn.
    expect(result.data).not.toHaveProperty("receiptNumber");
    expect(doubles.scheduleAfterResponse).toHaveBeenCalledTimes(1);
    expect(doubles.sendDonationPledgeEmail).not.toHaveBeenCalled();

    await doubles.scheduledWork[0]();

    expect(doubles.sendDonationPledgeEmail).toHaveBeenCalledOnce();
    expect(doubles.sendDonationPledgeEmail).toHaveBeenCalledWith(result.data);
  });

  it("does not register sponsorship email work when persistence fails", async () => {
    const { SponsorshipWriteError } = await import("@/lib/server/sponsorshipLedger");
    doubles.recordSponsorshipPledge.mockRejectedValueOnce(
      new SponsorshipWriteError("database did not confirm the pledge")
    );
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorshipInput);

    expect(result.success).toBe(false);
    expect(doubles.scheduleAfterResponse).not.toHaveBeenCalled();
    expect(doubles.sendSponsorshipWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does not register donation email work when persistence fails", async () => {
    const { DonationPledgeWriteError } = await import(
      "@/lib/server/donationPledgeLedger"
    );
    doubles.recordDonationPledge.mockRejectedValueOnce(
      new DonationPledgeWriteError("database did not confirm the pledge")
    );
    const { submitDonationPledgeAction } = await import("@/actions/donations");

    const result = await submitDonationPledgeAction(donationInput);

    expect(result.success).toBe(false);
    expect(doubles.scheduleAfterResponse).not.toHaveBeenCalled();
    expect(doubles.sendDonationPledgeEmail).not.toHaveBeenCalled();
  });

  it("keeps a successful sponsorship result settled when deferred email rejects", async () => {
    doubles.sendSponsorshipWelcomeEmail.mockRejectedValueOnce(new Error("mailer unavailable"));
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorshipInput);
    expect(result.success).toBe(true);

    await expect(doubles.scheduledWork[0]()).rejects.toThrow("mailer unavailable");
    expect(result).toMatchObject({
      success: true,
      data: { pledgeRef: persistedSponsorship.pledgeRef },
    });
  });

  it("keeps a successful donation result settled when deferred email rejects", async () => {
    doubles.sendDonationPledgeEmail.mockRejectedValueOnce(new Error("mailer unavailable"));
    const { submitDonationPledgeAction } = await import("@/actions/donations");

    const result = await submitDonationPledgeAction(donationInput);
    expect(result.success).toBe(true);

    await expect(doubles.scheduledWork[0]()).rejects.toThrow("mailer unavailable");
    expect(result).toMatchObject({
      success: true,
      data: { pledgeRef: persistedPledge.pledgeRef },
    });
  });
});
