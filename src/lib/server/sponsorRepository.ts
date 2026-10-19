import "server-only";

import { prisma } from "./prisma";
import { listSponsorshipsByUserId } from "./sponsorshipLedger";
import { isLedgerPersistent } from "./donationLedger";
import type { SponsorshipRecord } from "./sponsorshipLedger";
import type { SponsorRecord, WallSponsor } from "@/types/supporter";
import { registerStateReset } from "@/lib/stateResets";

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
  /** `hashPassword(initialPassword)`, derived once; see `INITIAL_STAFF_USERS` in userStore. */
  passwordHash: string;
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
    passwordHash:
      "b96cb5ae68ce4148b14e30653c9be30e:9779422d6967b5c648052ec15c52fd19571bb5ba36d586acf70ece5ad501e320a2d2926aad67e2c519914db3a9bb628f1a18e6824e3e9f181101b4a39f881448",
    displayOnWall: true,
    createdAt: "2026-03-14T00:00:00.000Z",
  },
  {
    id: "spn-silver-01",
    email: "silver@example.com",
    name: "Jason Lim",
    initialPassword: "silver123",
    passwordHash:
      "1cea98bd7c1dba22edaf9c2de505be0b:f2a130d6be0daa0c62168bb0e6c17050a9cb0887793f9cf9dc02f7b0c485e499432b809e794335a343e34240de839740d59d72e462fc34865b3dac62f3ca269e",
    displayOnWall: true,
    createdAt: "2026-01-09T00:00:00.000Z",
  },
  {
    id: "spn-gold-01",
    email: "gold@example.com",
    name: "Datin Sofia Rahman",
    initialPassword: "gold123",
    passwordHash:
      "602f4a6c827a5f422ff0f8bc03c79077:ff3e09e9bb01e45b77eb6f6371dc4f703e521149f1284af6bcbb2fba8bc568584a414e9678b0e8389ff57b758666526716235cf10df6b5ea4afb963def6c4524",
    displayOnWall: true,
    createdAt: "2025-11-02T00:00:00.000Z",
  },
];

function ensureInitialised(): Promise<void> {
  if (initialised) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      if (SEEDING_ENABLED) {
        for (const seed of SEED_SPONSORS) {
          memorySponsors.set(seed.email, {
            id: seed.id,
            email: seed.email,
            name: seed.name,
            passwordHash: seed.passwordHash,
            displayOnWall: seed.displayOnWall,
            createdAt: seed.createdAt,
            updatedAt: seed.createdAt,
          });
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

registerStateReset("sponsorRepository", resetSponsorRepository);
