import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mapDbPetToPet,
  buildPetPersistencePayload,
  buildPetHistoryNestedCreate,
  buildPetCreatePayload,
  buildPetUpdatePayload,
  type DbPetRecord,
  type DbPetUpdateRecord,
  type DbMedicalTimelineEventRecord,
} from "@/lib/server/petMappers";
import {
  insertServerPet,
  updateServerPet,
  getServerPetsAsync,
} from "@/lib/server/petRepository";
import {
  petFormSchema,
  petUpdateSchema,
  medicalTimelineEventSchema,
  MEDICAL_TIMELINE_CATEGORY_VALUES,
  PET_UPDATE_CATEGORY_VALUES,
  type MedicalTimelineEventInput,
  type PetUpdateInput,
} from "@/lib/validations/pet";
import { createPet, updatePet, getPetById } from "@/actions/pets";
import { getPetMedicalTimeline } from "@/lib/domain/medicalTimeline";
import { signInAsAdmin, TEST_ADMIN_ACTOR } from "../setup/authSession";
import { Pet, MedicalTimelineEvent, PetUpdate } from "@/types/pet";
import petsData from "@/data/pets.json";

// Mock next/cache — src/actions/pets.ts calls revalidatePath on every mutation.
// `next/cache` and `next/headers` are doubled by the global harness in
// tests/setup/nextMocks.ts. This file used to declare its own, and a file's
// own `vi.mock` wins over a setup file's -- so its `cookies()` returned
// `undefined` for everything and no test here could hold a session. That was
// survivable only while admin mutations had a non-production bypass. Do not
// reinstate them: `signInAsAdmin()` below writes into the harness's jar.

/**
 * A recording stand-in for the Prisma client.
 *
 * The dual-layer store swallows database errors and falls back to the in-memory
 * fixtures, so an action-level assertion can pass while the write never reaches
 * the database at all. These spies are how this file distinguishes the two
 * layers: `pet.findMany` deliberately returns `[]` so reads still exercise the
 * fallback, while every write records the exact payload handed to Prisma.
 */
const prismaSpies = vi.hoisted(() => {
  /** Returns an awaitable that also carries the operation it represents, so
   *  operations queued into `$transaction([...])` remain identifiable. */
  const op = (name: string) =>
    vi.fn((args?: unknown) =>
      Object.assign(Promise.resolve({ count: 0 }), { __op: name, __args: args })
    );

  return {
    petFindMany: vi.fn(async (args?: unknown) => {
      void args;
      return [] as unknown[];
    }),
    petCreate: op("pet.create"),
    petUpdate: op("pet.update"),
    petUpdateMany: op("pet.updateMany"),
    petUpdateDeleteMany: op("petUpdate.deleteMany"),
    petUpdateCreateMany: op("petUpdate.createMany"),
    timelineDeleteMany: op("medicalTimelineEvent.deleteMany"),
    timelineCreateMany: op("medicalTimelineEvent.createMany"),
    applicationFindMany: vi.fn(async () => [] as unknown[]),
    applicationCreate: op("adoptionApplication.create"),
    applicationUpdate: op("adoptionApplication.update"),
    applicationUpdateMany: op("adoptionApplication.updateMany"),
    applicationDelete: op("adoptionApplication.delete"),
    auditCreate: op("auditLog.create"),
    auditFindMany: vi.fn(async () => [] as unknown[]),
    transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return undefined;
    }),
  };
});

vi.mock("@/lib/server/prisma", () => {
  const client = {
    pet: {
      findMany: prismaSpies.petFindMany,
      create: prismaSpies.petCreate,
      update: prismaSpies.petUpdate,
      updateMany: prismaSpies.petUpdateMany,
    },
    petUpdate: {
      deleteMany: prismaSpies.petUpdateDeleteMany,
      createMany: prismaSpies.petUpdateCreateMany,
    },
    medicalTimelineEvent: {
      deleteMany: prismaSpies.timelineDeleteMany,
      createMany: prismaSpies.timelineCreateMany,
    },
    adoptionApplication: {
      findMany: prismaSpies.applicationFindMany,
      create: prismaSpies.applicationCreate,
      update: prismaSpies.applicationUpdate,
      updateMany: prismaSpies.applicationUpdateMany,
      delete: prismaSpies.applicationDelete,
    },
    auditLog: {
      create: prismaSpies.auditCreate,
      findMany: prismaSpies.auditFindMany,
    },
    $transaction: prismaSpies.transaction,
  };
  return { prisma: client, default: client };
});

describe("Nested Pet History Persistence (updates[] & medicalTimeline[])", () => {
  const timelineIntake: MedicalTimelineEvent = {
    id: "tl-hist-1",
    date: "2026-06-12",
    title: "Sanctuary Rescue & Initial Intake Screening",
    titleMs: "Penyelamatan & Saringan Kemasukan Awal",
    category: "intake",
    description: "Rescued from a Section 19 Petaling Jaya industrial lot. Body weight 20.5 kg.",
    descriptionMs: "Diselamatkan dari kawasan industri Seksyen 19 Petaling Jaya. Berat 20.5 kg.",
    veterinarian: "Dr. Sarah Tan, DVM (PJ Animal Hospital)",
    verified: true,
    badge: "Intake Clear",
    badgeMs: "Kemasukan Bersih",
  };

  const timelineSurgery: MedicalTimelineEvent = {
    id: "tl-hist-2",
    date: "2026-07-04",
    title: "Orthopaedic Repair of Left Hind Limb",
    titleMs: "Pembaikan Ortopedik Kaki Belakang Kiri",
    category: "surgery",
    description: "Internal fixation of the femoral fracture under general anaesthesia.",
    descriptionMs: "Fiksasi dalaman patah tulang femur di bawah bius am.",
    veterinarian: "Dr. Kevin Lim, DVM",
    verified: true,
    badge: "Surgery Complete",
    badgeMs: "Pembedahan Selesai",
  };

  const updateFirstSteps: PetUpdate = {
    id: "up-hist-1",
    date: "2026-08-02",
    title: "First steps without support",
    titleMs: "Langkah pertama tanpa sokongan",
    content: "One week after surgery Tuah took his first unaided steps across the recovery pen.",
    contentMs: "Seminggu selepas pembedahan, Tuah mengambil langkah pertamanya tanpa bantuan.",
    category: "rehabilitation",
  };

  const updateHydrotherapy: PetUpdate = {
    id: "up-hist-2",
    date: "2026-08-14",
    title: "Hydrotherapy sessions begin",
    titleMs: "Sesi hidroterapi bermula",
    content: "Twice-weekly hydrotherapy has started to rebuild hind limb muscle.",
    contentMs: "Hidroterapi dua kali seminggu telah bermula untuk membina semula otot kaki belakang.",
    image: "https://images.hopeforstrays.org/tuah-hydro.jpg",
    category: "milestone",
  };

  function makePet(overrides: Partial<Pet> = {}): Pet {
    return {
      id: "pet-hist-001",
      name: "Tuah",
      species: "dog",
      breed: "Malaysian Local Mixed",
      age: "1 year",
      ageCategory: "young",
      gender: "Male",
      size: "Medium",
      weight: "14 kg",
      tags: ["Under Care", "Gentle"],
      description: "Recovering from a fractured hind leg after a road traffic accident.",
      rescueStory: "Found beside Jalan Gasing after a road traffic accident in June 2026.",
      image: "https://images.hopeforstrays.org/tuah.jpg",
      status: "In Rehabilitation",
      rehabStage: "Post-operative physiotherapy",
      rehabStageMs: "Fisioterapi selepas pembedahan",
      rehabProgressPercent: 45,
      updates: [updateFirstSteps, updateHydrotherapy],
      medical: {
        vaccinated: true,
        microchipped: true,
        spayedNeutered: false,
        specialNeeds: "Twice-weekly hydrotherapy at the PJ clinic",
      },
      medicalTimeline: [timelineIntake, timelineSurgery],
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

  function makeDbTimelineRow(
    overrides: Partial<DbMedicalTimelineEventRecord> = {}
  ): DbMedicalTimelineEventRecord {
    return {
      id: "tl-row-1",
      petId: "pet-hist-db-001",
      date: "2026-06-12",
      title: "Sanctuary Rescue & Initial Intake Screening",
      titleMs: "Penyelamatan & Saringan Kemasukan Awal",
      category: "intake",
      description: "Rescued from a Section 19 Petaling Jaya industrial lot.",
      descriptionMs: "Diselamatkan dari kawasan industri Seksyen 19 Petaling Jaya.",
      veterinarian: "Dr. Sarah Tan, DVM (PJ Animal Hospital)",
      verified: true,
      badge: "Intake Clear",
      badgeMs: "Kemasukan Bersih",
      ...overrides,
    };
  }

  function makeDbUpdateRow(overrides: Partial<DbPetUpdateRecord> = {}): DbPetUpdateRecord {
    return {
      id: "up-row-1",
      petId: "pet-hist-db-001",
      date: "2026-08-02",
      title: "First steps without support",
      titleMs: "Langkah pertama tanpa sokongan",
      content: "Tuah took his first unaided steps across the recovery pen.",
      contentMs: "Tuah mengambil langkah pertamanya tanpa bantuan di kandang pemulihan.",
      image: null,
      category: "rehabilitation",
      ...overrides,
    };
  }

  function makeDbRow(overrides: Partial<DbPetRecord> = {}): DbPetRecord {
    return {
      id: "pet-hist-db-001",
      name: "Suri",
      species: "cat",
      breed: "Domestic Short Hair",
      age: "8 months",
      ageCategory: "young",
      gender: "Female",
      size: "Small",
      weight: "3 kg",
      status: "In Rehabilitation",
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

  const baseForm = {
    name: "Tuah",
    species: "dog" as const,
    breed: "Malaysian Local Mixed",
    // Was `age: "1 year"` plus a hand-picked band, until the form began collecting the birthday
    // and deriving both. One year before this animal's intake date.
    birthDate: "2025-06-02",
    birthDateIsEstimate: true,
    gender: "Male" as const,
    size: "Medium" as const,
    weight: "14 kg",
    status: "In Rehabilitation" as const,
    adoptionFee: "Free",
    description: "Recovering from a fractured hind leg after a road traffic accident.",
    rescueStory: "Found beside Jalan Gasing in June 2026 and rushed to the clinic.",
    image: "https://images.hopeforstrays.org/tuah.jpg",
    tags: ["Under Care"],
    intakeDate: "2026-06-02",
    rehabStage: "Post-operative physiotherapy",
    rehabStageMs: "Fisioterapi selepas pembedahan",
    rehabProgressPercent: 45,
    updates: [updateFirstSteps, updateHydrotherapy],
    medicalTimeline: [timelineIntake, timelineSurgery],
  };

  beforeEach(async () => {
    for (const spy of Object.values(prismaSpies)) spy.mockClear();
    // The admin mutations exercised below authenticate for real. Signing in
    // here rather than per-test keeps the invariant statable: every test in
    // this file acts as one signed-in administrator.
    await signInAsAdmin();
  });

  // ---------------------------------------------------------------- schema --

  describe("Prisma Schema Contract", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf-8");

    function modelBody(name: string): string {
      const start = schema.indexOf(`model ${name} {`);
      expect(start, `model ${name} is missing from prisma/schema.prisma`).toBeGreaterThan(-1);
      return schema.slice(start, schema.indexOf("\n}", start));
    }

    it("should declare a PetUpdate model", () => {
      expect(schema).toContain("model PetUpdate {");
    });

    it("should declare a MedicalTimelineEvent model", () => {
      expect(schema).toContain("model MedicalTimelineEvent {");
    });

    it("should keep fixture-supplied ids as the primary key rather than generating cuids", () => {
      for (const model of ["PetUpdate", "MedicalTimelineEvent"]) {
        const body = modelBody(model);
        expect(body).toMatch(/id\s+String\s+@id\s*$/m);
        expect(body).not.toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
      }
    });

    it("should store the event date as a String so YYYY-MM-DD survives without timezone drift", () => {
      for (const model of ["PetUpdate", "MedicalTimelineEvent"]) {
        expect(modelBody(model)).toMatch(/^\s*date\s+String\s*$/m);
      }
    });

    it("should relate both child tables to Pet with a cascading delete", () => {
      for (const model of ["PetUpdate", "MedicalTimelineEvent"]) {
        const body = modelBody(model);
        expect(body).toMatch(/petId\s+String/);
        expect(body).toMatch(
          /pet\s+Pet\s+@relation\(fields:\s*\[petId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/
        );
      }
    });

    it("should expose both collections as back-relations on the Pet model", () => {
      const petModel = modelBody("Pet");
      expect(petModel).toMatch(/updates\s+PetUpdate\[\]/);
      expect(petModel).toMatch(/medicalTimeline\s+MedicalTimelineEvent\[\]/);
    });

    it("should carry the bilingual columns both domain types declare", () => {
      const updateBody = modelBody("PetUpdate");
      expect(updateBody).toMatch(/titleMs\s+String\?/);
      expect(updateBody).toMatch(/contentMs\s+String\?/);

      const timelineBody = modelBody("MedicalTimelineEvent");
      expect(timelineBody).toMatch(/titleMs\s+String\?/);
      expect(timelineBody).toMatch(/descriptionMs\s+String\?/);
      expect(timelineBody).toMatch(/badgeMs\s+String\?/);
    });

    it("should index each child table by pet and date so ordered reads stay cheap", () => {
      for (const model of ["PetUpdate", "MedicalTimelineEvent"]) {
        expect(modelBody(model)).toMatch(/@@index\(\[petId,\s*date\]\)/);
      }
    });
  });

  // ------------------------------------------------------------ validation --

  describe("Zod Contracts", () => {
    it("should accept a fully populated bilingual timeline event", () => {
      const parsed = medicalTimelineEventSchema.safeParse(timelineIntake);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.titleMs).toBe("Penyelamatan & Saringan Kemasukan Awal");
        expect(parsed.data.descriptionMs).toContain("Seksyen 19");
        expect(parsed.data.badgeMs).toBe("Kemasukan Bersih");
      }
    });

    it("should accept a fully populated bilingual pet update", () => {
      const parsed = petUpdateSchema.safeParse(updateHydrotherapy);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.titleMs).toBe("Sesi hidroterapi bermula");
        expect(parsed.data.contentMs).toContain("Hidroterapi dua kali seminggu");
        expect(parsed.data.image).toBe("https://images.hopeforstrays.org/tuah-hydro.jpg");
      }
    });

    it("should expose the two distinct closed category sets", () => {
      expect([...MEDICAL_TIMELINE_CATEGORY_VALUES].sort()).toEqual(
        ["clearance", "diagnostic", "intake", "surgery", "treatment", "vaccination"].sort()
      );
      expect([...PET_UPDATE_CATEGORY_VALUES].sort()).toEqual(
        ["medical", "milestone", "rehabilitation", "socialization"].sort()
      );
    });

    it("should reject a category borrowed from the other collection", () => {
      expect(
        medicalTimelineEventSchema.safeParse({ ...timelineIntake, category: "milestone" }).success
      ).toBe(false);
      expect(petUpdateSchema.safeParse({ ...updateFirstSteps, category: "surgery" }).success).toBe(
        false
      );
    });

    it("should require an ISO YYYY-MM-DD date on both event shapes", () => {
      expect(medicalTimelineEventSchema.safeParse({ ...timelineIntake, date: "12/06/2026" }).success).toBe(
        false
      );
      expect(petUpdateSchema.safeParse({ ...updateFirstSteps, date: "2026-8-2" }).success).toBe(false);
      expect(petUpdateSchema.safeParse({ ...updateFirstSteps, date: "2026-08-02" }).success).toBe(true);
    });

    it("should require clinical sign-off to be stated rather than inferred", () => {
      // `verified` is required on MedicalTimelineEvent. Mirroring that exactly —
      // instead of defaulting it — keeps the schema's input type assignable to
      // the domain type, so no caller has to re-derive it.
      const withoutVerified = {
        id: "tl-hist-9",
        date: "2026-09-01",
        title: "Follow-up radiograph",
        category: "diagnostic",
        description: "Callus formation visible at the fracture site.",
      };
      expect(medicalTimelineEventSchema.safeParse(withoutVerified).success).toBe(false);
      expect(
        medicalTimelineEventSchema.safeParse({ ...withoutVerified, verified: false }).success
      ).toBe(true);
    });

    it("should keep the schema input type assignable to the domain type", () => {
      // A compile-time assertion: if a Zod default reintroduced an input/output
      // divergence, this assignment would stop typechecking.
      const events: MedicalTimelineEvent[] = [timelineIntake];
      const asInput: MedicalTimelineEventInput[] = events;
      const asUpdates: PetUpdateInput[] = [updateFirstSteps];
      expect(asInput).toHaveLength(1);
      expect(asUpdates).toHaveLength(1);
    });

    it("should accept both history collections on the pet form", () => {
      const parsed = petFormSchema.safeParse(baseForm);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.updates?.length).toBe(2);
        expect(parsed.data.medicalTimeline?.length).toBe(2);
      }
    });

    it("should leave the history keys absent when the payload omits them", () => {
      const form: Record<string, unknown> = { ...baseForm };
      delete form.updates;
      delete form.medicalTimeline;

      const parsed = petFormSchema.safeParse(form);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        // Zod must not invent an empty array here — the action layer needs to
        // distinguish "no key supplied" from "supplied as empty".
        expect(parsed.data.updates).toBeUndefined();
        expect(parsed.data.medicalTimeline).toBeUndefined();
      }
    });

    it("should reject duplicate event ids that would collide on the primary key", () => {
      expect(
        petFormSchema.safeParse({
          ...baseForm,
          medicalTimeline: [timelineIntake, { ...timelineSurgery, id: timelineIntake.id }],
        }).success
      ).toBe(false);
      expect(
        petFormSchema.safeParse({
          ...baseForm,
          updates: [updateFirstSteps, { ...updateHydrotherapy, id: updateFirstSteps.id }],
        }).success
      ).toBe(false);
    });

    it("should validate every committed fixture event, so seed data round-trips unchanged", () => {
      const fixtures = petsData as unknown as Pet[];
      for (const pet of fixtures) {
        for (const event of pet.medicalTimeline ?? []) {
          const parsed = medicalTimelineEventSchema.safeParse(event);
          expect(parsed.success, `${pet.id} / ${event.id} failed timeline validation`).toBe(true);
        }
        for (const update of pet.updates ?? []) {
          const parsed = petUpdateSchema.safeParse(update);
          expect(parsed.success, `${pet.id} / ${update.id} failed update validation`).toBe(true);
        }
      }
    });
  });

  // ---------------------------------------------------------------- mapper --

  describe("Database Row Mapping", () => {
    it("should carry stored timeline events onto the domain Pet", () => {
      const pet = mapDbPetToPet(
        makeDbRow({ medicalTimeline: [makeDbTimelineRow()], updates: [makeDbUpdateRow()] })
      );

      expect(pet.medicalTimeline?.length).toBe(1);
      expect(pet.medicalTimeline?.[0].id).toBe("tl-row-1");
      expect(pet.medicalTimeline?.[0].category).toBe("intake");
      expect(pet.medicalTimeline?.[0].verified).toBe(true);
      expect(pet.updates?.length).toBe(1);
      expect(pet.updates?.[0].id).toBe("up-row-1");
      expect(pet.updates?.[0].category).toBe("rehabilitation");
    });

    it("should order both collections by date ascending regardless of row order", () => {
      const pet = mapDbPetToPet(
        makeDbRow({
          medicalTimeline: [
            makeDbTimelineRow({ id: "tl-row-3", date: "2026-09-01" }),
            makeDbTimelineRow({ id: "tl-row-1", date: "2026-06-12" }),
            makeDbTimelineRow({ id: "tl-row-2", date: "2026-07-04" }),
          ],
          updates: [
            makeDbUpdateRow({ id: "up-row-2", date: "2026-08-14" }),
            makeDbUpdateRow({ id: "up-row-1", date: "2026-08-02" }),
          ],
        })
      );

      expect(pet.medicalTimeline?.map((e) => e.date)).toEqual([
        "2026-06-12",
        "2026-07-04",
        "2026-09-01",
      ]);
      expect(pet.updates?.map((e) => e.date)).toEqual(["2026-08-02", "2026-08-14"]);
    });

    it("should preserve every bilingual column across the mapping", () => {
      const pet = mapDbPetToPet(
        makeDbRow({ medicalTimeline: [makeDbTimelineRow()], updates: [makeDbUpdateRow()] })
      );

      expect(pet.medicalTimeline?.[0].titleMs).toBe("Penyelamatan & Saringan Kemasukan Awal");
      expect(pet.medicalTimeline?.[0].descriptionMs).toContain("Seksyen 19");
      expect(pet.medicalTimeline?.[0].badgeMs).toBe("Kemasukan Bersih");
      expect(pet.updates?.[0].titleMs).toBe("Langkah pertama tanpa sokongan");
      expect(pet.updates?.[0].contentMs).toContain("tanpa bantuan");
    });

    it("should turn nullable event columns into undefined, matching the domain type", () => {
      const pet = mapDbPetToPet(
        makeDbRow({
          medicalTimeline: [
            makeDbTimelineRow({
              titleMs: null,
              descriptionMs: null,
              veterinarian: null,
              badge: null,
              badgeMs: null,
              verified: false,
            }),
          ],
          updates: [makeDbUpdateRow({ titleMs: null, contentMs: null, image: null, category: null })],
        })
      );

      const event = pet.medicalTimeline?.[0];
      expect(event?.titleMs).toBeUndefined();
      expect(event?.descriptionMs).toBeUndefined();
      expect(event?.veterinarian).toBeUndefined();
      expect(event?.badge).toBeUndefined();
      expect(event?.badgeMs).toBeUndefined();
      expect(event?.verified).toBe(false);

      const update = pet.updates?.[0];
      expect(update?.titleMs).toBeUndefined();
      expect(update?.contentMs).toBeUndefined();
      expect(update?.image).toBeUndefined();
      expect(update?.category).toBeUndefined();
    });

    it("should leave both collections undefined when the pet has no stored history", () => {
      expect(mapDbPetToPet(makeDbRow()).medicalTimeline).toBeUndefined();
      expect(mapDbPetToPet(makeDbRow()).updates).toBeUndefined();
      expect(mapDbPetToPet(makeDbRow({ medicalTimeline: [], updates: [] })).medicalTimeline).toBeUndefined();
      expect(mapDbPetToPet(makeDbRow({ medicalTimeline: [], updates: [] })).updates).toBeUndefined();
    });

    it("should still map the scalar columns it mapped before", () => {
      const pet = mapDbPetToPet(makeDbRow({ medicalTimeline: [makeDbTimelineRow()] }));
      expect(pet.rehabStage).toBe("Antibiotic course, week 2");
      expect(pet.medical.specialNeeds).toBe("Nebuliser twice daily");
      expect(pet.compatibility.energyLevel).toBe("Low");
    });
  });

  // --------------------------------------------------------------- builders --

  describe("Persistence Payload Split", () => {
    it("should keep buildPetPersistencePayload free of nested relations", () => {
      const payload = buildPetPersistencePayload(makePet()) as unknown as Record<string, unknown>;
      expect(payload.updates).toBeUndefined();
      expect(payload.medicalTimeline).toBeUndefined();
    });

    it("should express history as a nested create for both collections", () => {
      const nested = buildPetHistoryNestedCreate(makePet());
      expect(nested.updates.create.map((u) => u.id)).toEqual(["up-hist-1", "up-hist-2"]);
      expect(nested.medicalTimeline.create.map((e) => e.id)).toEqual(["tl-hist-1", "tl-hist-2"]);
      expect(nested.medicalTimeline.create[0].badgeMs).toBe("Kemasukan Bersih");
      expect(nested.updates.create[1].image).toBe("https://images.hopeforstrays.org/tuah-hydro.jpg");
    });

    it("should null out absent optional event fields rather than dropping the column", () => {
      const nested = buildPetHistoryNestedCreate(
        makePet({
          updates: [{ id: "up-bare", date: "2026-08-20", title: "Bare", content: "Minimal note." }],
          medicalTimeline: [
            {
              id: "tl-bare",
              date: "2026-08-20",
              title: "Bare",
              category: "treatment",
              description: "Minimal note.",
              verified: false,
            },
          ],
        })
      );

      expect(nested.updates.create[0].titleMs).toBeNull();
      expect(nested.updates.create[0].image).toBeNull();
      expect(nested.updates.create[0].category).toBeNull();
      expect(nested.medicalTimeline.create[0].veterinarian).toBeNull();
      expect(nested.medicalTimeline.create[0].badgeMs).toBeNull();
    });

    it("should emit empty nested creates for a pet with no history", () => {
      const nested = buildPetHistoryNestedCreate(
        makePet({ updates: undefined, medicalTimeline: undefined })
      );
      expect(nested.updates.create).toEqual([]);
      expect(nested.medicalTimeline.create).toEqual([]);
    });

    it("should build a create payload that reuses the shared scalar builder verbatim", () => {
      const pet = makePet();
      const scalars = buildPetPersistencePayload(pet) as unknown as Record<string, unknown>;
      const created = buildPetCreatePayload(pet) as unknown as Record<string, unknown>;

      expect(created.id).toBe(pet.id);
      for (const [key, value] of Object.entries(scalars)) {
        expect(created[key], `create payload drifted on column '${key}'`).toEqual(value);
      }
      expect(created.updates).toEqual({ create: expect.any(Array) });
      expect(created.medicalTimeline).toEqual({ create: expect.any(Array) });
    });

    it("should build an update payload that reuses the same scalars and carries no id", () => {
      const pet = makePet();
      const scalars = buildPetPersistencePayload(pet) as unknown as Record<string, unknown>;
      const updatedPayload = buildPetUpdatePayload(pet) as unknown as Record<string, unknown>;

      expect(updatedPayload.id).toBeUndefined();
      for (const [key, value] of Object.entries(scalars)) {
        expect(updatedPayload[key], `update payload drifted on column '${key}'`).toEqual(value);
      }
      expect(updatedPayload.updates).toEqual({ create: expect.any(Array) });
      expect(updatedPayload.medicalTimeline).toEqual({ create: expect.any(Array) });
    });
  });

  // ------------------------------------------------------------ write paths --

  describe("Repository Write Paths", () => {
    it("should read both collections back, ordered by date, in the same query", async () => {
      await getServerPetsAsync();

      expect(prismaSpies.petFindMany).toHaveBeenCalled();
      const args = prismaSpies.petFindMany.mock.calls[0]?.[0] as
        | { include?: Record<string, { orderBy?: { date?: string } }> }
        | undefined;

      expect(args?.include?.updates?.orderBy?.date).toBe("asc");
      expect(args?.include?.medicalTimeline?.orderBy?.date).toBe("asc");
    });

    it("should hand nested history creates to Prisma when inserting a pet", async () => {
      await insertServerPet(makePet({ id: "pet-hist-insert-01" }), TEST_ADMIN_ACTOR);

      expect(prismaSpies.petCreate).toHaveBeenCalledTimes(1);
      const data = (prismaSpies.petCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

      expect(data.id).toBe("pet-hist-insert-01");
      expect(data.updates).toMatchObject({ create: [{ id: "up-hist-1" }, { id: "up-hist-2" }] });
      expect(data.medicalTimeline).toMatchObject({
        create: [{ id: "tl-hist-1" }, { id: "tl-hist-2" }],
      });
    });

    it("should clear existing history rows before writing the new ones on update", async () => {
      const pet = makePet({ id: "pet-hist-update-01" });
      await insertServerPet(pet, TEST_ADMIN_ACTOR);
      prismaSpies.transaction.mockClear();
      prismaSpies.petUpdateDeleteMany.mockClear();
      prismaSpies.timelineDeleteMany.mockClear();

      await updateServerPet(
        "pet-hist-update-01",
        { ...pet, medicalTimeline: [timelineIntake], updates: undefined },
        TEST_ADMIN_ACTOR
      );

      // Clear-then-write must be ordered and atomic: a nested create alone would
      // leave the removed rows behind forever.
      expect(prismaSpies.transaction).toHaveBeenCalledTimes(1);
      const queued = prismaSpies.transaction.mock.calls[0]?.[0] as { __op: string; __args: unknown }[];
      expect(Array.isArray(queued)).toBe(true);
      expect(queued.map((q) => q.__op)).toEqual([
        "petUpdate.deleteMany",
        "medicalTimelineEvent.deleteMany",
        "pet.update",
      ]);

      expect(prismaSpies.petUpdateDeleteMany).toHaveBeenCalledWith({
        where: { petId: "pet-hist-update-01" },
      });
      expect(prismaSpies.timelineDeleteMany).toHaveBeenCalledWith({
        where: { petId: "pet-hist-update-01" },
      });

      const updateArgs = queued[2].__args as { data: Record<string, unknown> };
      expect(updateArgs.data.medicalTimeline).toMatchObject({ create: [{ id: "tl-hist-1" }] });
      expect(updateArgs.data.updates).toEqual({ create: [] });
    });
  });

  // ----------------------------------------------------------- action layer --

  describe("Admin Pet Mutations", () => {
    it("should round-trip both collections through create without dropping a field", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Roundtrip" });
      expect(created.success).toBe(true);

      const stored = await getPetById(created.data!.id);
      expect(stored).not.toBeNull();
      expect(stored?.medicalTimeline?.map((e) => e.id)).toEqual(["tl-hist-1", "tl-hist-2"]);
      expect(stored?.updates?.map((u) => u.id)).toEqual(["up-hist-1", "up-hist-2"]);

      const event = stored?.medicalTimeline?.[0];
      expect(event?.titleMs).toBe("Penyelamatan & Saringan Kemasukan Awal");
      expect(event?.descriptionMs).toContain("Seksyen 19");
      expect(event?.badgeMs).toBe("Kemasukan Bersih");
      expect(event?.veterinarian).toBe("Dr. Sarah Tan, DVM (PJ Animal Hospital)");
      expect(event?.verified).toBe(true);

      const update = stored?.updates?.[1];
      expect(update?.contentMs).toContain("Hidroterapi dua kali seminggu");
      expect(update?.image).toBe("https://images.hopeforstrays.org/tuah-hydro.jpg");
      expect(update?.category).toBe("milestone");
    });

    it("should return history ordered by date even when submitted out of order", async () => {
      const created = await createPet({
        ...baseForm,
        name: "Tuah Unsorted",
        medicalTimeline: [timelineSurgery, timelineIntake],
        updates: [updateHydrotherapy, updateFirstSteps],
      });
      expect(created.success).toBe(true);

      const stored = await getPetById(created.data!.id);
      expect(stored?.medicalTimeline?.map((e) => e.date)).toEqual(["2026-06-12", "2026-07-04"]);
      expect(stored?.updates?.map((u) => u.date)).toEqual(["2026-08-02", "2026-08-14"]);
    });

    it("should delete an event that the submitted payload no longer lists", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Trim" });
      const petId = created.data!.id;
      expect((await getPetById(petId))?.medicalTimeline?.length).toBe(2);

      const trimmed = await updatePet(petId, {
        ...baseForm,
        name: "Tuah Trim",
        medicalTimeline: [timelineIntake],
        updates: [updateFirstSteps],
      });
      expect(trimmed.success).toBe(true);

      const stored = await getPetById(petId);
      expect(stored?.medicalTimeline?.map((e) => e.id)).toEqual(["tl-hist-1"]);
      expect(stored?.updates?.map((u) => u.id)).toEqual(["up-hist-1"]);
    });

    it("should clear history when the payload sets the collections to empty arrays", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Empty" });
      const petId = created.data!.id;

      const cleared = await updatePet(petId, {
        ...baseForm,
        name: "Tuah Empty",
        medicalTimeline: [],
        updates: [],
      });
      expect(cleared.success).toBe(true);

      const stored = await getPetById(petId);
      expect(stored?.medicalTimeline ?? []).toEqual([]);
      expect(stored?.updates ?? []).toEqual([]);
    });

    it("should clear history even when the payload omits the keys entirely", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Omitted" });
      const petId = created.data!.id;
      expect((await getPetById(petId))?.medicalTimeline?.length).toBe(2);
      expect((await getPetById(petId))?.updates?.length).toBe(2);

      // Zod omits absent optional keys from its output, so `{...existing, ...validated}`
      // would silently preserve the old rows. The submitted payload must win.
      const omittedForm: Record<string, unknown> = { ...baseForm, name: "Tuah Omitted" };
      delete omittedForm.medicalTimeline;
      delete omittedForm.updates;
      expect("medicalTimeline" in omittedForm).toBe(false);
      expect("updates" in omittedForm).toBe(false);

      const cleared = await updatePet(petId, omittedForm as typeof baseForm);
      expect(cleared.success).toBe(true);

      const stored = await getPetById(petId);
      expect(stored?.medicalTimeline ?? []).toEqual([]);
      expect(stored?.updates ?? []).toEqual([]);
    });

    it("should reject a create whose history carries a duplicate event id", async () => {
      const result = await createPet({
        ...baseForm,
        name: "Tuah Duplicate",
        medicalTimeline: [timelineIntake, { ...timelineSurgery, id: timelineIntake.id }],
      });
      expect(result.success).toBe(false);
    });
  });

  // ------------------------------------------------------- synthetic fallback --

  describe("Synthetic Timeline Fallback", () => {
    it("should still synthesize a timeline for a pet with no stored events", async () => {
      const bareForm: Record<string, unknown> = { ...baseForm, name: "Tuah Synthetic" };
      delete bareForm.medicalTimeline;
      delete bareForm.updates;

      const created = await createPet(bareForm as typeof baseForm);
      expect(created.success).toBe(true);

      const stored = await getPetById(created.data!.id);
      expect(stored?.medicalTimeline ?? []).toEqual([]);

      const timeline = getPetMedicalTimeline(stored!, "en");
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].category).toBe("intake");
      expect(timeline.every((e) => e.id.startsWith("synth-"))).toBe(true);
    });

    it("should prefer stored events over the synthetic timeline once history exists", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Stored" });
      const stored = await getPetById(created.data!.id);

      const timeline = getPetMedicalTimeline(stored!, "en");
      expect(timeline.map((e) => e.id)).toEqual(["tl-hist-1", "tl-hist-2"]);
      expect(timeline.some((e) => e.id.startsWith("synth-"))).toBe(false);
    });

    it("should localize stored events into Bahasa Malaysia after a round trip", async () => {
      const created = await createPet({ ...baseForm, name: "Tuah Bilingual" });
      const stored = await getPetById(created.data!.id);

      const timelineMs = getPetMedicalTimeline(stored!, "ms");
      expect(timelineMs[0].title).toBe("Penyelamatan & Saringan Kemasukan Awal");
      expect(timelineMs[0].badge).toBe("Kemasukan Bersih");
      expect(timelineMs[0].description).toContain("Seksyen 19");
    });
  });
});
