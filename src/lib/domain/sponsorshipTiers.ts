import { SponsorshipTier } from "@/types/sponsorship";

/**
 * Canonical sponsorship tier catalog.
 *
 * Deliberately free of a "use client" directive: this is backend reference data
 * consumed by both the donation Server Action (to resolve a tier name for the
 * acknowledgement email) and the client donation UI. Keeping it out of
 * `sponsorshipStore.ts` is what allows `src/actions/donations.ts` to stay on the
 * server side of the layer boundary — see docs/architecture/LAYERS.md and the
 * guard in tests/unit/layerBoundaries.test.ts.
 *
 * Amounts are MYR.
 */
export const SPONSORSHIP_TIERS: SponsorshipTier[] = [
  {
    id: "kibble",
    name: "1-Week Nutrition & Kibble Fund",
    amount: 30,
    monthlyAmount: 10,
    frequency: "one_time",
    tagline: "Fuel healthy meals for recovering strays",
    description: "Covers 10 kg of balanced, high-protein kibble, supplements, and fresh wet food portions.",
    impactMetrics: "Feeds 2 rescue dogs or 4 shelter cats for a full week.",
    badgeText: "Most Popular",
  },
  {
    id: "vaccine",
    name: "Core Vaccination & Deworming",
    amount: 50,
    monthlyAmount: 25,
    frequency: "one_time",
    tagline: "Essential immunity for rescue intakes",
    description: "Covers 6-in-1 / FVRCP core vaccines, internal deworming (Drontal), and external flea/tick preventative.",
    impactMetrics: "Protects a newly rescued puppy or kitten from fatal viral diseases.",
    badgeText: "High Impact",
    featured: true,
  },
  {
    id: "spay_neuter",
    name: "Spay / Neuter Surgery Sponsorship",
    amount: 120,
    monthlyAmount: 50,
    frequency: "one_time",
    tagline: "End the cycle of stray overpopulation",
    description: "Sponsors veterinary sterilization surgery, anesthesia, pain management, and surgical recovery boarding.",
    impactMetrics: "Prevents up to dozens of unwanted stray births per animal over their lifetime.",
    badgeText: "Crucial Mission",
  },
  {
    id: "emergency_medical",
    name: "Emergency Medical & Trauma Care",
    amount: 250,
    monthlyAmount: 100,
    frequency: "one_time",
    tagline: "Urgent lifeline for injured and neglected strays",
    description: "Funds veterinary diagnostic X-rays, extensive blood profiling, wound debridement, and specialized therapy.",
    impactMetrics: "Provides urgent rescue intervention for road-accident or severely sick animals.",
    badgeText: "Lifesaver",
  },
];

/** Resolves a tier by id. Returns undefined for "custom" or unknown ids. */
export function findSponsorshipTier(id: string): SponsorshipTier | undefined {
  return SPONSORSHIP_TIERS.find((t) => t.id === id);
}

/**
 * The price a tier costs at the frequency the donor chose.
 *
 * Every surface that shows or charges a tier price goes through this, so the
 * card, the running total, the pay button and the server action cannot end up
 * quoting three different numbers for the same selection.
 */
export function tierAmountFor(
  tier: SponsorshipTier,
  frequency: "one_time" | "monthly"
): number {
  return frequency === "monthly" ? tier.monthlyAmount : tier.amount;
}
