export type SponsorshipTierId = "kibble" | "vaccine" | "spay_neuter" | "emergency_medical" | "custom";

export interface SponsorshipTier {
  id: SponsorshipTierId;
  name: string;
  /** One-time gift price, in MYR. */
  amount: number;
  /**
   * Recurring monthly price, in MYR — deliberately lower than `amount`.
   *
   * A one-time gift funds a discrete thing (a course of vaccines, one surgery);
   * a monthly sponsorship is a standing commitment, priced so it is affordable
   * to keep rather than to make once. Both are ringgit, like `amount`, and are
   * converted to sen at the single `senFromRinggit` boundary on the server.
   */
  monthlyAmount: number;
  frequency: "one_time" | "monthly";
  tagline: string;
  description: string;
  impactMetrics: string;
  badgeText: string;
  featured?: boolean;
  perks?: string[];
}

export interface DonationReceipt {
  receiptNumber: string; // e.g. HFS-DON-202608-482145
  date: string;
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  tierId: SponsorshipTierId;
  tierName: string;
  amountMYR: number;
  frequency?: "one_time" | "monthly";
  paymentMethod: "duitnow_qr" | "online_banking" | "card";
  targetPetName?: string;
  notes?: string;
}
