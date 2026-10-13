import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";

/**
 * Tier 3a — the guards `submitApplication` puts in front of a public adoption submission,
 * under `STRICT_PERSISTENCE=true`.
 *
 * The action used to resolve its target with `findServerPetById`, the synchronous mirror
 * reader, and then test `pet && pet.isArchived`. Three defects in those two lines, each fixed
 * here and each given a test below that goes red on its own revert:
 *
 *  1. the archive check read `src/data/pets.json` rather than the database;
 *  2. `pet && …` passed when nothing matched, so an unknown id was accepted;
 *  3. no status was checked at all, so an adopted animal accepted applications.
 *
 * Every rejection case is arranged under `pet-001` — a *real* row in `src/data/pets.json`,
 * Available and unarchived there. That is the point of this file. With an `itest-` id the
 * mirror returns null too, so the assertions would pass against the broken action for the
 * wrong reason: "not found" and "correctly refused" are the same `success: false`. See
 * `tasks/lessons/2026-09-10-ask-why-a-regression-test-passes-not-just-whether-it-fails.md`.
 */

/**
 * An async factory, because `vi.mock` is hoisted above this file's imports and so cannot close
 * over anything at module scope. Building the double inside it and reading it back with
 * `getPrismaDouble()` is what gives the tests a handle.
 */
vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

let prismaDouble: PrismaDouble;

beforeAll(async () => {
  prismaDouble = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(prismaDouble);
});

/** A complete, schema-valid application. Only `petId` varies between the cases below. */
function applicationFor(petId: string, petName = "Bella") {
  return {
    petId,
    petName,
    applicantName: "Ahmad Razak",
    email: "ahmad.razak@example.com",
    phone: "012-3456789",
    identification: "880101-14-5678",
    address: "No. 24, Jalan SS 2/10, Petaling Jaya",
    housingType: "landed_terrace" as const,
    hasFencedYard: "yes" as const,
    landlordApproval: "owner_occupied" as const,
    currentPets: "none" as const,
    householdExperience: "experienced" as const,
    vetClinic: "Klinik Haiwan SS2",
    dailyAloneHours: "4_to_8" as const,
  };
}

/** Arranges the single row `findServerPetByIdAsync` will read, for the exact id only. */
function givenPersistedPet(row: ReturnType<typeof makeDbPet> | null) {
  if (row === null) {
    prismaDouble.pet.findUnique.mockResolvedValue(null);
    return;
  }
  // Modelled as Postgres behaves: the row is returned for its exact id and for nothing else.
  // Resolving the same row for every id would hide the case-variant bypass rather than pin it.
  prismaDouble.pet.findUnique.mockImplementation(async (args?: { where?: { id?: string } }) =>
    args?.where?.id === row.id ? row : null
  );
}

describe("submitApplication under strict persistence", () => {
  it("runs with the fallback disabled", async () => {
    const { isStrictPersistence } = await import("@/lib/persistenceMode");

    // Guards every assertion below. Without strict mode a failing query would be swallowed and
    // served from fixtures, and each test here would still pass.
    expect(isStrictPersistence()).toBe(true);
  });

  describe("the animal must exist", () => {
    it("rejects an id that neither the database nor the fixture mirror holds", async () => {
      givenPersistedPet(null);
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("itest-no-such-animal", "Ghost"));

      // The old check was `pet && pet.isArchived`, which is false when nothing matched — so the
      // submission went straight through and an application was written against an id that
      // exists nowhere. This is the one case an `itest-` id does discriminate.
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/could not find that animal/i);
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });

    it("rejects a case-variant when the database is authoritative", async () => {
      // Scope stated honestly, because it changed under this test's feet. `findUnique` is
      // case-sensitive and finds no `PET-001`; since `findServerPetByIdAsync` began returning
      // null after a successful empty read, that is the whole story and this is refused by the
      // `!pet` branch. It no longer reaches the exact-id comparison at all — deleting
      // `pet.id !== requestedPetId` leaves this test green. The test below is the one that
      // covers the comparison.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", isArchived: true }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("PET-001"));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/could not find that animal/i);
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });

    it("rejects a case-variant on the mirror route, where the fixture still answers", async () => {
      // The route the exact-id comparison exists for, and the only one that still reaches it.
      //
      // With no database configured — every offline deployment, and the shape an outage falls
      // back to — `findServerPetByIdAsync` never queries and hands straight to the mirror, whose
      // lookup lowercases. `src/data/pets.json` holds `pet-001` as Available and unarchived, so a
      // posted `PET-001` resolves to fixture Bella under an id that is *not* the one requested.
      // Without the comparison the submission is accepted against her.
      //
      // `isStrictPersistence()` reads the flag on every call rather than capturing it at import,
      // which is what makes this stub work inside an already-loaded module — see
      // `src/lib/persistenceMode.ts`.
      vi.stubEnv("STRICT_PERSISTENCE", "false");
      try {
        const { submitApplication } = await import("@/actions/applications");

        const result = await submitApplication(applicationFor("PET-001"));

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/could not find that animal/i);
        // Proves the mirror answered rather than the database: this is the path where a pet
        // comes back and its id differs from the one posted.
        expect(prismaDouble.pet.findUnique).not.toHaveBeenCalled();
        expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("still accepts the exact id on that same route", async () => {
      // The comparison must not have cost the offline deployment its adoptions.
      vi.stubEnv("STRICT_PERSISTENCE", "false");
      try {
        const { submitApplication } = await import("@/actions/applications");

        const result = await submitApplication(applicationFor("pet-001"));

        expect(result.success).toBe(true);
        expect(result.data?.petName).toBe("Bella");
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe("the animal must not be archived", () => {
    it("reads the archive flag from the database, not from pets.json", async () => {
      // The whole of defect 1. `pet-001` is Available and unarchived in the fixture the mirror is
      // seeded from, so the old synchronous read saw an adoptable animal and accepted. Only a
      // reader that reached Postgres can see the archive arranged here.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", isArchived: true }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/archived/i);
      // Proves the read actually went to the database rather than the mirror; the broken action
      // never called `findUnique` at all.
      expect(prismaDouble.pet.findUnique).toHaveBeenCalled();
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });
  });

  describe("the animal must be adoptable", () => {
    it("rejects an application for an adopted animal", async () => {
      // Defect 3. The fixture says Available; the database says this animal has gone home.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Adopted" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not currently accepting adoption applications/i);
      expect(result.error).toContain("Adopted");
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });

    it("rejects an application for an animal whose adoption is already pending", async () => {
      // Pending sits in the adoptable *track* so the catalogue keeps it beside Available, but it
      // is not adoptable: the detail page renders its button disabled on purpose. See
      // `tasks/decisions/2026-09-10-pending-is-a-stage-of-adoption-not-a-track.md`.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Pending" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not currently accepting adoption applications/i);
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });

    it("does NOT yet refuse an animal whose stored status is an unrecognised spelling", async () => {
      // Pinning a gap, not endorsing it. `fromDbPetStatus` compares four exact, case-sensitive
      // spellings and returns "Available" for anything else, so a column holding `adopted`
      // arrives here as Available and this guard — which refuses `Adopted` — lets it through.
      // The fail-closed fallback in `getPetStatusPresentation` never sees it, because the mapper
      // resolved it first.
      //
      // The production branch has held `Pet.status` as text rather than the `PetStatus` enum,
      // which is where such a value survives. When the mapper is fixed this test flips, and it is
      // written to be found at that moment: `tasks/open/an-unknown-pet-status-reads-as-available.md`.
      // `DbPetRecord.status` is `PrismaPetStatus | string`, which is the point: the column can
      // hold text the enum would have refused.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "adopted" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(true);
    });

    it("rejects an application for an animal in rehabilitation", async () => {
      givenPersistedPet(
        makeDbPet({ id: "pet-001", name: "Bella", status: "In Rehabilitation" })
      );
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(false);
      expect(prismaDouble.adoptionApplication.create).not.toHaveBeenCalled();
    });
  });

  describe("an adoptable animal still goes through", () => {
    it("accepts the application and writes it", async () => {
      // The guards must not have cost the ordinary path anything. Without this, every assertion
      // above is satisfied by an action that refuses everything.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Available" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(true);
      expect(result.data?.petId).toBe("pet-001");
      expect(prismaDouble.adoptionApplication.create).toHaveBeenCalledTimes(1);
    });

    it("stores the verified animal's own id, not the string that was posted", async () => {
      // `applicationFormSchema` does not trim, and the guard compares `validated.petId.trim()`.
      // Writing the request's copy meant a posted `" pet-001 "` passed every check and was then
      // written with its whitespace into a column carrying a foreign key to `Pet.id`. Prisma
      // raises P2003, which `handlePersistenceError(…, "write")` swallows outside strict mode, so
      // the row never reached the database while the applicant was told `success: true`.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Available" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("  pet-001  "));

      expect(result.success).toBe(true);
      expect(result.data?.petId).toBe("pet-001");
      expect(prismaDouble.adoptionApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ petId: "pet-001" }) })
      );
    });

    it("stores the verified animal's own name, not the one that was posted", async () => {
      // `petName` is not decoration downstream. `atomicUpdateApplicationStatus` auto-rejects other
      // open applications matching on `petName` as well as `petId`, and `markCachedPetAdopted`
      // marks the first pet matching *either* id or name — so an application naming an animal it
      // was not for could close that animal's real applications on approval and flip the wrong
      // pet to Adopted.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Available" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001", "Max"));

      expect(result.success).toBe(true);
      expect(result.data?.petName).toBe("Bella");
      expect(prismaDouble.adoptionApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ petName: "Bella" }) })
      );
    });

    it("snapshots the animal's breed, which the record is supposed to keep", async () => {
      // `petBreed` was never written at all. The column exists so the record survives `petId`
      // going null under `onDelete: SetNull` — `prisma/schema.prisma` calls it a snapshot with
      // the "same rationale as petName" — and the tracking portal's `pet?.breed || app.petBreed`
      // was carried entirely by re-reading the live animal, so it showed nothing once that
      // animal was gone, which is exactly the case the column is for.
      givenPersistedPet(
        makeDbPet({ id: "pet-001", name: "Bella", breed: "Kampung Mix", status: "Available" })
      );
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(true);
      expect(prismaDouble.adoptionApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ petBreed: "Kampung Mix" }) })
      );
    });

    it("accepts an animal that exists only in the database", async () => {
      // The converse of the mirror defect: an animal absent from `pets.json` must not be refused
      // as unknown just because a cold process has not loaded the catalogue.
      givenPersistedPet(makeDbPet({ id: "itest-db-only", name: "Database Only" }));
      const { submitApplication } = await import("@/actions/applications");

      const result = await submitApplication(applicationFor("itest-db-only", "Database Only"));

      expect(result.success).toBe(true);
      expect(prismaDouble.adoptionApplication.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("the lookup sits behind the rate limits", () => {
    it("does not query the database once the caller's budget is spent", async () => {
      // The pet lookup used to run *above* the rate limits, which was free when it read an
      // in-memory array and is a Postgres round trip now that it does not. An unauthenticated
      // POST must not be able to drive one `findUnique` per request with nothing bounding it.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", status: "Available" }));
      const { submitApplication } = await import("@/actions/applications");

      // The per-email budget is 10 per 10 minutes; the harness resets the limiter between tests.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await submitApplication(applicationFor("pet-001"))).success).toBe(true);
      }
      prismaDouble.pet.findUnique.mockClear();

      const result = await submitApplication(applicationFor("pet-001"));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/rate limit/i);
      expect(prismaDouble.pet.findUnique).not.toHaveBeenCalled();
    });
  });
});
