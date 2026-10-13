import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";

/**
 * Tier 3a — approving an adoption marks the animal the application names, and not whichever
 * animal happens to sit earlier in the in-memory mirror.
 *
 * `markCachedPetAdopted` used to take the first entry matching *either* identifier:
 *
 *     serverPets.find((p) => p.id === petId || p.name.toLowerCase() === petName.toLowerCase())
 *
 * `find` walks the array in order, so a **name** match on an earlier entry beat the exact **id**
 * match on a later one. Two shelter animals sharing a name is enough, and `pets.json` ships
 * common ones.
 *
 * What made that reachable rather than theoretical: the array's order is publicly influenceable.
 * `findServerPetByIdAsync` moves every animal it reads to the front of the mirror, and that read
 * sits behind an anonymous profile GET and — since the adoption submission guards landed — an
 * unauthenticated POST, before any check the submission would fail. So the caller chooses which
 * of two same-named animals is first, and `atomicUpdateApplicationStatus` then marks that one
 * Adopted on approval and writes *its* id into the `PET_STATUS_TRANSITION_ADOPTED` audit row.
 * The wrong animal is recorded as adopted, not merely cached as adopted.
 *
 * `tasks/open/a-public-post-can-reorder-the-pet-mirror.md` asks for exactly this test.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return {
    prisma: double,
    default: double,
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
  };
});

/** Two different animals, one shared name. The defect needs nothing more exotic than this. */
const BELLA_ASKED_FOR = makeDbPet({ id: "itest-bella-asked-for", name: "Bella" });
const BELLA_DECOY = makeDbPet({ id: "itest-bella-decoy", name: "Bella" });

let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(double);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** Loads the mirror from the database, the way a catalogue read does. */
async function givenMirrorHoldsBothBellas() {
  double.pet.findMany.mockResolvedValue([BELLA_ASKED_FOR, BELLA_DECOY]);
  const { getServerPetsAsync } = await import("@/lib/server/petRepository");
  await getServerPetsAsync();
}

describe("approval marks the animal the application names", () => {
  it("prefers the exact id even when a same-named animal sits first", async () => {
    await givenMirrorHoldsBothBellas();
    const { findServerPetByIdAsync, getServerPets, markCachedPetAdopted } = await import(
      "@/lib/server/petRepository"
    );

    // The public half of the attack, performed exactly as a visitor would: read the decoy's
    // profile, which moves it to the head of the shared mirror.
    double.pet.findUnique.mockResolvedValue(BELLA_DECOY);
    await findServerPetByIdAsync("itest-bella-decoy");

    // Arrangement proof. Without this the test could pass because the reorder never happened,
    // which would make it green against the defect it is supposed to catch.
    expect(getServerPets()[0].id).toBe("itest-bella-decoy");

    const adopted = markCachedPetAdopted("itest-bella-asked-for", "Bella");

    // The whole point: the id that was asked for wins over the name that came first.
    expect(adopted?.id).toBe("itest-bella-asked-for");
    expect(adopted?.status).toBe("Adopted");
  });

  it("marks only that animal, leaving the decoy alone", async () => {
    await givenMirrorHoldsBothBellas();
    const { findServerPetByIdAsync, getServerPets, markCachedPetAdopted } = await import(
      "@/lib/server/petRepository"
    );

    double.pet.findUnique.mockResolvedValue(BELLA_DECOY);
    await findServerPetByIdAsync("itest-bella-decoy");
    markCachedPetAdopted("itest-bella-asked-for", "Bella");

    // The caller writes the returned id into a `PET_STATUS_TRANSITION_ADOPTED` audit row, so a
    // wrong match is a wrong permanent record, not just a stale cache entry. Asserting the
    // decoy's status as well as the target's catches a fix that marked both.
    const mirror = getServerPets();
    expect(mirror.find((p) => p.id === "itest-bella-asked-for")?.status).toBe("Adopted");
    expect(mirror.find((p) => p.id === "itest-bella-decoy")?.status).not.toBe("Adopted");
  });

  it("still matches on name when the application carries no id at all", async () => {
    // Applications predating the `petId` column reach this with an empty string, and the name is
    // the only identifier there is. Narrowing must not stop those resolving.
    //
    // Asserted on the *id*, not the name. Both mirror entries are called Bella, so
    // `?.name === "Bella"` is satisfied by either and would stay green if this picked the decoy
    // — the exact outcome this file exists to prevent. With no id to disambiguate, first wins,
    // and `givenMirrorHoldsBothBellas` loads them in a known order.
    await givenMirrorHoldsBothBellas();
    const { markCachedPetAdopted } = await import("@/lib/server/petRepository");

    expect(markCachedPetAdopted("", "Bella")?.id).toBe("itest-bella-asked-for");
  });

  it("refuses an id the mirror does not hold rather than guessing by name", async () => {
    // The hole a reordering-only fix leaves open, and the reason this is not merely a tidier
    // lookup. `applicationFormSchema` validates `petId` as a non-empty string and nothing else,
    // and `submitApplication` accepts an unknown one, so this argument is attacker-chosen.
    //
    // Falling back to the name here would let a submission for a pet that does not exist be
    // resolved against whichever same-named animal the attacker floated to the front — and
    // `atomicUpdateApplicationStatus` keys its `tx.pet.updateMany` on that same missing id, so
    // the database matches 0 rows while the mirror and the audit log record an adoption.
    await givenMirrorHoldsBothBellas();
    const { findServerPetByIdAsync, markCachedPetAdopted } = await import(
      "@/lib/server/petRepository"
    );

    double.pet.findUnique.mockResolvedValue(BELLA_DECOY);
    await findServerPetByIdAsync("itest-bella-decoy");

    expect(markCachedPetAdopted("itest-no-such-pet", "Bella")).toBeNull();
  });

  it("normalises the id it is given, the way every other reader here does", async () => {
    // `findServerPetById` and `findServerPetByIdAsync` both `trim().toLowerCase()`, and nothing
    // on the submit path trims `petId`. An exact `===` would miss a padded or miscased id that
    // passed the submit-time archive check — and drop it into the name fallback, reopening the
    // case above with no forgery at all.
    await givenMirrorHoldsBothBellas();
    const { markCachedPetAdopted } = await import("@/lib/server/petRepository");

    expect(markCachedPetAdopted("  ITEST-Bella-Asked-For  ", "Bella")?.id).toBe(
      "itest-bella-asked-for"
    );
  });

  it("returns null when neither the id nor the name matches", async () => {
    await givenMirrorHoldsBothBellas();
    const { markCachedPetAdopted } = await import("@/lib/server/petRepository");

    expect(markCachedPetAdopted("itest-nobody", "Nobody")).toBeNull();
  });
});
