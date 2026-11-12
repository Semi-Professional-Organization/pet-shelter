import { describe, it, expect } from "vitest";
import { buildNewPet, mergePetEdit } from "@/lib/domain/petEdit";
import { petEditSchema, petFormSchema, type PetFormInput } from "@/lib/validations/pet";
import type { Pet } from "@/types/pet";

/**
 * The one rule both copies of an admin pet edit now go through (#212): `usePetStore` and the
 * `updatePet` / `createPet` Server Actions. An absent key keeps what is stored; a submitted value
 * replaces it; only a new record states defaults.
 */

const stored = (): Pet => ({
  id: "pet-stored",
  name: "Stored",
  species: "dog",
  breed: "Local Mixed",
  age: "stale prose",
  ageCategory: "senior",
  gender: "Female",
  size: "Medium",
  weight: "18 kg",
  tags: ["Calm"],
  description: "Stored description.",
  rescueStory: "Stored rescue story.",
  image: "/images/stored.jpg",
  galleryImages: ["/uploads/a.jpg", "/uploads/b.jpg"],
  status: "In Rehabilitation",
  customQrUrl: "/uploads/stored-qr.png",
  rehabStage: "Hydrotherapy",
  rehabStageMs: "Hidroterapi",
  rehabProgressPercent: 60,
  updates: [{ id: "u1", date: "2026-05-01", title: "Walk", content: "First walk outside." }],
  medicalTimeline: [
    { id: "m1", date: "2026-04-01", title: "Intake", category: "intake", description: "Arrived.", verified: true },
  ],
  medical: { vaccinated: false, microchipped: false, spayedNeutered: false, specialNeeds: "Insulin" },
  compatibility: { goodWithDogs: false, goodWithCats: false, goodWithKids: false, energyLevel: "High" },
  intakeDate: "2026-04-01",
  birthDate: "2024-06-12",
  birthDateIsEstimate: false,
  adoptionFee: "RM 150",
  featured: true,
  isArchived: true,
  deletedAt: "2026-10-01T00:00:00.000Z",
});

/** The required fields only: every key the merge decides for itself is absent. */
const minimalEdit = (): PetFormInput => ({
  name: "Edited",
  species: "dog",
  breed: "Labrador Mix",
  birthDate: "2024-06-12",
  gender: "Female",
  size: "Medium",
  weight: "20 kg",
  status: "Available",
  adoptionFee: "Free",
  description: "Edited description.",
  rescueStory: "Edited rescue story.",
  image: "/images/edited.jpg",
  tags: ["Playful"],
  intakeDate: "2026-04-01",
});

describe("mergePetEdit", () => {
  it("takes required scalar fields from the input and keeps the stored id", () => {
    const merged = mergePetEdit(stored(), minimalEdit());
    expect(merged).toMatchObject({
      id: "pet-stored",
      name: "Edited",
      breed: "Labrador Mix",
      weight: "20 kg",
      status: "Available",
      description: "Edited description.",
      image: "/images/edited.jpg",
      tags: ["Playful"],
    });
  });

  it("re-derives age and ageCategory from the birthday", () => {
    const merged = mergePetEdit(stored(), minimalEdit());
    expect(merged.age).not.toBe("stale prose");
    expect(merged.ageCategory).not.toBe("senior");
  });

  describe("gallery", () => {
    it("keeps the stored gallery when the key is absent", () => {
      expect(mergePetEdit(stored(), minimalEdit()).galleryImages).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
    });
    it("replaces it with a submitted gallery", () => {
      const merged = mergePetEdit(stored(), { ...minimalEdit(), galleryImages: ["/uploads/c.jpg"] });
      expect(merged.galleryImages).toEqual(["/uploads/c.jpg"]);
    });
    it("clears it on an explicit empty list", () => {
      expect(mergePetEdit(stored(), { ...minimalEdit(), galleryImages: [] }).galleryImages).toEqual([]);
    });
  });

  describe("donation QR", () => {
    it("keeps the stored QR when the key is absent", () => {
      expect(mergePetEdit(stored(), minimalEdit()).customQrUrl).toBe("/uploads/stored-qr.png");
    });
    it("keeps it when the key is present but undefined", () => {
      expect(mergePetEdit(stored(), { ...minimalEdit(), customQrUrl: undefined }).customQrUrl).toBe(
        "/uploads/stored-qr.png"
      );
    });
    it("replaces it with a submitted QR", () => {
      const merged = mergePetEdit(stored(), { ...minimalEdit(), customQrUrl: "/uploads/new-qr.png" });
      expect(merged.customQrUrl).toBe("/uploads/new-qr.png");
    });
    it("clears it to null on an empty string, as createPet stores it", () => {
      expect(mergePetEdit(stored(), { ...minimalEdit(), customQrUrl: "" }).customQrUrl).toBeNull();
    });
  });

  it("keeps a stored featured flag when the key is absent, and takes a submitted one", () => {
    expect(mergePetEdit(stored(), minimalEdit()).featured).toBe(true);
    expect(mergePetEdit(stored(), { ...minimalEdit(), featured: false }).featured).toBe(false);
  });

  it("keeps the archive state and its timestamp together when both keys are absent", () => {
    const merged = mergePetEdit(stored(), minimalEdit());
    expect(merged.isArchived).toBe(true);
    expect(merged.deletedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("takes a submitted archive state and timestamp", () => {
    const merged = mergePetEdit(stored(), { ...minimalEdit(), isArchived: false, deletedAt: null });
    expect(merged.isArchived).toBe(false);
    expect(merged.deletedAt).toBeNull();
  });

  it("keeps a verified birthday when the estimate flag is absent", () => {
    expect(mergePetEdit(stored(), minimalEdit()).birthDateIsEstimate).toBe(false);
  });

  it("keeps the stored medical and compatibility flags and energy level when absent", () => {
    const merged = mergePetEdit(stored(), minimalEdit());
    expect(merged.medical).toMatchObject({ vaccinated: false, microchipped: false, spayedNeutered: false });
    expect(merged.compatibility).toEqual({
      goodWithDogs: false,
      goodWithCats: false,
      goodWithKids: false,
      energyLevel: "High",
    });
  });

  it("takes submitted medical and compatibility values", () => {
    const merged = mergePetEdit(stored(), {
      ...minimalEdit(),
      vaccinated: true,
      goodWithCats: true,
      energyLevel: "Low",
    });
    expect(merged.medical.vaccinated).toBe(true);
    expect(merged.medical.microchipped).toBe(false);
    expect(merged.compatibility.goodWithCats).toBe(true);
    expect(merged.compatibility.energyLevel).toBe("Low");
  });

  it("clears special needs when absent, as both copies did before", () => {
    expect(mergePetEdit(stored(), minimalEdit()).medical.specialNeeds).toBeUndefined();
  });

  it("clears the rehabilitation fields when absent: the form is authoritative for them", () => {
    const merged = mergePetEdit(stored(), minimalEdit());
    expect(merged.rehabStage).toBeUndefined();
    expect(merged.rehabStageMs).toBeUndefined();
    expect(merged.rehabProgressPercent).toBeUndefined();
  });

  it("takes submitted rehabilitation fields", () => {
    const merged = mergePetEdit(stored(), {
      ...minimalEdit(),
      status: "In Rehabilitation",
      rehabStage: "Recovery",
      rehabProgressPercent: 80,
    });
    expect(merged).toMatchObject({ rehabStage: "Recovery", rehabProgressPercent: 80 });
  });

  it("keeps the stored history when absent and replaces it, sorted, when submitted", () => {
    expect(mergePetEdit(stored(), minimalEdit()).updates?.map((u) => u.id)).toEqual(["u1"]);
    expect(mergePetEdit(stored(), minimalEdit()).medicalTimeline?.map((e) => e.id)).toEqual(["m1"]);

    const merged = mergePetEdit(stored(), {
      ...minimalEdit(),
      updates: [
        { id: "u3", date: "2026-07-01", title: "Later", content: "Later note." },
        { id: "u2", date: "2026-06-01", title: "Earlier", content: "Earlier note." },
      ],
      medicalTimeline: [],
    });
    expect(merged.updates?.map((u) => u.id)).toEqual(["u2", "u3"]);
    expect(merged.medicalTimeline).toEqual([]);
  });

  it("does not leak the form's flat medical and compatibility keys onto the pet", () => {
    const merged = mergePetEdit(stored(), { ...minimalEdit(), vaccinated: true, goodWithDogs: true });
    expect(merged).not.toHaveProperty("vaccinated");
    expect(merged).not.toHaveProperty("goodWithDogs");
  });
});

describe("buildNewPet", () => {
  it("states every default a new record gets when the form leaves a key out", () => {
    const pet = buildNewPet("pet-new", minimalEdit());
    expect(pet).toMatchObject({
      id: "pet-new",
      name: "Edited",
      featured: false,
      galleryImages: [],
      customQrUrl: null,
      birthDateIsEstimate: true,
      isArchived: false,
      deletedAt: null,
      medical: { vaccinated: true, microchipped: true, spayedNeutered: true },
      compatibility: { goodWithDogs: true, goodWithCats: true, goodWithKids: true, energyLevel: "Moderate" },
    });
    expect(pet.updates).toBeUndefined();
    expect(pet.medicalTimeline).toBeUndefined();
    expect(pet.age).toBeTruthy();
  });

  it("takes the submitted gallery, QR and flags", () => {
    const pet = buildNewPet("pet-new", {
      ...minimalEdit(),
      galleryImages: ["/uploads/c.jpg"],
      customQrUrl: "/uploads/qr.png",
      featured: true,
      vaccinated: false,
      energyLevel: "High",
    });
    expect(pet).toMatchObject({
      galleryImages: ["/uploads/c.jpg"],
      customQrUrl: "/uploads/qr.png",
      featured: true,
      medical: { vaccinated: false },
      compatibility: { energyLevel: "High" },
    });
  });

  it("stores an empty QR as null", () => {
    expect(buildNewPet("pet-new", { ...minimalEdit(), customQrUrl: "" }).customQrUrl).toBeNull();
  });
});

describe("petEditSchema", () => {
  it("leaves every omitted key absent, where petFormSchema defaults it", () => {
    const edit = petEditSchema.parse(minimalEdit());
    const form = petFormSchema.parse(minimalEdit());
    for (const key of [
      "galleryImages",
      "customQrUrl",
      "featured",
      "isArchived",
      "vaccinated",
      "microchipped",
      "spayedNeutered",
      "goodWithDogs",
      "goodWithCats",
      "goodWithKids",
      "energyLevel",
    ]) {
      expect(edit, key).not.toHaveProperty(key);
      expect(form, key).toHaveProperty(key);
    }
  });

  it("keeps the cross-field rules", () => {
    const parsed = petEditSchema.safeParse({ ...minimalEdit(), rehabStage: "Hydrotherapy" });
    expect(parsed.success).toBe(false);
    expect(petEditSchema.safeParse({ ...minimalEdit(), birthDate: "2099-01-01" }).success).toBe(false);
    expect(petEditSchema.safeParse({ ...minimalEdit(), customQrUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});
