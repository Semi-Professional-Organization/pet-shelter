import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sealSponsorSession,
  SPONSOR_SESSION_COOKIE_NAME,
} from "@/lib/security/sponsorSession";
import { mockCookieStore } from "../setup/nextMocks";

const ledgerMocks = vi.hoisted(() => ({
  recordSponsorshipPledge: vi.fn(),
  listPendingSponsorships: vi.fn(),
  rejectPendingSponsorship: vi.fn(),
  settleSponsorship: vi.fn(),
  summarizeSponsorshipsForPet: vi.fn(),
  listSponsorshipsByUserId: vi.fn(),
  resetSponsorshipLedger: vi.fn(),
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
    ...ledgerMocks,
  };
});

vi.mock("@/lib/server/donationLedger", () => ({
  ReceiptIssuanceError: class ReceiptIssuanceError extends Error {},
  isLedgerPersistent: vi.fn(() => false),
  resetDonationLedger: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendSponsorshipWelcomeEmail: vi.fn(),
  sendDonationReceiptEmail: vi.fn(),
}));

vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/server/petRepository", () => ({
  findPetForWriteAsync: vi.fn(async (id: string) => ({ id, name: "Bella" })),
  resetPets: vi.fn(),
}));

describe("createPetSponsorshipAction write-failure copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not deny a possible transfer when the pledge write fails", async () => {
    const { SponsorshipWriteError } =
      await import("@/lib/server/sponsorshipLedger");
    ledgerMocks.recordSponsorshipPledge.mockRejectedValueOnce(
      new SponsorshipWriteError("database write failed"),
    );

    // Dynamic by contract: the repository mock must exist before this Server
    // Action instantiates its imports, or a real Prisma client can leak in.
    const { createPetSponsorshipAction } =
      await import("@/actions/sponsorships");
    const result = await createPetSponsorshipAction({
      petId: "pet-bella",
      petName: "Bella",
      sponsorName: "Aisyah Rahman",
      sponsorEmail: "aisyah@example.com",
      tierId: "vaccine",
      amountMYR: 50,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
    });

    expect(ledgerMocks.recordSponsorshipPledge).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/could not confirm that a pledge was recorded/i);
    expect(result.error).toMatch(/contact the shelter/i);
    expect(result.error).toMatch(/bank reference/i);
    expect(result.error).toMatch(/before (?:trying|you try|retrying) again/i);
    expect(result.error).not.toMatch(/nothing has been charged/i);
    expect(result.error).not.toMatch(/no pledge was recorded/i);
  });

  it("does not downgrade an unavailable live-account lookup into an unlinked guest write", async () => {
    mockCookieStore.seed(
      SPONSOR_SESSION_COOKIE_NAME,
      sealSponsorSession({
        sponsorId: "spn-bronze-01",
        email: "bronze@example.com",
        name: "Nurul Aisyah",
      })
    );
    const sponsorRepository = await import("@/lib/server/sponsorRepository");
    const lookup = vi
      .spyOn(sponsorRepository, "findSponsorById")
      .mockRejectedValueOnce(new Error("repository unavailable"));

    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");
    const result = await createPetSponsorshipAction({
      petId: "pet-bella",
      petName: "Bella",
      sponsorName: "Nurul Aisyah",
      sponsorEmail: "bronze@example.com",
      tierId: "vaccine",
      amountMYR: 50,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
    });

    expect(ledgerMocks.recordSponsorshipPledge).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    // The lookup runs before any write, so nothing was recorded and the copy may say so — while
    // still not denying a transfer the supporter may already have sent.
    expect(result.error).toMatch(/no pledge was recorded/i);
    expect(result.error).toMatch(/bank reference/i);

    lookup.mockRestore();
  });
});
