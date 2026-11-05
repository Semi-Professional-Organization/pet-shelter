import { SponsorshipTierId } from "./sponsorship";

/**
 * Loyalty standing earned by a sponsor.
 *
 * Deliberately a different axis from `SponsorshipTierId` in `./sponsorship`. A
 * `SponsorshipTierId` is a *purpose fund* the donor buys (kibble, vaccine, spay/neuter,
 * emergency medical). A `SupporterTier` is a *standing* they earn from their giving
 * history. They are orthogonal: one RM 250 emergency-medical pledge and five RM 50
 * vaccine pledges land the donor at the same standing.
 */
export type SupporterTier = "BRONZE" | "SILVER" | "GOLD";

/** Ordinal rank used for `>=` comparisons. A sponsor below Bronze has rank 0. */
export const TIER_RANK: Record<SupporterTier, number> = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
};

export type PerkId =
  | "sponsor_wall"
  | "quarterly_newsletter"
  | "photo_gallery_updates"
  | "e_certificate"
  | "video_diary"
  | "open_day_invite"
  | "caretaker_qa";

export interface Perk {
  id: PerkId;
  /** Lowest standing that unlocks this perk. Perks are cumulative up the ranks. */
  minTier: SupporterTier;
  label: string;
  labelMs: string;
}

/**
 * The subset of a `PetSponsorship` that tier derivation reads.
 *
 * A structural subset rather than an import of `SponsorshipRecord`, so this type — and
 * everything consuming it, including client components — stays free of the `server-only`
 * ledger module. `status` is the ledger's own lifecycle: only `ACTIVE` counts, because
 * `PENDING_PAYMENT` means nothing has checked a bank statement.
 */
export interface TierRelevantContribution {
  amountSen: number;
  frequency: "one_time" | "monthly";
  status: string;
  /** ISO-8601 instant the commitment was made. */
  createdAt: string;
}

/** A sponsor account. `passwordHash` never leaves the repository layer. */
export interface SponsorRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  displayOnWall: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A sponsor as the public wall needs them. Deliberately carries no password hash. */
export interface WallSponsor {
  id: string;
  name: string;
  displayOnWall: boolean;
  createdAt: string;
}

/**
 * What the dashboard is allowed to know about the signed-in sponsor.
 * Excludes password hashes, tax identifiers and other donors' data by construction.
 */
export interface SponsorDashboardDTO {
  sponsorId: string;
  name: string;
  email: string;
  tier: SupporterTier | null;
  /** 12-month rolling recognised contribution, in exact sen. */
  recognisedSen: number;
  /** Sen still needed to reach the next standing; null once Gold. */
  amountToNextTierSen: number | null;
  nextTier: SupporterTier | null;
  billingFrequency: "one_time" | "monthly" | "mixed" | "none";
  hasActiveRecurring: boolean;
  displayOnWall: boolean;
  memberSince: string;
  perks: Array<{ id: PerkId; label: string; labelMs: string; unlocked: boolean }>;
  rescues: SponsoredRescueDTO[];
}

/** A pet the sponsor actively supports, with its live status badges. */
export interface SponsoredRescueDTO {
  petId: string;
  name: string;
  breed: string;
  species: string;
  image: string;
  /** Adoption pipeline status. */
  status: string;
  /** Derived rehabilitation stage, from the pet's medical timeline. */
  rehabStage: string;
  rehabStageMs: string;
  medicalBadges: string[];
  totalContributedSen: number;
  lastContributionAt: string;
}

export interface ExclusiveGalleryItem {
  id: string;
  url: string;
  caption: string;
  captionMs: string;
  capturedAt: string;
}

export interface ExclusiveVideoItem {
  id: string;
  youtubeId: string;
  title: string;
  titleMs: string;
  recordedAt: string;
  durationLabel: string;
  thumbnailUrl: string;
  watchUrl: string;
}

/**
 * A tier-gated payload.
 *
 * The locked branch has no `items` key at all. That absence is the security property:
 * an under-tier caller has nothing to read, and TypeScript refuses code that tries.
 * Lives here rather than in the `server-only` access layer so client components can
 * name the type without importing server code.
 */
export type GatedPayload<T> =
  | {
      locked: true;
      requiredTier: SupporterTier;
      currentTier: SupporterTier | null;
      /** How many items are withheld, so a nudge can be specific without leaking them. */
      lockedCount: number;
    }
  | {
      locked: false;
      requiredTier: SupporterTier;
      currentTier: SupporterTier | null;
      items: T[];
    };

/** Response body of `GET /api/sponsor/pet-media/[petId]`. */
export interface PetExclusiveMediaResponse {
  gallery: GatedPayload<ExclusiveGalleryItem>;
  videoDiary: GatedPayload<ExclusiveVideoItem>;
}

/**
 * Everything printed on a sponsorship e-Certificate.
 *
 * Built server-side from a verified standing. Nothing on it is computed in the
 * browser, so a sponsor cannot print themselves a tier they have not earned.
 */
export interface CertificateData {
  sponsorName: string;
  tier: SupporterTier;
  certificateNumber: string;
  issuedOn: string;
  coveringPeriod: string;
  recognisedSen: number;
  rescueNames: string[];
}

/** A single row on the public sponsor wall. Carries no amounts and no contact details. */
export interface SponsorWallEntryDTO {
  name: string;
  tier: SupporterTier;
  memberSince: string;
}
