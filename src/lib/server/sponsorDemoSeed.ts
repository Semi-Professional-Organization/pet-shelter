import "server-only";

import { senFromRinggit } from "@/lib/domain/money";
import { generatePledgeRef } from "@/lib/domain/petSponsorship";
import {
  recordSponsorshipPledge,
  reconcileSponsorship,
  memorySponsorshipCount,
} from "./sponsorshipLedger";
import {
  isLedgerPersistent,
  formatReceiptNumber,
  receiptScopeFor,
} from "./donationLedger";
import { SEED_SPONSORS } from "./sponsorRepository";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Demo commitments for the three seeded supporter accounts, offline only.
 *
 * Recorded through `recordSponsorshipPledge` and moved to `ACTIVE` through
 * `reconcileSponsorship`, rather than fabricated as rows. That matters: it means the
 * offline demo exercises the same pledge-reference allocation, the same sen arithmetic
 * and the same `PENDING_PAYMENT → ACTIVE` transition as production. A hand-built fixture
 * would let all three drift without a single test noticing.
 *
 * Each account is positioned to land on a different standing purely through `deriveTier`,
 * and Bronze carries one commitment aged out of the recognition window — which is what
 * demonstrates that standings decay rather than accumulate for life.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedCommitment {
  userId: string | null;
  email: string;
  name: string;
  petId: string;
  petName: string;
  tierId: string;
  tierName: string;
  ringgit: number;
  frequency: "one_time" | "monthly";
  daysAgo: number;
  /** Left PENDING_PAYMENT when false, so an unreconciled commitment grants nothing. */
  reconciled: boolean;
}

const SEED_COMMITMENTS: SeedCommitment[] = [
  { userId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah",
    petId: "pet-002", petName: "Milo", tierId: "vaccine",
    tierName: "Core Vaccination & Deworming", ringgit: 50, frequency: "one_time",
    daysAgo: 40, reconciled: true },
  { userId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah",
    petId: "pet-002", petName: "Milo", tierId: "emergency_medical",
    tierName: "Emergency Medical & Trauma Care", ringgit: 250, frequency: "one_time",
    daysAgo: 500, reconciled: true },
  { userId: "spn-silver-01", email: "silver@example.com", name: "Jason Lim",
    petId: "pet-001", petName: "Bella", tierId: "emergency_medical",
    tierName: "Emergency Medical & Trauma Care", ringgit: 250, frequency: "one_time",
    daysAgo: 120, reconciled: true },
  { userId: "spn-silver-01", email: "silver@example.com", name: "Jason Lim",
    petId: "pet-005", petName: "Rocky", tierId: "spay_neuter",
    tierName: "Spay / Neuter Surgery Sponsorship", ringgit: 120, frequency: "one_time",
    daysAgo: 30, reconciled: true },
  { userId: "spn-gold-01", email: "gold@example.com", name: "Datin Sofia Rahman",
    petId: "pet-003", petName: "Luna", tierId: "kibble",
    tierName: "1-Week Nutrition & Kibble Fund", ringgit: 120, frequency: "monthly",
    daysAgo: 210, reconciled: true },
  { userId: "spn-gold-01", email: "gold@example.com", name: "Datin Sofia Rahman",
    petId: "pet-006", petName: "Cleo", tierId: "emergency_medical",
    tierName: "Emergency Medical & Trauma Care", ringgit: 250, frequency: "one_time",
    daysAgo: 15, reconciled: true },
  // Unclaimed and reconciled: the account-claim flow needs a commitment that carries a
  // receipt number and belongs to nobody yet.
  { userId: null, email: "unclaimed@example.com", name: "Tan Wei Ming",
    petId: "pet-001", petName: "Bella", tierId: "spay_neuter",
    tierName: "Spay / Neuter Surgery Sponsorship", ringgit: 120, frequency: "one_time",
    daysAgo: 60, reconciled: true },
  // Unreconciled: proves an unpaid pledge confers neither a standing nor a claim.
  { userId: null, email: "pending@example.com", name: "Siti Nurhaliza",
    petId: "pet-004", petName: "Oliver", tierId: "kibble",
    tierName: "1-Week Nutrition & Kibble Fund", ringgit: 5000, frequency: "one_time",
    daysAgo: 3, reconciled: false },
];

let seedPromise: Promise<void> | null = null;

/**
 * Idempotent, and safe under concurrency.
 *
 * The in-flight promise is latched rather than a boolean, because callers do run
 * concurrently: the pet-media Route Handler resolves the gallery gate and the video gate
 * in one `Promise.all`, and a boolean set before the first `await` would let the second
 * caller return immediately and read a half-seeded ledger. Same reason `ensureInitialised`
 * in `sponsorRepository.ts` latches its promise.
 *
 * Called from the access layer rather than at module load, so the cost falls only on a
 * request that actually reads sponsorship data.
 */
export function seedOfflineSponsorships(): Promise<void> {
  if (isLedgerPersistent()) return Promise.resolve();
  if (!seedPromise) seedPromise = runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  // A non-empty ledger means a test already recorded pledges of its own; re-seeding would
  // make its assertions depend on ordering.
  if (memorySponsorshipCount() > 0) return;
  let serial = 0;

  for (const seed of SEED_COMMITMENTS) {
    const when = new Date(Date.now() - seed.daysAgo * DAY_MS);

    const record = await recordSponsorshipPledge(
      {
        petId: seed.petId,
        petName: seed.petName,
        sponsorName: seed.name,
        sponsorEmail: seed.email,
        userId: seed.userId,
        tierId: seed.tierId,
        tierName: seed.tierName,
        frequency: seed.frequency,
        amountSen: senFromRinggit(seed.ringgit),
        paymentMethod: "duitnow_qr",
        pledgeRef: generatePledgeRef(),
        displayOnWall: true,
      },
      { now: when }
    );

    if (seed.reconciled) {
      // Formatted through the ledger's own helpers rather than hand-built, so a demo
      // receipt number is indistinguishable in shape from a real one — the account-claim
      // form validates against that same format.
      serial += 1;
      await reconcileSponsorship(
        record.pledgeRef,
        formatReceiptNumber(receiptScopeFor(when), serial),
        "seed@hopeforstrays.org",
        { now: when }
      );
    }
  }
}

/** Test-only, so a suite that resets the ledger gets the demo data back. */
export function resetSponsorDemoSeed(): void {
  seedPromise = null;
}

registerStateReset("sponsorDemoSeed", resetSponsorDemoSeed);
