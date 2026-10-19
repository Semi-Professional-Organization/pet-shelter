import { vi } from "vitest";
import type { AdoptionApplication } from "@prisma/client";
import type { DbPetRecord } from "@/lib/server/petMappers";
import { memberRowForId } from "../../setup/authSession";

/**
 * Shared plumbing for Tier 3a — the strict-persistence suites that do *not*
 * require a PostgreSQL server. Not a `*.test.ts` file, so the glob skips it.
 *
 * Tier 3b (`tests/integration/db/`) is the tier that talks to a real database.
 * The split matters: everything here runs under `STRICT_PERSISTENCE=true` with
 * the Prisma *client* doubled, which is what makes it possible to assert the
 * behaviours strict mode exists for — a failing query must propagate rather
 * than silently serve fixtures — without depending on a database being up, and
 * to provoke failures on demand that a healthy database would never produce.
 */

/** The subset of the Prisma client the repositories under test actually call. */
export interface PrismaDouble {
  pet: {
    findMany: ReturnType<typeof vi.fn>;
    /** `findServerPetByIdAsync`, the reader behind a single public profile. */
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  adoptionApplication: {
    findMany: ReturnType<typeof vi.fn>;
    /**
     * Every single-row read: `findServerApplicationByIdAsync`, the re-read inside
     * `atomicUpdateApplicationStatus`'s transaction, and `deleteServerApplication`
     * for a row the mirror lacks. `findFirst`, which only the public tracking
     * lookup calls, is left out until a suite here drives that path.
     */
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  petUpdate: { deleteMany: ReturnType<typeof vi.fn> };
  medicalTimelineEvent: { deleteMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  /**
   * Reads only. The FAQ write paths (`create`, `update`, `delete`, and the
   * `$transaction` + `$queryRaw … FOR UPDATE` that reordering uses) have no
   * suite here yet, and a delegate nothing calls is a method that drifts from
   * the shape the repository actually needs. Add them with the test that needs
   * them.
   */
  faq: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
  $disconnect: ReturnType<typeof vi.fn>;
}

/**
 * Builds a client double whose reads all resolve empty by default.
 *
 * Empty means "the database holds nothing", and every reader here now takes that
 * as an answer rather than as a cue to serve fixtures: `getServerPetsAsync`
 * returns `[]`, `findServerPetByIdAsync` returns `null`, `getServerFaqsAsync`
 * returns `[]`. So a test that forgets to arrange its rows sees an empty
 * shelter, not bundled demo animals — and a test that *wants* the fallback has
 * to provoke a failure, which is the arrangement that actually exercises it.
 *
 * The two list readers fall back only from their `catch`. `findServerPetByIdAsync`
 * has one more door: it is gated on `isDatabasePersistent()` and serves the
 * mirror without querying at all when no database is configured. Do not carry
 * "only from their `catch`" across to that reader; it is not true of it.
 *
 * That door is reachable under this double, despite the project setting
 * `STRICT_PERSISTENCE`: `persistenceMode` reads both flags per call, so a test
 * that stubs `STRICT_PERSISTENCE=false` and `DATABASE_URL=""` takes it.
 * `petMissingRowIsAnAnswer.test.ts` does exactly that, and it is the only place
 * `getPetById`'s exact-id guard is exercised.
 *
 * This default once carried the opposite rationale, because the pet catalogue
 * gated its fallback on `rows.length > 0` and the single-pet read fell through
 * after an empty result. Both are fixed —
 * `softDeleteFiltering.test.ts` and `petMissingRowIsAnAnswer.test.ts` pin them —
 * and `faqEmptyPublishSet.test.ts` pins the FAQ reader that was right first.
 */
export function createPrismaDouble(): PrismaDouble {
  const double: PrismaDouble = {
    pet: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    adoptionApplication: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    petUpdate: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    medicalTimelineEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: {
      // Answers the member lookup `getVerifiedSession` makes on every guarded
      // call, for whichever identity the suite signed in as. Resolving null
      // here used to authorize anyway, via a DAL fall-through to the cookie's
      // own claims that also kept deleted members signed in; see
      // `memberRowForId`, which this mirrors.
      findUnique: vi.fn(async (args?: { where?: { id?: string } }) =>
        memberRowForId(args?.where?.id)
      ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    faq: { findMany: vi.fn().mockResolvedValue([]) },
    // Wired below, so the callback runs against this double.
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  wireTransaction(double);
  return double;
}

/**
 * Wires `$transaction` to run its callback against the double, or to run an array of promises.
 *
 * Mirrors the real interactive form: the callback receives a transaction
 * client, and here that client is the double itself, so a test can assert on
 * the writes a transaction made.
 *
 * Every double is wired from creation, and `resetPrismaDouble` re-wires it. It
 * used to be a bare `vi.fn()` that nothing wired, which resolved `undefined`
 * without calling the callback: a transaction that "committed" having run none
 * of its reads, guards or writes, so an action built on one could report
 * success for work that never happened.
 */
export function wireTransaction(double: PrismaDouble): void {
  double.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: PrismaDouble) => Promise<unknown>)(double);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
}

let rowCounter = 0;

/**
 * A complete `pets` row as `prisma.pet.findMany` returns one.
 *
 * Every column the mapper reads is present, so a test states only the field it
 * is about. Nested history defaults to empty arrays because the repository's
 * read always asks for them via `include`.
 */
export function makeDbPet(overrides: Partial<DbPetRecord> = {}): DbPetRecord {
  rowCounter += 1;
  return {
    id: `itest-pet-${rowCounter}`,
    name: `Row${rowCounter}`,
    species: "dog",
    breed: "Local Mixed",
    birthDate: "2024-06-12",
    birthDateIsEstimate: true,
    gender: "Female",
    size: "Medium",
    weight: "18 kg",
    status: "Available",
    adoptionFee: "Free",
    description: "Persisted description.",
    rescueStory: "Persisted rescue story.",
    image: "https://example.test/row.jpg",
    galleryImages: [],
    tags: ["House-Trained"],
    featured: false,
    intakeDate: "2026-06-12",
    rehabStage: null,
    rehabStageMs: null,
    rehabProgressPercent: null,
    vaccinated: true,
    microchipped: true,
    spayedNeutered: true,
    specialNeeds: null,
    goodWithDogs: true,
    goodWithCats: true,
    goodWithKids: true,
    energyLevel: "Moderate",
    isArchived: false,
    deletedAt: null,
    updates: [],
    medicalTimeline: [],
    ...overrides,
  };
}

/**
 * A complete `adoption_applications` row as `prisma.adoptionApplication.findUnique` returns one.
 *
 * Typed against the generated model rather than a hand-kept shape, so a column
 * the schema gains is a type error here instead of an `undefined` the mapper
 * reads quietly. The default id is absent from `src/data/applications.json`, so
 * the row exists only in the double.
 */
export function makeDbApplication(overrides: Partial<AdoptionApplication> = {}): AdoptionApplication {
  rowCounter += 1;
  return {
    id: `itest-app-${rowCounter}`,
    referenceCode: null,
    petId: `itest-pet-${rowCounter}`,
    petName: `Row${rowCounter}`,
    petBreed: "Local Mixed",
    applicantName: "Integration Applicant",
    email: "applicant@example.test",
    phone: "012-000 0000",
    address: "1 Persisted Lane, Petaling Jaya",
    identification: null,
    housingType: "landed_terrace",
    livingSituation: null,
    hasFencedYard: "yes",
    landlordApproval: null,
    currentPets: "none",
    currentPetDetails: null,
    householdExperience: "experienced",
    experienceDescription: null,
    vetClinic: null,
    dailyAloneHours: null,
    applicantNotes: null,
    message: null,
    status: "SUBMITTED",
    interviewAt: null,
    interviewLocation: null,
    interviewMeetingType: null,
    homeVisitAt: null,
    adminNotes: null,
    adminReviewNotes: null,
    reviewedBy: null,
    createdAt: new Date("2026-08-12T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Retrieves the double a file installed via `vi.mock("@/lib/server/prisma")`.
 *
 * The mock factory has to construct the double itself — `vi.mock` is hoisted
 * above every import, so it cannot close over a module-scope value — which
 * leaves importing the mocked module as the only way to get a handle on it.
 */
export async function getPrismaDouble(): Promise<PrismaDouble> {
  const mocked = await import("@/lib/server/prisma");
  return mocked.prisma as unknown as PrismaDouble;
}

/**
 * Restores every method to its default resolution, in place.
 *
 * Mutates the existing object rather than replacing it: the repositories hold
 * the same reference for the lifetime of the module, so a reassignment would
 * leave them talking to the previous test's double.
 */
export function resetPrismaDouble(double: PrismaDouble): void {
  const fresh = createPrismaDouble() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(fresh)) {
    (double as unknown as Record<string, unknown>)[key] = value;
  }
  // The copied `$transaction` was wired to `fresh`; point it at this object.
  wireTransaction(double);
}
