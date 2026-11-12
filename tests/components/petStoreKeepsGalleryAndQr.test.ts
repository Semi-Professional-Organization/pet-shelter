import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePetStore } from "@/lib/client/petStore";
import type { PetFormInput } from "@/lib/validations/pet";

/**
 * #212, client half. `usePetStore` never copied `galleryImages` or `customQrUrl`, on an edit or on
 * a new record, so a reload without `initialPets` read the old gallery and QR back out of
 * `localStorage`. Each test saves, unmounts, and reads the result through a fresh store, which is
 * what a reload does.
 */

const GALLERY = ["/uploads/1730-added-a.webp", "/uploads/1730-added-b.webp"];
const QR = "/uploads/1730-fund-qr.webp";

const newPetForm = (): PetFormInput => ({
  name: "Gallery Test",
  species: "cat",
  breed: "Domestic Shorthair",
  birthDate: "2025-01-10",
  gender: "Male",
  size: "Small",
  weight: "4 kg",
  status: "Available",
  adoptionFee: "Free",
  description: "A cat added by this test.",
  rescueStory: "Found by this test.",
  image: "/images/cat.jpg",
  tags: ["Calm"],
  intakeDate: "2026-03-01",
});

/** A fresh store reading what the previous one left in `localStorage`. */
function reloadStore() {
  return renderHook(() => usePetStore()).result;
}

describe("usePetStore keeps the gallery and QR it saves", () => {
  beforeEach(() => localStorage.clear());

  it("after updatePet, a reloaded store has the submitted gallery and QR", () => {
    const { result, unmount } = renderHook(() => usePetStore());
    const pet = result.current.pets.find((p) => p.id === "pet-009")!;
    expect(pet.galleryImages ?? []).not.toEqual(GALLERY);
    expect(pet.customQrUrl).not.toBe(QR);

    act(() => {
      result.current.updatePet(pet.id, {
        ...newPetForm(),
        name: pet.name,
        galleryImages: GALLERY,
        customQrUrl: QR,
      });
    });
    unmount();

    const reloaded = reloadStore().current.pets.find((p) => p.id === "pet-009")!;
    expect(reloaded.galleryImages).toEqual(GALLERY);
    expect(reloaded.customQrUrl).toBe(QR);
  });

  it("after addPet, a reloaded store has the new pet's gallery and QR", () => {
    const { result, unmount } = renderHook(() => usePetStore());
    let createdId = "";
    act(() => {
      createdId = result.current.addPet({ ...newPetForm(), galleryImages: GALLERY, customQrUrl: QR }).id;
    });
    unmount();

    const reloaded = reloadStore().current.pets.find((p) => p.id === createdId)!;
    expect(reloaded.galleryImages).toEqual(GALLERY);
    expect(reloaded.customQrUrl).toBe(QR);
  });
});
