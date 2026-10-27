import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePetStore } from "@/lib/client/petStore";
import type { PetFormInput } from "@/lib/validations/pet";
import type { Pet } from "@/types/pet";

/**
 * Issue #107, client side. The admin edit dialog sends neither `updates` nor `medicalTimeline`, so
 * the local store must read an absent collection as "not touched", the same as the server action
 * (`tests/unit/petHistory.test.ts`). Only a submitted list, `[]` included, replaces it.
 */
function formFrom(pet: Pet): PetFormInput {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    birthDate: pet.birthDate,
    gender: pet.gender,
    size: pet.size,
    weight: pet.weight,
    status: pet.status,
    description: pet.description,
    image: pet.image,
    tags: pet.tags,
  } as PetFormInput;
}

describe("usePetStore.updatePet history", () => {
  beforeEach(() => localStorage.clear());

  it("keeps both collections when the edit omits them", () => {
    const { result } = renderHook(() => usePetStore());
    const pet = result.current.pets.find((p) => p.id === "pet-009")!;
    expect(pet.medicalTimeline?.length).toBeGreaterThan(0);
    expect(pet.updates?.length).toBeGreaterThan(0);

    act(() => {
      result.current.updatePet(pet.id, { ...formFrom(pet), name: "Tuah Renamed" });
    });

    const saved = result.current.pets.find((p) => p.id === "pet-009")!;
    expect(saved.name).toBe("Tuah Renamed");
    expect(saved.medicalTimeline?.map((e) => e.id).sort()).toEqual(
      pet.medicalTimeline!.map((e) => e.id).sort()
    );
    expect(saved.updates?.map((u) => u.id).sort()).toEqual(pet.updates!.map((u) => u.id).sort());
  });

  it("clears both collections when the edit submits empty lists", () => {
    const { result } = renderHook(() => usePetStore());
    const pet = result.current.pets.find((p) => p.id === "pet-009")!;

    act(() => {
      result.current.updatePet(pet.id, { ...formFrom(pet), updates: [], medicalTimeline: [] });
    });

    const saved = result.current.pets.find((p) => p.id === "pet-009")!;
    expect(saved.medicalTimeline ?? []).toEqual([]);
    expect(saved.updates ?? []).toEqual([]);
  });
});
