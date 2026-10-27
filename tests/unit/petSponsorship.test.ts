import { describe, it, expect } from "vitest";
import { senFromInteger, senFromRinggit } from "@/lib/domain/money";
import {
  DEFAULT_SPONSORSHIP_GOAL_SEN,
  MIN_SPONSORSHIP_SEN,
  SponsorshipAggregateRow,
  countsTowardFunding,
  emptySponsorshipSummary,
  generatePledgeRef,
  reconciliationNotice,
  shouldShowSocialProof,
  summarizePetSponsorships,
} from "@/lib/domain/petSponsorship";
import { petSponsorshipSchema, isPaymentMethodEnabled } from "@/lib/validations/sponsorship";
import {
  findSponsorshipByPledgeRef,
  recordSponsorshipPledge,
  reconcileSponsorship,
  settleSponsorship,
  summarizeSponsorshipsForPet,
} from "@/lib/server/sponsorshipLedger";
import {
  createPetSponsorshipAction,
  getPetSponsorshipSummaryAction,
} from "@/actions/sponsorships";
import { findDonationByReceiptNumber } from "@/lib/server/donationLedger";
import {
  sealSponsorSession,
  SPONSOR_SESSION_COOKIE_NAME,
} from "@/lib/security/sponsorSession";
import { mockCookieStore } from "../setup/nextMocks";

const rows = (...items: [string, number, string][]): SponsorshipAggregateRow[] =>
  items.map(([sponsorEmail, sen, status]) => ({
    sponsorEmail,
    amountSen: senFromInteger(sen),
    status: status as SponsorshipAggregateRow["status"],
  }));

describe("sponsorship summary: only reconciled money is funding", () => {
  it("ignores pending, cancelled and expired commitments", () => {
    const summary = summarizePetSponsorships(
      "pet-001",
      rows(
        ["a@example.com", 10000, "ACTIVE"],
        ["b@example.com", 50000, "PENDING_PAYMENT"],
        ["c@example.com", 50000, "CANCELLED"],
        ["d@example.com", 50000, "EXPIRED"]
      ),
      senFromInteger(100000)
    );

    expect(summary.supporterCount).toBe(1);
    expect(summary.fundedSen).toBe(10000);
    expect(summary.isFullyFunded).toBe(false);
  });

  it("counts distinct supporters, not distinct gifts", () => {
    const summary = summarizePetSponsorships(
      "pet-001",
      rows(
        ["repeat@example.com", 3000, "ACTIVE"],
        ["repeat@example.com", 3000, "ACTIVE"],
        ["REPEAT@Example.com ", 3000, "ACTIVE"],
        ["other@example.com", 3000, "ACTIVE"]
      ),
      senFromInteger(100000)
    );

    expect(summary.supporterCount).toBe(2);
    expect(summary.fundedSen).toBe(12000);
  });

  it("marks an animal funded once the target is met, and clamps past it", () => {
    const met = summarizePetSponsorships(
      "pet-002",
      rows(["a@example.com", 150000, "ACTIVE"]),
      senFromInteger(150000)
    );
    expect(met.isFullyFunded).toBe(true);
    expect(met.progressPercent).toBe(100);

    const over = summarizePetSponsorships(
      "pet-003",
      rows(["a@example.com", 500000, "ACTIVE"]),
      senFromInteger(150000)
    );
    expect(over.progressPercent).toBe(100);
    expect(over.fundedSen).toBe(500000);
  });

  it("never treats a zero target as instantly funded", () => {
    const summary = summarizePetSponsorships("pet-004", [], senFromInteger(0));
    expect(summary.goalSen).toBe(DEFAULT_SPONSORSHIP_GOAL_SEN);
    expect(summary.isFullyFunded).toBe(false);
  });

  it("hides social proof until someone is actually counted", () => {
    expect(shouldShowSocialProof(emptySponsorshipSummary("pet-005"))).toBe(false);
    expect(
      shouldShowSocialProof(
        summarizePetSponsorships("pet-005", rows(["a@example.com", 10000, "PENDING_PAYMENT"]))
      )
    ).toBe(false);
    expect(
      shouldShowSocialProof(
        summarizePetSponsorships("pet-005", rows(["a@example.com", 10000, "ACTIVE"]))
      )
    ).toBe(true);
  });

  it("only counts ACTIVE toward funding", () => {
    expect(countsTowardFunding("ACTIVE")).toBe(true);
    expect(countsTowardFunding("PENDING_PAYMENT")).toBe(false);
    expect(countsTowardFunding("CANCELLED")).toBe(false);
    expect(countsTowardFunding("EXPIRED")).toBe(false);
  });
});

describe("a pledge reference is not a receipt number", () => {
  it("uses a prefix a coordinator can tell apart at a glance", () => {
    const ref = generatePledgeRef();
    expect(ref).toMatch(/^HFS-PLG-\d{8}-\d{6}$/);
    expect(ref.startsWith("HFS-DON")).toBe(false);
  });

  it("tells the supporter the receipt follows reconciliation", () => {
    const notice = reconciliationNotice("one_time", "duitnow_qr");

    expect(notice).toMatch(/official receipt.*coordinator matches/i);
    expect(notice).not.toMatch(/Section 44\(6\)|tax-exempt/i);
    expect(reconciliationNotice("monthly", "duitnow_qr")).toMatch(/standing instruction/);
    expect(reconciliationNotice("one_time", "card")).toMatch(/not enabled/);
  });

  it("does not promise receipts for future transfers that this one-shot pledge never records", () => {
    const notice = reconciliationNotice("monthly", "duitnow_qr");

    expect(notice).not.toMatch(/receipt is issued for each month we receive/i);
    expect(notice).toMatch(
      /(?:this (?:pledge|commitment).*(?:one|single)|future transfers?.*(?:recorded|confirmed|reconciled) separately)/i
    );
  });
});

describe("sponsorship validation", () => {
  const base = {
    petId: "pet-001",
    petName: "Milo",
    sponsorName: "Aisyah Rahman",
    sponsorEmail: "aisyah@example.com",
    tierId: "vaccine" as const,
    frequency: "monthly" as const,
    amountMYR: 80,
    paymentMethod: "duitnow_qr" as const,
  };

  it("accepts a well-formed commitment", () => {
    const parsed = petSponsorshipSchema.parse(base);
    expect(parsed.amountMYR).toBe(80);
    expect(parsed.frequency).toBe("monthly");
  });

  it("enforces the RM 10.00 floor", () => {
    expect(() => petSponsorshipSchema.parse({ ...base, amountMYR: 9 })).toThrow(/RM 10\.00/);
    expect(petSponsorshipSchema.parse({ ...base, amountMYR: 10 }).amountMYR).toBe(10);
    expect(MIN_SPONSORSHIP_SEN).toBe(1000);
  });

  it("requires an animal, and tolerates one with no database row", () => {
    expect(() => petSponsorshipSchema.parse({ ...base, petName: "" })).toThrow();
    expect(() => petSponsorshipSchema.parse({ ...base, petName: "   " })).toThrow();
    expect(() => petSponsorshipSchema.parse({ ...base, petId: undefined })).toThrow();
  });

  it("trims names and refuses a whitespace-only sponsor", () => {
    const parsed = petSponsorshipSchema.parse({
      ...base,
      petName: "  Milo  ",
      sponsorName: "  Aisyah Rahman  ",
    });

    expect(parsed.petName).toBe("Milo");
    expect(parsed.sponsorName).toBe("Aisyah Rahman");
    expect(() => petSponsorshipSchema.parse({ ...base, sponsorName: "  " })).toThrow(
      /at least 2 characters/i
    );
  });

  it("refuses amounts that cannot be represented as an integer number of sen", () => {
    expect(() => petSponsorshipSchema.parse({ ...base, amountMYR: 10.001 })).toThrow(
      /at most two decimal places/i
    );
    expect(petSponsorshipSchema.parse({ ...base, amountMYR: 19.9 }).amountMYR).toBe(19.9);
  });

  it("enables only the rails the shelter can settle", () => {
    expect(isPaymentMethodEnabled("duitnow_qr")).toBe(true);
    expect(isPaymentMethodEnabled("online_banking")).toBe(true);
    expect(isPaymentMethodEnabled("card")).toBe(false);
  });
});

describe("the ledger: a commitment starts unpaid", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    petId: "pet-100",
    petName: "Milo",
    sponsorName: "Aisyah Rahman",
    sponsorEmail: "aisyah@example.com",
    tierId: "vaccine",
    tierName: "Core Vaccination & Deworming",
    frequency: "one_time" as const,
    amountSen: senFromRinggit(50),
    paymentMethod: "duitnow_qr" as const,
    pledgeRef: generatePledgeRef(),
    ...over,
  });

  it("records it as PENDING_PAYMENT with no receipt number", async () => {
    const record = await recordSponsorshipPledge(draft());

    expect(record.status).toBe("PENDING_PAYMENT");
    expect(record.receiptNumber).toBeNull();
    expect(record.pledgeRef).toMatch(/^HFS-PLG-/);
  });

  it("keeps it out of the animal's figures until reconciled", async () => {
    const record = await recordSponsorshipPledge(draft());

    const before = await summarizeSponsorshipsForPet("pet-100");
    expect(before.supporterCount).toBe(0);
    expect(before.fundedSen).toBe(0);

    await reconcileSponsorship(record.pledgeRef, "HFS-DON-202609-0001", "coordinator@example.com");

    const after = await summarizeSponsorshipsForPet("pet-100");
    expect(after.supporterCount).toBe(1);
    expect(after.fundedSen).toBe(5000);
  });

  it("refuses to attach a second receipt to the same money", async () => {
    const record = await recordSponsorshipPledge(draft());

    const first = await reconcileSponsorship(record.pledgeRef, "HFS-DON-202609-0002", "a@b.c");
    const second = await reconcileSponsorship(record.pledgeRef, "HFS-DON-202609-0003", "a@b.c");

    expect(first.status).toBe("reconciled");
    expect(second.status).toBe("already_reconciled");
    if (second.status === "already_reconciled") {
      expect(second.receiptNumber).toBe("HFS-DON-202609-0002");
    }
  });

  it("reports an unknown pledge rather than inventing one", async () => {
    const outcome = await reconcileSponsorship("HFS-PLG-20260101-000000", "HFS-DON-202609-0004", "a@b.c");
    expect(outcome.status).toBe("not_found");
  });
});

describe("createPetSponsorshipAction", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    petId: "pet-001",
    petName: "Bella",
    sponsorName: "Aisyah Rahman",
    sponsorEmail: `sponsor.${Math.random().toString(36).slice(2, 9)}@example.com`,
    tierId: "vaccine" as const,
    frequency: "one_time" as const,
    amountMYR: 50,
    paymentMethod: "duitnow_qr" as const,
    ...over,
  });

  it("returns a pledge reference and never a receipt number", async () => {
    const result = await createPetSponsorshipAction(input());

    expect(result.success).toBe(true);
    expect(result.data?.pledgeRef).toMatch(/^HFS-PLG-/);
    expect(result.data?.status).toBe("PENDING_PAYMENT");
    // The whole point of the pledge stage: nothing here may read as a receipt.
    expect(result.data).not.toHaveProperty("receiptNumber");
    expect(result.data).not.toHaveProperty("taxDeductibleRef");
    expect(JSON.stringify(result.data)).not.toContain("HFS-DON");
  });

  it("refuses card payments, which have no processor behind them", async () => {
    const result = await createPetSponsorshipAction(input({ paymentMethod: "card" }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available yet/i);
  });

  it("refuses a commitment below the floor", async () => {
    const result = await createPetSponsorshipAction(input({ amountMYR: 5 }));
    expect(result.success).toBe(false);
  });

  it("returns a validation result for fractional-sen input instead of rejecting", async () => {
    await expect(
      createPetSponsorshipAction(input({ amountMYR: 10.001 }))
    ).resolves.toEqual({
      success: false,
      error: "Sponsorship amount must use at most two decimal places",
    });
  });

  it("returns the first donor-facing issue for an overlong note, not Zod's JSON", async () => {
    const result = await createPetSponsorshipAction(input({ notes: "x".repeat(501) }));

    expect(result).toEqual({
      success: false,
      error: "Note to the shelter must be under 500 characters",
    });
    expect(result.error).not.toMatch(/[{}\[\]"]/);
  });

  it("stores the store's name, not the submitted one, with no database configured", async () => {
    const result = await createPetSponsorshipAction(
      input({ petId: "pet-001", petName: "Forged or stale name" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.petId).toBe("pet-001");
    expect(stored?.petName).toBe("Bella");
  });

  it("refuses an unknown animal instead of trusting a caller-supplied name", async () => {
    const result = await createPetSponsorshipAction(
      input({ petId: "pet-does-not-exist", petName: "Forged name" })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not find that animal/i);
  });

  it("never attaches a caller-supplied supporter account id", async () => {
    const result = await createPetSponsorshipAction(
      input({ userId: "spn-gold-01" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.userId).toBeNull();
  });

  it("links only a signed-in sponsor whose live account and submitted email agree", async () => {
    mockCookieStore.seed(
      SPONSOR_SESSION_COOKIE_NAME,
      sealSponsorSession({
        sponsorId: "spn-bronze-01",
        email: "bronze@example.com",
        name: "Nurul Aisyah",
      })
    );

    const result = await createPetSponsorshipAction(
      input({ sponsorEmail: "BRONZE@EXAMPLE.COM", userId: "spn-gold-01" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.sponsorEmail).toBe("bronze@example.com");
    expect(stored?.userId).toBe("spn-bronze-01");
  });

  it("does not link an account when the submitted email differs from the signed-in sponsor", async () => {
    mockCookieStore.seed(
      SPONSOR_SESSION_COOKIE_NAME,
      sealSponsorSession({
        sponsorId: "spn-bronze-01",
        email: "bronze@example.com",
        name: "Nurul Aisyah",
      })
    );

    const result = await createPetSponsorshipAction(
      input({ sponsorEmail: "someone-else@example.com", userId: "spn-bronze-01" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.userId).toBeNull();
  });

  it("does not trust a signed cookie whose email disagrees with the live account", async () => {
    mockCookieStore.seed(
      SPONSOR_SESSION_COOKIE_NAME,
      sealSponsorSession({
        sponsorId: "spn-bronze-01",
        email: "attacker@example.com",
        name: "Attacker",
      })
    );

    const result = await createPetSponsorshipAction(
      input({ sponsorEmail: "attacker@example.com", userId: "spn-bronze-01" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.userId).toBeNull();
  });

  it("does not link a deleted account named only by a stale signed cookie", async () => {
    mockCookieStore.seed(
      SPONSOR_SESSION_COOKIE_NAME,
      sealSponsorSession({
        sponsorId: "spn-deleted-account",
        email: "deleted@example.com",
        name: "Deleted Sponsor",
      })
    );

    const result = await createPetSponsorshipAction(
      input({ sponsorEmail: "deleted@example.com", userId: "spn-deleted-account" })
    );
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.userId).toBeNull();
  });

  it("keeps the checkout's Sponsor Wall consent on the commitment", async () => {
    const result = await createPetSponsorshipAction(input({ displayOnWall: true }));
    expect(result.success).toBe(true);

    const stored = await findSponsorshipByPledgeRef(result.data!.pledgeRef);
    expect(stored?.displayOnWall).toBe(true);
  });

  it("leaves the animal's public figures unmoved", async () => {
    await createPetSponsorshipAction(input());

    // A stranger's unverified claim on a public form must not raise a counter
    // that other donors read as social proof.
    const summary = await getPetSponsorshipSummaryAction("pet-200");
    expect(summary.supporterCount).toBe(0);
    expect(summary.fundedSen).toBe(0);
  });
});

describe("reconciliation draws its receipt from the shared gapless series", () => {
  it("issues a real Donation rather than a number of its own", async () => {
    const pledge = await recordSponsorshipPledge({
      petId: "pet-300",
      petName: "Milo",
      sponsorName: "Aisyah Rahman",
      sponsorEmail: "aisyah@example.com",
      tierId: "vaccine",
      tierName: "Core Vaccination & Deworming",
      frequency: "one_time",
      amountSen: senFromRinggit(50),
      paymentMethod: "duitnow_qr",
      pledgeRef: generatePledgeRef(),
    });

    // Explicit test-double issuer identity: production identity remains a deployment
    // verification concern, while this test proves the atomic ledger path.
    const outcome = await settleSponsorship(
      pledge.pledgeRef,
      {
        taxDeductibleRef: "TEST-TAX-REFERENCE",
        shelterRegistrationNo: "TEST-REGISTRATION",
      },
      "coordinator@example.com"
    );
    expect(outcome.status).toBe("reconciled");
    if (outcome.status !== "reconciled") return;
    const { donation } = outcome;

    // The receipt is a first-class row in the donation ledger, so it reaches the
    // LHDN export like every other receipt rather than living only on the
    // sponsorship.
    expect(donation.receiptNumber).toMatch(/^HFS-DON-\d{6}-\d{4}$/);
    expect(await findDonationByReceiptNumber(donation.receiptNumber)).not.toBeNull();

    const stored = await findSponsorshipByPledgeRef(pledge.pledgeRef);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.receiptNumber).toBe(donation.receiptNumber);
  });
});
