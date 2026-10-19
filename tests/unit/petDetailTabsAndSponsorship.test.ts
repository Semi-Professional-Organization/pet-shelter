import { describe, it, expect } from "vitest";
import { getPetStatusPresentation, getRehabStageLabel, getRehabProgressPercent } from "@/lib/presentation/petStatusPresentation";
import {
  findSponsorshipTier,
  SPONSORSHIP_TIERS,
  tierAmountFor,
} from "@/lib/domain/sponsorshipTiers";
import { Pet } from "@/types/pet";

const mockAdoptablePet: Pet = {
  id: "pet-test-01",
  name: "Buster",
  species: "dog",
  breed: "Malaysian Mixed Breed",
  age: "2 years",
  ageCategory: "young",
  gender: "Male",
  size: "Medium",
  weight: "16 kg",
  status: "Available",
  adoptionFee: "Free",
  intakeDate: "2026-01-10",
  description: "Playful and friendly rescue companion.",
  rescueStory: "Rescued from SS2 commercial area.",
  image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1",
  tags: ["Friendly", "Vaccinated"],
  featured: false,
  isArchived: false,
  medical: {
    vaccinated: true,
    spayedNeutered: true,
    microchipped: true,
  },
  compatibility: {
    goodWithDogs: true,
    goodWithCats: false,
    goodWithKids: true,
    energyLevel: "Moderate",
  },
  updates: [
    {
      id: "up-001",
      date: "2026-02-01",
      title: "Behavioral clearance",
      content: "Buster completed outdoor socialization training.",
    },
  ],
};

const mockRehabPet: Pet = {
  ...mockAdoptablePet,
  id: "pet-test-02",
  name: "Kopi",
  status: "In Rehabilitation",
  rehabStage: "Stage 2: Bone Healing",
  rehabProgressPercent: 60,
  updates: [
    {
      id: "up-002",
      date: "2026-02-15",
      title: "X-ray review",
      content: "Callus formation progressing well on right hind leg.",
    },
  ],
};

describe("FE-05: Tabbed Animal Profile View & Status Presentation", () => {
  it("should format adoptable pet presentation correctly for profile tabs", () => {
    const pres = getPetStatusPresentation(mockAdoptablePet.status);
    expect(pres.isAdoptable).toBe(true);
    expect(pres.isInRehabilitation).toBe(false);
    expect(pres.tone).toBe("available");
  });

  it("should format rehabilitating pet presentation correctly with stage and progress", () => {
    const pres = getPetStatusPresentation(mockRehabPet.status);
    expect(pres.isAdoptable).toBe(false);
    expect(pres.isInRehabilitation).toBe(true);
    expect(pres.tone).toBe("rehabilitation");

    const stageLabel = getRehabStageLabel(mockRehabPet, false);
    expect(stageLabel).toBe("Stage 2: Bone Healing");

    const progressPercent = getRehabProgressPercent(mockRehabPet);
    expect(progressPercent).toBe(60);
  });
});

describe("FE-06: Personalized Sponsorship & Tiers", () => {
  it("prices a monthly commitment below the same tier's one-time gift", () => {
    // A one-time gift funds a discrete thing; a monthly sponsorship is priced to
    // be affordable to keep. The ladder is the shelter's decision, pinned here so
    // it cannot drift silently through a UI edit.
    const monthlyLadder: Record<string, { oneTime: number; monthly: number }> = {
      kibble: { oneTime: 30, monthly: 10 },
      vaccine: { oneTime: 50, monthly: 25 },
      spay_neuter: { oneTime: 120, monthly: 50 },
      emergency_medical: { oneTime: 250, monthly: 100 },
    };

    for (const tier of SPONSORSHIP_TIERS) {
      const expected = monthlyLadder[tier.id];
      expect(expected, `no expected pricing for tier ${tier.id}`).toBeDefined();
      expect(tier.amount, `${tier.id} one-time`).toBe(expected.oneTime);
      expect(tier.monthlyAmount, `${tier.id} monthly`).toBe(expected.monthly);
      expect(tier.monthlyAmount).toBeLessThan(tier.amount);
    }
  });

  it("resolves the price from the frequency the donor chose", () => {
    const kibble = findSponsorshipTier("kibble")!;
    expect(tierAmountFor(kibble, "one_time")).toBe(30);
    expect(tierAmountFor(kibble, "monthly")).toBe(10);
  });

  it("should find the RM30 kibble/nutrition tier and support monthly giving", () => {
    const kibbleTier = findSponsorshipTier("kibble");
    expect(kibbleTier).toBeDefined();
    expect(kibbleTier?.amount).toBe(30);
    expect(kibbleTier?.name).toContain("Nutrition");
  });

  it("should define all 4 canonical sponsorship tiers with required metadata", () => {
    expect(SPONSORSHIP_TIERS.length).toBe(4);
    const tierIds = SPONSORSHIP_TIERS.map((t) => t.id);
    expect(tierIds).toContain("kibble");
    expect(tierIds).toContain("vaccine");
    expect(tierIds).toContain("spay_neuter");
    expect(tierIds).toContain("emergency_medical");

    SPONSORSHIP_TIERS.forEach((tier) => {
      expect(tier.amount).toBeGreaterThanOrEqual(30);
      expect(tier.description.length).toBeGreaterThan(10);
      expect(tier.impactMetrics.length).toBeGreaterThan(5);
    });
  });
});
