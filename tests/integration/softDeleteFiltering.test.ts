import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";
import { signInAs } from "../setup/authSession";
// Static, not imported inside each test: `vi.mock` is hoisted above every
// import in this file, so the actions bind to the double either way, and a
// dynamic import only made the first test load the whole action graph against
// its own 5 s timeout.
import { getAdminPets, getPetById, getPublicPets } from "@/actions/pets";

/**
 * Tier 3a — soft-delete filtering under `STRICT_PERSISTENCE=true`.
 *
 * The point of this tier is that a *persisted* archive flag decides what the
 * public catalogue shows. Tier 2 already covers the pure predicates; what this
 * file adds is the join between the repository read, the mapper, and the
 * action's filter, with the in-memory fallback switched off — so a read that
 * failed, or that served `pets.json` instead of the rows, fails here rather
 * than passing on fixtures.
 *
 * What it does not check is the query itself. The Prisma double answers
 * `pet.findMany` and `pet.findUnique` with whatever rows a test arranged and
 * ignores their `where`, `include` and `orderBy`, so a renamed column in a
 * filter or a dropped `include` passes here. The rows also come from
 * `makeDbPet`, built to the mapper's own `DbPetRecord` rather than the schema,
 * so a schema column renamed under the mapper passes too. The `include` is
 * pinned by its call arguments in `tests/unit/petHistory.test.ts`; the rest
 * needs a real database.
 */

/**
 * An async factory, because `vi.mock` is hoisted above this file's imports and
 * so cannot close over anything at module scope. Building the double inside it
 * and reading it back with `getPrismaDouble()` is what gives the tests a handle.
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

const ARCHIVED = makeDbPet({
  id: "itest-archived",
  name: "Archived Rescue",
  isArchived: true,
  deletedAt: "2026-08-01T00:00:00.000Z",
});
const ACTIVE = makeDbPet({ id: "itest-active", name: "Active Rescue", isArchived: false });
const REHAB = makeDbPet({
  id: "itest-rehab",
  name: "Rehab Rescue",
  status: "In Rehabilitation",
  rehabStage: "Recovery",
  rehabStageMs: "Pemulihan",
  rehabProgressPercent: 60,
});

/** Arranges the persisted catalogue the repository will read. */
function givenPersistedPets(rows = [ACTIVE, ARCHIVED, REHAB]) {
  prismaDouble.pet.findMany.mockResolvedValue(rows);
}

beforeEach(() => {
  resetPrismaDouble(prismaDouble);
});

describe("soft-delete filtering under strict persistence", () => {
  it("runs with the fallback disabled", async () => {
    const { isStrictPersistence } = await import("@/lib/persistenceMode");

    // Guards every assertion below. Without strict mode a failing query would
    // be swallowed and served from fixtures, and each test would still pass.
    expect(isStrictPersistence()).toBe(true);
  });

  describe("public catalogue", () => {
    it("serves persisted rows rather than the bundled fixtures", async () => {
      givenPersistedPets();

      const pets = await getPublicPets();

      // `pets.json` contains none of these names, so matching them proves the
      // read reached the repository and the mapper rather than the fallback.
      expect(pets.map((p) => p.name)).toEqual(["Active Rescue", "Rehab Rescue"]);
    });

    it("excludes an archived animal", async () => {
      givenPersistedPets();

      const pets = await getPublicPets();

      expect(pets.some((p) => p.id === "itest-archived")).toBe(false);
    });

    it("excludes it however the caller filters", async () => {
      givenPersistedPets([makeDbPet({ id: "itest-archived-dog", species: "dog", isArchived: true })]);

      // The archive check must precede every other predicate; a filter that
      // narrowed first and archived second would leak the row here.
      expect(await getPublicPets({ species: "dog" })).toHaveLength(0);
      expect(await getPublicPets({ status: "Available" })).toHaveLength(0);
      expect(await getPublicPets({ search: "archived" })).toHaveLength(0);
    });

    it("preserves persisted rehabilitation progress through the mapper", async () => {
      givenPersistedPets();

      const rehab = (await getPublicPets()).find((p) => p.id === "itest-rehab");

      expect(rehab).toMatchObject({
        status: "In Rehabilitation",
        rehabStage: "Recovery",
        rehabStageMs: "Pemulihan",
        rehabProgressPercent: 60,
      });
    });

    it("matches the legacy Rehabilitation spelling against the canonical one", async () => {
      givenPersistedPets([makeDbPet({ id: "itest-legacy", status: "Rehabilitation" })]);

      const pets = await getPublicPets({ status: "In Rehabilitation" });

      expect(pets.map((p) => p.id)).toEqual(["itest-legacy"]);
    });
  });

  describe("public profile read", () => {
    /** Arranges the single row `findServerPetByIdAsync` will read. */
    function givenPersistedPet(row: ReturnType<typeof makeDbPet> | null) {
      prismaDouble.pet.findUnique.mockResolvedValue(row);
    }

    it("serves a persisted animal rather than the bundled fixture", async () => {
      givenPersistedPet(ACTIVE);

      const pet = await getPetById("itest-active");

      // `pets.json` holds no animal by this name, so matching it proves the read reached the
      // database rather than the in-memory mirror.
      expect(pet).toMatchObject({ id: "itest-active", name: "Active Rescue" });
      expect(prismaDouble.pet.findUnique).toHaveBeenCalled();
    });

    it("returns null for an animal archived in the database", async () => {
      // The id is deliberately `pet-001` — a real row in `src/data/pets.json`, present in the
      // fallback mirror and *not* archived there.
      //
      // That is the whole regression. The action used to read the synchronous repository
      // helper, which only searches that mirror; a cold process initialises it from the
      // fixture, so an archive performed anywhere else was invisible and the profile page
      // served the fixture animal. With an `itest-` id this test passes against the broken
      // reader too — the mirror has no such row, so it returns null for the wrong reason —
      // which is exactly the shape of assertion that makes a suite look green over a live bug.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", isArchived: true }));

      expect(await getPetById("pet-001")).toBeNull();
    });

    it("finds an animal that exists only in the database", async () => {
      // The converse of the same defect: a pet absent from the fixture mirror used to 404 on
      // any instance that had not already loaded the catalogue.
      givenPersistedPet(makeDbPet({ id: "itest-db-only", name: "Database Only" }));

      expect(await getPetById("itest-db-only")).toMatchObject({ id: "itest-db-only" });
    });

    it("returns null for an id that neither the database nor the fallback knows", async () => {
      // Scope stated honestly: this is the trivial path. `itest-no-such-animal` is in no row and
      // no fixture, so *every* reader returns null for it and this test cannot tell a correct
      // action from a broken one. It used to be named "returns null when the row does not
      // exist", which read as coverage of the fallback case below. It is not.
      //
      // The case it looks like it covers — an id the database lacks and the *fixture holds* —
      // lives in `petMissingRowIsAnAnswer.test.ts`, which uses `pet-001` for that reason.
      givenPersistedPet(null);

      expect(await getPetById("itest-no-such-animal")).toBeNull();
    });

    it("does not serve an archived animal through a case-variant of its id", async () => {
      // The bypass. `findUnique` is case-sensitive and finds no `PET-001`; the repository then
      // falls through to the in-memory mirror, whose lookup lowercases — and the mirror, seeded
      // from `src/data/pets.json`, holds `pet-001` unarchived. So the database's archive was
      // visible at `/pets/pet-001` and invisible at `/pets/PET-001`.
      //
      // `pet-001` is used deliberately, not an `itest-` id: an id absent from the fixture makes
      // the mirror return null too, and the test would pass against the broken reader for the
      // wrong reason — exactly what the test above does.
      //
      // The database is modelled as Postgres behaves: it *holds* the archived row, and returns it
      // only for the exact id. An earlier version mocked `null` for every id, which pinned "a
      // case-variant URL 404s" without ever arranging an archive to hide.
      const archived = makeDbPet({ id: "pet-001", name: "Bella", isArchived: true });
      prismaDouble.pet.findUnique.mockImplementation(async (args?: { where?: { id?: string } }) =>
        args?.where?.id === "pet-001" ? archived : null
      );

      // Variants first. Reading `pet-001` syncs the archived row into the mirror, after which the
      // mirror would hide the animal on its own and the variants would pass without the guard.
      expect(await getPetById("PET-001")).toBeNull();
      expect(await getPetById("Pet-001")).toBeNull();
      expect(await getPetById("pet-001")).toBeNull();
    });

    it("still serves the animal at its exact id", async () => {
      // The guard is an exact-id match, so it must not have cost the canonical URL anything.
      givenPersistedPet(makeDbPet({ id: "pet-001", name: "Bella", isArchived: false }));

      expect(await getPetById("pet-001")).toMatchObject({ id: "pet-001", name: "Bella" });
    });
  });

  describe("admin catalogue", () => {
    // getAdminPets() is authorization-guarded: /admin/pets is a Server
    // Component that calls it directly, so an unguarded read shipped the whole
    // inventory to anonymous visitors in the RSC payload. These tests are about
    // filtering, not authorization, so they hold a real session.
    beforeEach(async () => {
      await signInAs("ADMIN");
    });

    it("includes archived animals the public catalogue hides", async () => {
      givenPersistedPets();

      const pets = await getAdminPets();

      // Soft deletion has to stay reversible from the admin surface; an admin
      // query that inherited the public filter would strand the record.
      expect(pets.map((p) => p.id)).toContain("itest-archived");
    });

    it("reports the archive flag and deletion timestamp it read back", async () => {
      givenPersistedPets();

      const archived = (await getAdminPets()).find((p) => p.id === "itest-archived");

      expect(archived?.isArchived).toBe(true);
      expect(archived?.deletedAt).toBeTruthy();
    });
  });

  describe("strict mode surfaces failures instead of masking them", () => {
    it("rejects when the catalogue query fails", async () => {
      prismaDouble.pet.findMany.mockRejectedValue(new Error("relation \"pets\" does not exist"));

      // The behaviour this whole tier exists for. Outside strict mode this same
      // call resolves with fixture data and reports a healthy catalogue while
      // the schema is broken.
      await expect(getPublicPets()).rejects.toThrow(/relation "pets" does not exist/);
    });

    it("propagates the original error rather than a wrapper", async () => {
      class PrismaKnownRequestError extends Error {
        code = "P2022";
      }
      prismaDouble.pet.findMany.mockRejectedValue(new PrismaKnownRequestError("column missing"));

      // The Prisma error code is the detail that names the broken column, so a
      // wrapper here would cost the diagnosis this tier is meant to deliver.
      await expect(getPublicPets()).rejects.toMatchObject({ code: "P2022" });
    });

    it("returns an empty array without falling back to fixtures when the database is merely empty", async () => {
      prismaDouble.pet.findMany.mockResolvedValue([]);

      // An empty table is an answer, not an outage — returns [] without falling back.
      const pets = await getPublicPets();
      expect(pets).toEqual([]);
    });
  });
});
