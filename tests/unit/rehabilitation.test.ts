import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PET_TRANSITION_GRAPH,
  DomainValidationError,
  normalizePetStatus,
  validatePetTransition,
} from "@/lib/domain/stateMachine";
import {
  PET_STATUS_VALUES,
  PET_STATUS_FILTER_VALUES,
  petFormSchema,
  petFilterSchema,
} from "@/lib/validations/pet";
import {
  mapDbPetToPet,
  buildPetPersistencePayload,
  type DbPetRecord,
} from "@/lib/server/petMappers";
import { insertServerPet } from "@/lib/server/petRepository";
import { getPublicPets, createPet, updatePet } from "@/actions/pets";
import { signInAsAdmin, TEST_ADMIN_ACTOR } from "../setup/authSession";
import { Pet, PetStatus } from "@/types/pet";

// Mock next/cache — src/actions/pets.ts calls revalidatePath at module scope on mutation.
// `next/cache` and `next/headers` are doubled by the global harness in
// tests/setup/nextMocks.ts. This file used to declare its own, and a file's
// own `vi.mock` wins over a setup file's -- so its `cookies()` returned
// `undefined` for everything and no test here could hold a session. That was
// survivable only while admin mutations had a non-production bypass. Do not
// reinstate them: `signInAsAdmin()` below writes into the harness's jar.

describe("Rehabilitation Status Lifecycle & Persistence", () => {
  const ALL_PET_STATUSES = [
    "Available",
    "Pending",
    "Adopted",
    "In Rehabilitation",
    "Rehabilitation",
  ] as const satisfies readonly PetStatus[];

  const CANONICAL_REHAB: PetStatus = "In Rehabilitation";
  const ALIAS_REHAB: PetStatus = "Rehabilitation";

  beforeEach(async () => {
    // The admin mutations exercised below authenticate for real. Signing in
    // here rather than per-test keeps the invariant statable: every test in
    // this file acts as one signed-in administrator.
    await signInAsAdmin();
  });

  function threw(fn: () => void): boolean {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  }

  function makeRehabPet(overrides: Partial<Pet> = {}): Pet {
    return {
      id: "pet-rehab-001",
      name: "Tuah",
      species: "dog",
      breed: "Malaysian Local Mixed",
      age: "1 year",
      ageCategory: "young",
      gender: "Male",
      size: "Medium",
      weight: "14 kg",
      tags: ["Under Care", "Gentle"],
      description: "Rescued near Jalan Gasing with a fractured hind leg, now recovering in foster care.",
      rescueStory: "Found beside Jalan Gasing after a road traffic accident in June 2026.",
      image: "https://images.hopeforstrays.org/tuah.jpg",
      status: CANONICAL_REHAB,
      rehabStage: "Post-operative physiotherapy",
      rehabStageMs: "Fisioterapi selepas pembedahan",
      rehabProgressPercent: 45,
      medical: {
        vaccinated: true,
        microchipped: true,
        spayedNeutered: false,
        specialNeeds: "Twice-weekly hydrotherapy at the PJ clinic",
      },
      compatibility: {
        goodWithDogs: true,
        goodWithCats: false,
        goodWithKids: true,
        energyLevel: "Low",
      },
      intakeDate: "2026-06-02",
      adoptionFee: "Free",
      ...overrides,
    };
  }

  function makeDbRow(overrides: Partial<DbPetRecord> = {}): DbPetRecord {
    return {
      id: "pet-rehab-db-001",
      name: "Suri",
      species: "cat",
      breed: "Domestic Short Hair",
      age: "8 months",
      ageCategory: "young",
      gender: "Female",
      size: "Small",
      weight: "3 kg",
      status: CANONICAL_REHAB,
      adoptionFee: "Free",
      description: "Recovering from a severe upper respiratory infection.",
      rescueStory: "Surrendered by a Good Samaritan in Petaling Jaya.",
      image: "https://images.hopeforstrays.org/suri.jpg",
      galleryImages: [],
      tags: ["Under Care"],
      featured: false,
      intakeDate: "2026-07-11",
      rehabStage: "Antibiotic course, week 2",
      rehabStageMs: "Kursus antibiotik, minggu ke-2",
      rehabProgressPercent: 60,
      vaccinated: false,
      microchipped: false,
      spayedNeutered: false,
      specialNeeds: "Nebuliser twice daily",
      goodWithDogs: false,
      goodWithCats: true,
      goodWithKids: true,
      energyLevel: "Low",
      isArchived: false,
      deletedAt: null,
      ...overrides,
    };
  }

  describe("Canonical Status Normalization", () => {
    it("should resolve the 'Rehabilitation' alias to canonical 'In Rehabilitation'", () => {
      expect(normalizePetStatus(ALIAS_REHAB)).toBe(CANONICAL_REHAB);
    });

    it("should leave every non-alias status unchanged", () => {
      for (const status of ALL_PET_STATUSES) {
        if (status === ALIAS_REHAB) continue;
        expect(normalizePetStatus(status)).toBe(status);
      }
    });

    it("should be idempotent for every status", () => {
      for (const status of ALL_PET_STATUSES) {
        const once = normalizePetStatus(status);
        expect(normalizePetStatus(once)).toBe(once);
      }
    });

    it("should never normalize a status to a value outside the declared status union", () => {
      for (const status of ALL_PET_STATUSES) {
        expect(ALL_PET_STATUSES).toContain(normalizePetStatus(status));
      }
    });
  });

  // Case-by-case rehabilitation transitions (intake, clearance, adopt/reserve refusal,
  // alias no-op) live in tests/unit/stateMachine.test.ts alongside the rest of the graph.
  // What follows are the structural guarantees that file does not assert.
  describe("Rehabilitation Transition Graph", () => {
    it("should declare an entry for every pet status", () => {
      for (const status of ALL_PET_STATUSES) {
        expect(PET_TRANSITION_GRAPH[status]).toBeDefined();
        expect(Array.isArray(PET_TRANSITION_GRAPH[status])).toBe(true);
      }
      expect(Object.keys(PET_TRANSITION_GRAPH).sort()).toEqual([...ALL_PET_STATUSES].sort());
    });

    it("should reject readmitting an Adopted animal directly into rehabilitation", () => {
      expect(() => validatePetTransition("Adopted", CANONICAL_REHAB)).toThrow(DomainValidationError);
    });

    it("should behave identically for alias and canonical as the source status", () => {
      for (const target of ALL_PET_STATUSES) {
        expect(threw(() => validatePetTransition(ALIAS_REHAB, target))).toBe(
          threw(() => validatePetTransition(CANONICAL_REHAB, target))
        );
      }
    });

    it("should behave identically for alias and canonical as the target status", () => {
      for (const source of ALL_PET_STATUSES) {
        expect(threw(() => validatePetTransition(source, ALIAS_REHAB))).toBe(
          threw(() => validatePetTransition(source, CANONICAL_REHAB))
        );
      }
    });

    it("should quote the caller's original status spelling in the thrown message", () => {
      expect(() => validatePetTransition(ALIAS_REHAB, "Adopted")).toThrow(
        /Cannot change pet from 'Rehabilitation' to 'Adopted'/
      );
    });
  });

  describe("Pet Validation Schemas", () => {
    const baseForm = {
      name: "Tuah",
      species: "dog" as const,
      breed: "Malaysian Local Mixed",
      birthDate: "2025-06-02",
      birthDateIsEstimate: true,
      gender: "Male" as const,
      size: "Medium" as const,
      weight: "14 kg",
      status: CANONICAL_REHAB,
      adoptionFee: "Free",
      description: "Recovering from a fractured hind leg after a road traffic accident.",
      rescueStory: "Found beside Jalan Gasing in June 2026 and rushed to the clinic.",
      image: "https://images.hopeforstrays.org/tuah.jpg",
      tags: ["Under Care"],
      intakeDate: "2026-06-02",
    };

    it("should expose every declared pet status as an accepted enum value", () => {
      expect([...PET_STATUS_VALUES].sort()).toEqual([...ALL_PET_STATUSES].sort());
    });

    it("should prefix the filter enum with 'all' and keep the status list in sync", () => {
      expect(PET_STATUS_FILTER_VALUES[0]).toBe("all");
      expect([...PET_STATUS_FILTER_VALUES].slice(1).sort()).toEqual([...PET_STATUS_VALUES].sort());
    });

    it("should accept both rehabilitation spellings on the pet form", () => {
      expect(petFormSchema.safeParse({ ...baseForm, status: CANONICAL_REHAB }).success).toBe(true);
      expect(petFormSchema.safeParse({ ...baseForm, status: ALIAS_REHAB }).success).toBe(true);
    });

    it("should reject an unknown status", () => {
      const parsed = petFormSchema.safeParse({ ...baseForm, status: "Convalescing" });
      expect(parsed.success).toBe(false);
    });

    it("should accept rehabilitation progress details on the pet form", () => {
      const parsed = petFormSchema.safeParse({
        ...baseForm,
        rehabStage: "Post-operative physiotherapy",
        rehabStageMs: "Fisioterapi selepas pembedahan",
        rehabProgressPercent: 45,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.rehabStage).toBe("Post-operative physiotherapy");
        expect(parsed.data.rehabStageMs).toBe("Fisioterapi selepas pembedahan");
        expect(parsed.data.rehabProgressPercent).toBe(45);
      }
    });

    it("should constrain rehabilitation progress to a 0-100 percentage", () => {
      expect(petFormSchema.safeParse({ ...baseForm, rehabProgressPercent: 0 }).success).toBe(true);
      expect(petFormSchema.safeParse({ ...baseForm, rehabProgressPercent: 100 }).success).toBe(true);
      expect(petFormSchema.safeParse({ ...baseForm, rehabProgressPercent: -1 }).success).toBe(false);
      expect(petFormSchema.safeParse({ ...baseForm, rehabProgressPercent: 101 }).success).toBe(false);
      expect(petFormSchema.safeParse({ ...baseForm, rehabProgressPercent: 12.5 }).success).toBe(false);
    });

    // The form cannot reach these: `PetFormDialog` binds max={intakeDate} on the date input, so
    // the browser's own constraint validation refuses the submit before the resolver runs. This
    // rule guards the action layer, where a Server Action argument is untrusted input and the
    // `max` attribute does not exist. Specified here because nothing else specifies it.
    it("should reject a birth date after the intake date", () => {
      const parsed = petFormSchema.safeParse({ ...baseForm, birthDate: "2026-08-01" });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues).toContainEqual(
          expect.objectContaining({
            path: ["birthDate"],
            message: "Birth date 2026-08-01 is after the intake date 2026-06-02",
          })
        );
      }
    });

    it("should reject a birth date in the future even when intakeDate is unusable", () => {
      // The relative rule above is skipped when intakeDate fails its shape test, and intakeDate is
      // only `z.string().min(4)`. On the action path that leaves a Server Action argument free to
      // carry a birthday in 2099, which renders as a plausible "1 month" because
      // computeAgeInMonths clamps a negative age to zero. Found by review.
      const parsed = petFormSchema.safeParse({
        ...baseForm,
        intakeDate: "2026",
        birthDate: "2099-01-01",
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues).toContainEqual(
          expect.objectContaining({
            path: ["birthDate"],
            message: "Birth date 2099-01-01 is in the future",
          })
        );
      }
    });

    it("should accept a birth date of today, whatever the session's timezone", () => {
      // The bound is tomorrow in UTC, not today, so an animal born this morning in Kuala Lumpur
      // is not refused because UTC has not caught up.
      const today = new Date().toISOString().slice(0, 10);
      expect(
        petFormSchema.safeParse({ ...baseForm, intakeDate: today, birthDate: today }).success
      ).toBe(true);
    });

    it("should leave birthDateIsEstimate absent when the payload omits it", () => {
      // `updatePet` merges `{ ...existing, ...validated }`. If the schema defaulted this field,
      // the key would be present on every parse and a caller that merely did not mention the flag
      // would overwrite a stored `false` with `true` — silently demoting a birthday someone
      // actually knew to a guess, which is the one thing the field exists to prevent. Found on the
      // neighbouring PR's code and confirmed here before the default was removed.
      const withoutFlag: Record<string, unknown> = { ...baseForm };
      delete withoutFlag.birthDateIsEstimate;
      const parsed = petFormSchema.safeParse(withoutFlag);

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect("birthDateIsEstimate" in parsed.data).toBe(false);

        const existing = { birthDateIsEstimate: false };
        expect({ ...existing, ...parsed.data }.birthDateIsEstimate).toBe(false);
      }
    });

    it("should keep an explicit birthDateIsEstimate of false", () => {
      const parsed = petFormSchema.safeParse({ ...baseForm, birthDateIsEstimate: false });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.birthDateIsEstimate).toBe(false);
      }
    });

    it("should accept a birth date on the intake date itself", () => {
      // An animal born the day it arrived is a real case — a litter surrendered at birth — so the
      // boundary is inclusive, and pinning it stops a later `>=` from quietly refusing them.
      expect(
        petFormSchema.safeParse({ ...baseForm, birthDate: baseForm.intakeDate }).success
      ).toBe(true);
    });

    it("should require the birth date to be a real calendar day", () => {
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2 years" }).success).toBe(false);
      // The message matters: an empty field is a thing the operator has not done yet, not a
      // malformed date, and the regex's "must be in YYYY-MM-DD format" reads as the latter.
      const blank = petFormSchema.safeParse({ ...baseForm, birthDate: "" });
      expect(blank.success).toBe(false);
      if (!blank.success) {
        expect(blank.error.issues).toContainEqual(
          expect.objectContaining({ path: ["birthDate"], message: "Birth date is required" })
        );
      }
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2025-13-01" }).success).toBe(false);
    });

    it("should refuse a day that does not exist rather than rolling it forward", () => {
      // `Date.parse("2025-02-30")` returns a number on V8 — it rolls to 2025-03-02 — so the
      // previous `!Number.isNaN(Date.parse(...))` check accepted this and the stored birthday
      // was two days off the one that was typed. Measured on Node 26.4.0.
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2025-02-30" }).success).toBe(false);
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2025-02-29" }).success).toBe(false);
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2025-04-31" }).success).toBe(false);

      // The discriminator: a real leap day must still be accepted, or the fix is just stricter,
      // not more correct.
      expect(petFormSchema.safeParse({ ...baseForm, birthDate: "2024-02-29" }).success).toBe(true);
    });

    it("should reject rehabilitation details on a pet that is not under care", () => {
      const parsed = petFormSchema.safeParse({
        ...baseForm,
        status: "Available",
        rehabStage: "Post-operative physiotherapy",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path.includes("rehabStage"))).toBe(true);
      }
    });

    it("should accept both rehabilitation spellings as a catalog filter", () => {
      expect(petFilterSchema.safeParse({ status: CANONICAL_REHAB }).success).toBe(true);
      expect(petFilterSchema.safeParse({ status: ALIAS_REHAB }).success).toBe(true);
      expect(petFilterSchema.safeParse({ status: "all" }).success).toBe(true);
    });
  });

  describe("Database Row Mapping", () => {
    it("should carry rehabilitation progress from a database row onto the domain Pet", () => {
      const pet = mapDbPetToPet(makeDbRow());
      expect(pet.status).toBe(CANONICAL_REHAB);
      expect(pet.rehabStage).toBe("Antibiotic course, week 2");
      expect(pet.rehabStageMs).toBe("Kursus antibiotik, minggu ke-2");
      expect(pet.rehabProgressPercent).toBe(60);
    });

    it("should leave rehabilitation fields undefined when the row holds nulls", () => {
      const pet = mapDbPetToPet(
        makeDbRow({
          status: "Available",
          rehabStage: null,
          rehabStageMs: null,
          rehabProgressPercent: null,
        })
      );
      expect(pet.rehabStage).toBeUndefined();
      expect(pet.rehabStageMs).toBeUndefined();
      expect(pet.rehabProgressPercent).toBeUndefined();
    });

    it("should still map the pre-existing medical and compatibility groups", () => {
      const pet = mapDbPetToPet(makeDbRow());
      expect(pet.medical.specialNeeds).toBe("Nebuliser twice daily");
      expect(pet.medical.vaccinated).toBe(false);
      expect(pet.compatibility.energyLevel).toBe("Low");
      expect(pet.compatibility.goodWithCats).toBe(true);
      expect(pet.isArchived).toBe(false);
      expect(pet.deletedAt).toBeNull();
    });
  });

  describe("Persistence Payload", () => {
    it("should include rehabilitation columns when writing a pet under care", () => {
      const payload = buildPetPersistencePayload(makeRehabPet());
      expect(payload.rehabStage).toBe("Post-operative physiotherapy");
      expect(payload.rehabStageMs).toBe("Fisioterapi selepas pembedahan");
      expect(payload.rehabProgressPercent).toBe(45);
    });

    it("should null out rehabilitation columns for a pet that is not under care", () => {
      const payload = buildPetPersistencePayload(
        makeRehabPet({
          status: "Available",
          rehabStage: undefined,
          rehabStageMs: undefined,
          rehabProgressPercent: undefined,
        })
      );
      expect(payload.rehabStage).toBeNull();
      expect(payload.rehabStageMs).toBeNull();
      expect(payload.rehabProgressPercent).toBeNull();
    });

    it("should normalise the caller's status spelling to the canonical database enum on write", () => {
      expect(buildPetPersistencePayload(makeRehabPet({ status: ALIAS_REHAB })).status).toBe("In_Rehabilitation");
    });

    it("should keep flattening medical and compatibility groups into columns", () => {
      const payload = buildPetPersistencePayload(makeRehabPet());
      expect(payload.vaccinated).toBe(true);
      expect(payload.spayedNeutered).toBe(false);
      expect(payload.specialNeeds).toBe("Twice-weekly hydrotherapy at the PJ clinic");
      expect(payload.goodWithCats).toBe(false);
      expect(payload.energyLevel).toBe("Low");
    });
  });

  describe("Public Catalog Filtering", () => {
    it("should surface a rehabilitating pet under either status spelling", async () => {
      await insertServerPet(makeRehabPet({ id: "pet-rehab-filter-01" }), TEST_ADMIN_ACTOR);

      const canonical = await getPublicPets({ status: CANONICAL_REHAB });
      const alias = await getPublicPets({ status: ALIAS_REHAB });

      expect(canonical.some((p) => p.id === "pet-rehab-filter-01")).toBe(true);
      expect(alias.some((p) => p.id === "pet-rehab-filter-01")).toBe(true);
      expect(canonical.map((p) => p.id).sort()).toEqual(alias.map((p) => p.id).sort());
    });

    it("should exclude rehabilitating pets from the Available listing", async () => {
      await insertServerPet(makeRehabPet({ id: "pet-rehab-filter-02" }), TEST_ADMIN_ACTOR);

      const available = await getPublicPets({ status: "Available" });
      expect(available.some((p) => p.id === "pet-rehab-filter-02")).toBe(false);
      expect(available.every((p) => normalizePetStatus(p.status) === "Available")).toBe(true);
    });

    it("should retain rehabilitation progress on pets returned by the catalog", async () => {
      await insertServerPet(makeRehabPet({ id: "pet-rehab-filter-03" }), TEST_ADMIN_ACTOR);

      const results = await getPublicPets({ status: CANONICAL_REHAB });
      const tuah = results.find((p) => p.id === "pet-rehab-filter-03");
      expect(tuah).toBeDefined();
      expect(tuah?.rehabProgressPercent).toBe(45);
      expect(tuah?.rehabStageMs).toBe("Fisioterapi selepas pembedahan");
    });
  });

  describe("Admin Pet Mutations", () => {
    const rehabForm = {
      name: "Tuah",
      species: "dog" as const,
      breed: "Malaysian Local Mixed",
      birthDate: "2025-06-02",
      birthDateIsEstimate: true,
      gender: "Male" as const,
      size: "Medium" as const,
      weight: "14 kg",
      status: CANONICAL_REHAB,
      adoptionFee: "Free",
      description: "Recovering from a fractured hind leg after a road traffic accident.",
      rescueStory: "Found beside Jalan Gasing in June 2026 and rushed to the clinic.",
      image: "https://images.hopeforstrays.org/tuah.jpg",
      tags: ["Under Care"],
      intakeDate: "2026-06-02",
      rehabStage: "Post-operative physiotherapy",
      rehabStageMs: "Fisioterapi selepas pembedahan",
      rehabProgressPercent: 45,
    };

    it("should carry rehabilitation details onto a newly created pet", async () => {
      const result = await createPet(rehabForm);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe(CANONICAL_REHAB);
      expect(result.data?.rehabStage).toBe("Post-operative physiotherapy");
      expect(result.data?.rehabStageMs).toBe("Fisioterapi selepas pembedahan");
      expect(result.data?.rehabProgressPercent).toBe(45);
    });

    it("should refuse to create a pet carrying rehabilitation details under another status", async () => {
      const result = await createPet({ ...rehabForm, status: "Available" });
      expect(result.success).toBe(false);
    });

    it("should clear stale rehabilitation details when a pet is cleared back to Available", async () => {
      const created = await createPet({ ...rehabForm, name: "Suri" });
      expect(created.success).toBe(true);
      const petId = created.data!.id;

      const cleared = await updatePet(petId, {
        ...rehabForm,
        name: "Suri",
        status: "Available",
        rehabStage: undefined,
        rehabStageMs: undefined,
        rehabProgressPercent: undefined,
      });

      expect(cleared.success).toBe(true);
      expect(cleared.data?.status).toBe("Available");
      expect(cleared.data?.rehabStage).toBeUndefined();
      expect(cleared.data?.rehabStageMs).toBeUndefined();
      expect(cleared.data?.rehabProgressPercent).toBeUndefined();
    });

    it("should clear rehabilitation details even when the payload omits the keys entirely", async () => {
      const created = await createPet({ ...rehabForm, name: "Comel" });
      expect(created.success).toBe(true);
      const petId = created.data!.id;
      expect(created.data?.rehabProgressPercent).toBe(45);

      const clearedForm = { ...rehabForm, name: "Comel", status: "Available" as PetStatus };
      delete (clearedForm as Partial<typeof rehabForm>).rehabStage;
      delete (clearedForm as Partial<typeof rehabForm>).rehabStageMs;
      delete (clearedForm as Partial<typeof rehabForm>).rehabProgressPercent;

      const cleared = await updatePet(petId, clearedForm);

      expect(cleared.success).toBe(true);
      expect(cleared.data?.rehabStage).toBeUndefined();
      expect(cleared.data?.rehabStageMs).toBeUndefined();
      expect(cleared.data?.rehabProgressPercent).toBeUndefined();
    });
  });

  describe("Prisma Schema Contract", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf-8");
    const petModel = schema.slice(
      schema.indexOf("model Pet {"),
      schema.indexOf("model AdoptionApplication {")
    );

    it("should declare the rehabilitation progress columns on the Pet model", () => {
      expect(petModel).toMatch(/rehabStage\s+String\?/);
      expect(petModel).toMatch(/rehabStageMs\s+String\?/);
      expect(petModel).toMatch(/rehabProgressPercent\s+Int\?/);
    });

    it("should declare PetStatus enum and use it on the Pet model", () => {
      expect(schema).toMatch(/enum PetStatus\s*\{[\s\S]*Available[\s\S]*In_Rehabilitation/);
      expect(petModel).toMatch(/status\s+PetStatus\s+@default\(Available\)/);
    });
  });
});
