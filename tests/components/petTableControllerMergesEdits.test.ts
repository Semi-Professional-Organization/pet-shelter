import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Pet } from "@/types/pet";
import type { PetFormInput } from "@/lib/validations/pet";

/**
 * #212, review round 1. The admin table's optimistic row was built by spreading the form over the
 * row, so the form's flat `vaccinated` landed beside a stale nested `medical`. The dialog resets
 * from the nested copy, so reopening the row and saving again wrote the old flag back. The row is
 * now built with the shared `mergePetEdit`.
 *
 * The Server Actions are doubled: this is about the row the table shows, not the write.
 */
vi.mock("@/actions/pets", () => ({
  createPet: vi.fn().mockResolvedValue({ success: true }),
  updatePet: vi.fn().mockResolvedValue({ success: true }),
  toggleArchivePet: vi.fn().mockResolvedValue({ success: true }),
  updatePetStatus: vi.fn().mockResolvedValue({ success: true }),
}));

import { usePetTableController } from "@/hooks/usePetTableController";

const row = (): Pet & { applicationCount: number } => ({
  id: "db-only-pet",
  name: "Row",
  species: "dog",
  breed: "Local Mixed",
  age: "2 years",
  ageCategory: "young",
  gender: "Female",
  size: "Medium",
  weight: "18 kg",
  tags: ["Calm"],
  description: "Stored description.",
  rescueStory: "Stored rescue story.",
  image: "/images/row.jpg",
  galleryImages: [],
  status: "Available",
  customQrUrl: "/uploads/stored-qr.png",
  medical: { vaccinated: true, microchipped: true, spayedNeutered: true },
  compatibility: { goodWithDogs: true, goodWithCats: true, goodWithKids: true, energyLevel: "Moderate" },
  intakeDate: "2026-04-01",
  birthDate: "2024-06-12",
  birthDateIsEstimate: true,
  adoptionFee: "Free",
  applicationCount: 3,
});

/** What the dialog submits for `row()`: its parsed form, every key present. */
const dialogForm = (): PetFormInput => ({
  name: "Row",
  species: "dog",
  breed: "Local Mixed",
  birthDate: "2024-06-12",
  birthDateIsEstimate: true,
  gender: "Female",
  size: "Medium",
  weight: "18 kg",
  status: "Available",
  adoptionFee: "Free",
  description: "Stored description.",
  rescueStory: "Stored rescue story.",
  image: "/images/row.jpg",
  galleryImages: [],
  tags: ["Calm"],
  featured: false,
  intakeDate: "2026-04-01",
  customQrUrl: "/uploads/stored-qr.png",
  vaccinated: true,
  microchipped: true,
  spayedNeutered: true,
  specialNeeds: "",
  goodWithDogs: true,
  goodWithCats: true,
  goodWithKids: true,
  energyLevel: "Moderate",
  isArchived: false,
});

async function saveEdit(form: PetFormInput) {
  const { result } = renderHook(() => usePetTableController([row()]));
  act(() => result.current.handlers.handleOpenEdit(result.current.state.pets[0]));
  await act(async () => {
    await result.current.handlers.handleFormSubmit(form);
  });
  return result.current.state.pets.find((p) => p.id === "db-only-pet")!;
}

describe("usePetTableController's optimistic row after an edit", () => {
  beforeEach(() => localStorage.clear());

  it("carries an unticked medical flag in the nested medical object", async () => {
    const saved = await saveEdit({ ...dialogForm(), vaccinated: false, goodWithCats: false });

    expect(saved.medical.vaccinated).toBe(false);
    expect(saved.compatibility.goodWithCats).toBe(false);
    // No flat form keys beside the nested ones for the dialog to disagree with.
    expect(saved).not.toHaveProperty("vaccinated");
    expect(saved).not.toHaveProperty("goodWithCats");
    // The merge starts from the row, so the table-only count survives it.
    expect((saved as Pet & { applicationCount?: number }).applicationCount).toBe(3);
  });

  it("stores an emptied QR as null, as the server does", async () => {
    const saved = await saveEdit({ ...dialogForm(), customQrUrl: "" });

    expect(saved.customQrUrl).toBeNull();
  });
});
