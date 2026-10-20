import "server-only";

import { prisma } from "./prisma";
import { listSponsorshipsByUserId } from "./sponsorshipLedger";
import { isLedgerPersistent } from "./donationLedger";
import type { SponsorshipRecord } from "./sponsorshipLedger";
import { hashPassword } from "@/lib/security/crypto";
import type { SponsorRecord, WallSponsor } from "@/types/supporter";

/**
 * Supporter accounts for the sponsor portal.
 *
 * ## Scope
 *
 * Accounts, and nothing else. Commitments live in `sponsorshipLedger.ts`, which owns
 * `pet_sponsorships`; this module owns `sponsors` and joins through
 * `PetSponsorship.userId` — the column that ledger reserved for exactly this.
 *
 * Two earlier versions of this file stored commitments themselves. The first was a
 * second donation ledger; the second was an annotation table that `PetSponsorship` then
 * superseded. Both were deleted rather than reconciled. See
 * `tasks/decisions/2026-09-03-sponsor-state-annotates-the-ledger.md` and
 * `tasks/open/sponsor-portal-reduces-to-the-account-layer.md`.
 *
 * ## Mode, not fallback
 *
 * Follows `donationLedger.ts` and `sponsorshipLedger.ts`: the mode is *declared* by
 * whether `DATABASE_URL` is configured, not discovered by catching an error. A
 * configured database that rejects a write is a fault and must be loud — silently
 * demoting a consent withdrawal into process memory is the failure that makes a portal
 * lie to the person using it.
 */

/**
 * Demo accounts exist only offline, and never in production.
 *
 * Their purpose is real — the portal has to be demonstrable with no infrastructure. In
 * production the same seed is an authentication bypass, because the passwords are
 * published in `docs/architecture/GUIDE_SPONSOR_TIERS_AND_GATED_CONTENT.md`.
 */
const SEEDING_ENABLED = process.env.NODE_ENV !== "production" && !isLedgerPersistent();

const memorySponsors = new Map<string, SponsorRecord>();
let initialised = false;
let initPromise: Promise<void> | null = null;

interface SeedSponsor {
  id: string;
  email: string;
  name: string;
  initialPassword: string;
  displayOnWall: boolean;
  createdAt: string;
}

/**
 * One demo account per standing.
 *
 * The standings themselves are not seeded here — they are derived from the commitments
 * `seedOfflineSponsorships()` records against these accounts, so the demo exercises the
 * real ledger rather than a fixture that can drift from it.
 */
export const SEED_SPONSORS: SeedSponsor[] = [
  {
    id: "spn-bronze-01",
    email: "bronze@example.com",
    name: "Nurul Aisyah",
    initialPassword: "bronze123",
    displayOnWall: true,
    createdAt: "2026-03-14T00:00:00.000Z",
  },
  {
    id: "spn-silver-01",
    email: "silver@example.com",
    name: "Jason Lim",
    initialPassword: "silver123",
    displayOnWall: true,
    createdAt: "2026-01-09T00:00:00.000Z",
  },
  {
    id: "spn-gold-01",
    email: "gold@example.com",
    name: "Datin Sofia Rahman",
    initialPassword: "gold123",
    displayOnWall: true,
    createdAt: "2025-11-02T00:00:00.000Z",
  },
];

/**
 * The seeded accounts, hashed once per process.
 *
 * `hashPassword` is scrypt, which is slow on purpose, and the global `beforeEach` in
 * `tests/setup/nextMocks.ts` resets this repository before every test in the suite. Deriving the
 * three seed hashes on each reset cost every test about a quarter of a second, which was most of
 * the unit job's time on CI. The passwords are constants, so the hashes can never go stale: the
 * same reasoning, and the same shape, as `getSeededStaff()` in `userStore.ts`.
 *
 * Deliberately *not* cleared by `resetSponsorRepository()`.
 */
let seededSponsorsPromise: Promise<SponsorRecord[]> | null = null;

function getSeededSponsors(): Promise<SponsorRecord[]> {
  if (!seededSponsorsPromise) {
    seededSponsorsPromise = Promise.all(
      SEED_SPONSORS.map(async (seed) => ({
        id: seed.id,
        email: seed.email,
        name: seed.name,
        passwordHash: await hashPassword(seed.initialPassword),
        displayOnWall: seed.displayOnWall,
        createdAt: seed.createdAt,
        updatedAt: seed.createdAt,
      }))
    ).catch((error: unknown) => {
      // A failed derivation must not be cached: the next reset derives again.
      seededSponsorsPromise = null;
      throw error;
    });
  }
  return seededSponsorsPromise;
}

function ensureInitialised(): Promise<void> {
  if (initialised) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      if (SEEDING_ENABLED) {
        for (const seed of await getSeededSponsors()) {
          // Copied per seed: `setSponsorWallPreference` edits the stored record in place,
          // and that edit must not reach the cached template.
          memorySponsors.set(seed.email, { ...seed });
        }
      }
      initialised = true;
    })();
  }
  return initPromise;
}

interface DbSponsor {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  displayOnWall: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSponsor(row: DbSponsor): SponsorRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    displayOnWall: row.displayOnWall,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findSponsorByEmail(email: string): Promise<SponsorRecord | null> {
  const normalised = email.trim().toLowerCase();

  if (isLedgerPersistent()) {
    const row = await prisma.sponsor.findUnique({ where: { email: normalised } });
    return row ? toSponsor(row as DbSponsor) : null;
  }

  await ensureInitialised();
  return memorySponsors.get(normalised) ?? null;
}

export async function findSponsorById(id: string): Promise<SponsorRecord | null> {
  if (isLedgerPersistent()) {
    const row = await prisma.sponsor.findUnique({ where: { id } });
    return row ? toSponsor(row as DbSponsor) : null;
  }

  await ensureInitialised();
  for (const sponsor of memorySponsors.values()) {
    if (sponsor.id === id) return sponsor;
  }
  return null;
}

export async function createSponsor(data: {
  email: string;
  name: string;
  passwordHash: string;
  displayOnWall: boolean;
}): Promise<SponsorRecord> {
  const normalised = data.email.trim().toLowerCase();

  if (isLedgerPersistent()) {
    const row = await prisma.sponsor.create({
      data: {
        email: normalised,
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        displayOnWall: data.displayOnWall,
      },
    });
    return toSponsor(row as DbSponsor);
  }

  await ensureInitialised();
  const now = new Date().toISOString();
  const record: SponsorRecord = {
    id: `spn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    email: normalised,
    name: data.name.trim(),
    passwordHash: data.passwordHash,
    displayOnWall: data.displayOnWall,
    createdAt: now,
    updatedAt: now,
  };
  memorySponsors.set(normalised, record);
  return record;
}

/**
 * Stores a wall-consent decision, and reports whether it was actually stored.
 *
 * Withdrawing consent is the one operation here that must never claim a success it did
 * not achieve: a supporter told "your sponsorship stays private" while their name is
 * still on `/sponsors` is worse than an error message.
 */
export async function setSponsorWallPreference(
  sponsorId: string,
  displayOnWall: boolean
): Promise<boolean> {
  if (isLedgerPersistent()) {
    await prisma.sponsor.update({ where: { id: sponsorId }, data: { displayOnWall } });
    return true;
  }

  await ensureInitialised();
  for (const sponsor of memorySponsors.values()) {
    if (sponsor.id === sponsorId) {
      sponsor.displayOnWall = displayOnWall;
      sponsor.updatedAt = new Date().toISOString();
      return true;
    }
  }
  return false;
}

/**
 * Accounts that opted in to the public wall, with the commitments that decide their
 * standing. Carries no password hash and no contact details, so the privacy the wall
 * promises is enforced by the shape rather than by the caller remembering to project.
 */
export async function listWallOptInSponsors(): Promise<
  Array<{ sponsor: WallSponsor; sponsorships: SponsorshipRecord[] }>
> {
  let sponsors: WallSponsor[];

  if (isLedgerPersistent()) {
    const rows = await prisma.sponsor.findMany({
      where: { displayOnWall: true },
      select: { id: true, name: true, displayOnWall: true, createdAt: true },
    });
    sponsors = (
      rows as Array<{ id: string; name: string; displayOnWall: boolean; createdAt: Date }>
    ).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  } else {
    await ensureInitialised();
    sponsors = Array.from(memorySponsors.values())
      .filter((sponsor) => sponsor.displayOnWall)
      .map(({ id, name, displayOnWall, createdAt }) => ({
        id,
        name,
        displayOnWall,
        createdAt,
      }));
  }

  const wall = [];
  for (const sponsor of sponsors) {
    wall.push({ sponsor, sponsorships: await listSponsorshipsByUserId(sponsor.id) });
  }
  return wall;
}

/** Test-only reset, alongside `resetSponsorshipLedger` in the global `beforeEach`. */
export async function resetSponsorRepository(): Promise<void> {
  memorySponsors.clear();
  initialised = false;
  initPromise = null;
  await ensureInitialised();
}
