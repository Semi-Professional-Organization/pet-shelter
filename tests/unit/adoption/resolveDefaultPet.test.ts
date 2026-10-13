import { describe, it, expect } from "vitest";
import { resolveDefaultPet } from "@/hooks/useAdoptionFormController";
import {
  PET_STATUS_SEQUENCE,
  getPetStatusPresentation,
} from "@/lib/presentation/petStatusPresentation";
import { Pet, PetStatus } from "@/types/pet";

/**
 * Tier 2 — the animal the adoption form opens on.
 *
 * `resolveDefaultPet` had two defects, both from the fifth review of PR #38 and both recorded in
 * `tasks/open/submit-application-checks-a-fixture-and-no-status.md`:
 *
 *  - a `allPets[0]` last resort taken whatever that animal's status, so a shelter with no
 *    adoptable animal opened the form pre-filled for one that cannot be adopted;
 *  - `status === "Available"` as the definition of adoptable, where the gallery's preselect
 *    uses `getPetStatusPresentation(status).isAdoptable`.
 *
 * It had no test of any kind before this file.
 */

function makePet(id: string, status: PetStatus): Pet {
  return {
    id,
    name: `Pet ${id}`,
    species: "dog",
    breed: "Local Mixed",
    age: "2 years",
    ageCategory: "adult",
    gender: "Male",
    size: "Medium",
    weight: "14 kg",
    status,
    adoptionFee: "Free",
    description: "",
    rescueStory: "",
    image: "https://example.com/pet.jpg",
    galleryImages: [],
    tags: [],
    featured: false,
    intakeDate: "2026-06-01",
    isArchived: false,
    deletedAt: null,
    medical: { vaccinated: true, microchipped: true, spayedNeutered: true },
    compatibility: {
      goodWithDogs: true,
      goodWithCats: true,
      goodWithKids: true,
      energyLevel: "Moderate",
    },
  } as Pet;
}

describe("resolveDefaultPet", () => {
  it("prefers an explicitly selected animal", () => {
    const selected = makePet("chosen", "Available");

    expect(resolveDefaultPet(selected, [makePet("other", "Available")])).toBe(selected);
  });

  it("returns a selected animal even when it is not adoptable", () => {
    // Deliberate, and the boundary is the server. Opening the form from a specific animal's page
    // should headline that animal; `submitApplication` is what refuses the submission. Changing
    // this would make the dialog title disagree with the page that opened it.
    const selected = makePet("chosen", "Adopted");

    expect(resolveDefaultPet(selected, [makePet("other", "Available")])).toBe(selected);
  });

  it("skips non-adoptable animals to reach the first adoptable one", () => {
    const pets = [
      makePet("adopted", "Adopted"),
      makePet("rehab", "In Rehabilitation"),
      makePet("available", "Available"),
    ];

    expect(resolveDefaultPet(null, pets)?.id).toBe("available");
  });

  it("returns null rather than the first animal when none is adoptable", () => {
    // The regression. This list's head is an adopted animal, which the old `|| allPets[0]` last
    // resort returned — so the form opened pre-filled for an animal who had already gone home,
    // and the server accepted the application because it checked no status either.
    const pets = [
      makePet("adopted", "Adopted"),
      makePet("pending", "Pending"),
      makePet("rehab", "In Rehabilitation"),
    ];

    expect(resolveDefaultPet(null, pets)).toBeNull();
  });

  it("returns null for an empty shelter", () => {
    // Not a new state for the callers: `allPets` is empty on a cold `/adopt` render, so both
    // consumers have always had to handle `null` here.
    expect(resolveDefaultPet(null, [])).toBeNull();
  });

  it("defines adoptable by the shared presentation, for every status", () => {
    // The two definitions agree today — `isAdoptable` is true for exactly `Available` — so no
    // single example can tell them apart. This asserts the coupling instead: whatever
    // `getPetStatusPresentation` says about a status is what this function does with it. A new
    // alias, or a decision that some other status may be applied for, lands here rather than
    // splitting the form away from the gallery in silence.
    for (const status of PET_STATUS_SEQUENCE) {
      const pets = [makePet("only", status)];
      const expected = getPetStatusPresentation(status).isAdoptable ? "only" : null;

      expect(resolveDefaultPet(null, pets)?.id ?? null).toBe(expected);
    }
  });

  it("treats the legacy Rehabilitation spelling as non-adoptable", () => {
    // The alias never reaches `PET_STATUS_SEQUENCE`, so the loop above cannot cover it. Going
    // through the presentation is what normalizes it; a raw string comparison would too, but
    // only by accident of both spellings differing from "Available".
    expect(resolveDefaultPet(null, [makePet("legacy", "Rehabilitation" as PetStatus)])).toBeNull();
  });
});
