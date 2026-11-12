import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import initialPets from "@/data/pets.json";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";
import { signInAsAdmin, TEST_ADMIN_ACTOR } from "../setup/authSession";
import { getPetById, updatePet, updatePetStatus } from "@/actions/pets";
import { findServerPetById, findServerPetByIdAsync, updateServerPet } from "@/lib/server/petRepository";
import { dispatchPetPhotoUpdate } from "@/lib/domain/photoUpdateDispatch";
import { getAuditLogs } from "@/lib/domain/auditLog";

/**
 * Tier 3a — the admin pet edit and status change start from the database, write with the stored
 * id, and report a write that wrote nothing as a failure (#210, #211).
 *
 * Both actions used to start from `findServerPetById`, this instance's mirror, which on a cold
 * instance is `src/data/pets.json`. Every column then went back to the database, so a status
 * change could put the fixture's description, gallery or QR code over another instance's newer
 * edit. And `updateServerPet` matched the mirror with the raw id, so `PET-001` wrote nothing and
 * ` pet-001` hit a swallowed P2025, while both reported success and the admin table kept its
 * optimistic row.
 *
 * Run in **non-strict** mode with `DATABASE_URL` set, production's shape: strict mode rethrows
 * before any fallback or swallow, and would pass against the broken code. The id is `pet-001`, a
 * fixture row, so the mirror really holds an older copy of it than the database does.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

/** Run deferred work at once, so the photo dispatch an edit schedules can be asserted. */
vi.mock("@/lib/scheduleAfterResponse", () => ({
  scheduleAfterResponse: (work: () => unknown) => void work(),
}));

vi.mock("@/lib/domain/photoUpdateDispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/photoUpdateDispatch")>();
  return { ...actual, dispatchPetPhotoUpdate: vi.fn().mockResolvedValue(undefined) };
});

const PET_ID = "pet-001";
const fixture = initialPets.find((p) => p.id === PET_ID)!;

/**
 * The database's copy: newer than the fixture in every column a status change must not touch,
 * and every column an edit that omits it must keep (#212).
 */
const newerRow = () =>
  makeDbPet({
    id: PET_ID,
    name: fixture.name,
    status: "Available",
    // Verified on another instance; the fixture still says "estimated".
    birthDateIsEstimate: false,
    description: "Edited on another instance after this one loaded the fixture.",
    galleryImages: ["https://example.test/newer-gallery.jpg"],
    rehabStage: "Hydrotherapy",
    rehabStageMs: "Hidroterapi",
    rehabProgressPercent: 60,
    customQrUrl: "https://example.test/newer-qr.png",
  });

/**
 * A valid edit form that leaves `birthDateIsEstimate` out, so the action takes it from its
 * starting copy — one of the columns an edit carries over rather than submits.
 */
const editForm = () => ({
  name: fixture.name,
  species: "dog" as const,
  breed: "Labrador Mix",
  birthDate: "2024-06-12",
  gender: "Female" as const,
  size: "Medium" as const,
  weight: "22 kg",
  status: "Available" as const,
  adoptionFee: "Free",
  description: "Submitted by this edit.",
  rescueStory: "Submitted rescue story.",
  image: "https://example.test/row.jpg",
  tags: ["House-Trained"],
  intakeDate: "2026-06-12",
});

let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(async () => {
  resetPrismaDouble(double);
  vi.stubEnv("STRICT_PERSISTENCE", "false");
  vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
  // Postgres's `=`: case-sensitive, and the repository trims before it asks.
  double.pet.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === PET_ID ? newerRow() : null
  );
  // One row matched, as for a status write whose row still holds the status it was read with.
  double.pet.updateMany.mockResolvedValue({ count: 1 });
  // A module mock, so neither `resetPrismaDouble` nor `restoreAllMocks` clears its calls.
  vi.mocked(dispatchPetPhotoUpdate).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await signInAsAdmin();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The single `prisma.pet.update` a successful edit makes. */
function petUpdateCall() {
  expect(double.pet.update).toHaveBeenCalledTimes(1);
  return double.pet.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
}

/** The single `prisma.pet.updateMany` a status write makes. */
function statusWriteCall() {
  expect(double.pet.updateMany).toHaveBeenCalledTimes(1);
  return double.pet.updateMany.mock.calls[0][0] as {
    where: { id: string; status?: string };
    data: Record<string, unknown>;
  };
}

const CHANGED_WHILE_SAVING = "This pet was changed or removed while saving. Reload and try again.";

describe("when the mirror and the database disagree", () => {
  it("is arranged so the mirror really holds the older copy", () => {
    expect(findServerPetById(PET_ID)?.description).toBe(fixture.description);
    expect(findServerPetById(PET_ID)?.customQrUrl).not.toBe("https://example.test/newer-qr.png");
  });

  it("a status change writes the status column and nothing else", async () => {
    const result = await updatePetStatus(PET_ID, "Pending");

    expect(result).toEqual({ success: true });
    const { where, data } = statusWriteCall();
    // Conditional on the status it was read with, so a change in between matches no row.
    expect(where).toEqual({ id: PET_ID, status: "Available" });
    expect(data).toEqual({ status: "Pending" });
    expect(double.pet.update).not.toHaveBeenCalled();
    expect(double.petUpdate.deleteMany).not.toHaveBeenCalled();
    expect(double.medicalTimelineEvent.deleteMany).not.toHaveBeenCalled();
    // The mirror now carries the database's copy with the new status, not the fixture's.
    expect(findServerPetById(PET_ID)).toMatchObject({
      status: "Pending",
      description: "Edited on another instance after this one loaded the fixture.",
    });
  });

  it("an edit carries over the database's birthDateIsEstimate, not the mirror's", async () => {
    expect(findServerPetById(PET_ID)?.birthDateIsEstimate).toBe(true);

    const result = await updatePet(PET_ID, editForm());

    expect(result.success).toBe(true);
    const { where, data } = petUpdateCall();
    expect(where).toEqual({ id: PET_ID, status: "Available" });
    expect(data).toMatchObject({
      description: "Submitted by this edit.",
      birthDateIsEstimate: false,
    });
  });
});

describe("an edit that omits a key the form usually sends (#212)", () => {
  it("keeps the stored gallery, QR, archive state and featured flag", async () => {
    const archivedAt = new Date("2026-10-01T00:00:00.000Z");
    double.pet.findUnique.mockResolvedValue({
      ...newerRow(),
      featured: true,
      isArchived: true,
      deletedAt: archivedAt,
      vaccinated: false,
      energyLevel: "High",
    });
    // `editForm()` carries none of galleryImages, customQrUrl, isArchived, featured, the
    // medical or compatibility flags, or energyLevel.
    const form = editForm();
    for (const key of ["galleryImages", "customQrUrl", "isArchived", "featured", "vaccinated", "energyLevel"]) {
      expect(form).not.toHaveProperty(key);
    }

    const result = await updatePet(PET_ID, form);

    expect(result.success).toBe(true);
    const { data } = petUpdateCall();
    expect(data).toMatchObject({
      galleryImages: ["https://example.test/newer-gallery.jpg"],
      customQrUrl: "https://example.test/newer-qr.png",
      isArchived: true,
      featured: true,
      vaccinated: false,
      energyLevel: "High",
      description: "Submitted by this edit.",
    });
    expect(result.data).toMatchObject({
      galleryImages: ["https://example.test/newer-gallery.jpg"],
      customQrUrl: "https://example.test/newer-qr.png",
      isArchived: true,
      featured: true,
    });
    // The stored archive time, in what is written and in what is returned: not cleared, and not
    // replaced by another moment.
    expect(new Date(data.deletedAt as Date).toISOString()).toBe(new Date(archivedAt).toISOString());
    expect(new Date(result.data!.deletedAt!).toISOString()).toBe(new Date(archivedAt).toISOString());
  });

  it("clears the gallery and QR when the edit submits them empty", async () => {
    const result = await updatePet(PET_ID, { ...editForm(), galleryImages: [], customQrUrl: "" });

    expect(result.success).toBe(true);
    expect(petUpdateCall().data).toMatchObject({ galleryImages: [], customQrUrl: null });
    expect(result.data).toMatchObject({ galleryImages: [], customQrUrl: null });
  });

  it("still refuses rehabilitation fields on a pet that is not under care", async () => {
    const result = await updatePet(PET_ID, { ...editForm(), rehabStage: "Hydrotherapy" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only allowed while the pet status/);
    expect(double.pet.update).not.toHaveBeenCalled();
  });
});

describe("an id that is not the stored id verbatim", () => {
  it.each([
    ["miscased", "PET-001"],
    ["padded", " pet-001"],
  ])("refuses a status change for a %s id and writes nothing", async (_kind, id) => {
    const result = await updatePetStatus(id, "Pending");

    expect(result).toEqual({ success: false, error: "Pet not found" });
    expect(double.pet.updateMany).not.toHaveBeenCalled();
    expect(double.pet.update).not.toHaveBeenCalled();
  });

  it.each([
    ["miscased", "PET-001"],
    ["padded", " pet-001"],
  ])("refuses an edit for a %s id and writes nothing", async (_kind, id) => {
    const result = await updatePet(id, editForm());

    expect(result).toEqual({ success: false, error: "Pet not found" });
    expect(double.pet.update).not.toHaveBeenCalled();
    expect(double.$transaction).not.toHaveBeenCalled();
  });
});

describe("a write that writes nothing", () => {
  it("refuses an edit when the status changed after it was read, and writes nothing", async () => {
    // Read as Available; by the write an approval has set Adopted. `update` with
    // `status = 'Available'` in its filter matches no row and Prisma raises P2025, which the
    // double reproduces; the batch transaction rolls the history deletes back with it.
    const statusAtWriteTime = "Adopted";
    double.pet.update.mockImplementation(async (args: { where: { status?: string } }) => {
      if (args.where.status !== undefined && args.where.status !== statusAtWriteTime) {
        throw Object.assign(new Error("Record to update not found."), { code: "P2025" });
      }
      return {};
    });

    const result = await updatePet(PET_ID, { ...editForm(), status: "Pending" as const });

    expect(result).toEqual({ success: false, error: CHANGED_WHILE_SAVING });
    expect(petUpdateCall().where).toEqual({ id: PET_ID, status: "Available" });
    expect(double.auditLog.create).not.toHaveBeenCalled();
    // The row may still exist, so the mirror keeps the copy as read, without the refused edit.
    expect(findServerPetById(PET_ID)).toMatchObject({
      status: "Available",
      description: "Edited on another instance after this one loaded the fixture.",
    });
  });

  it("refuses a status change when the status changed after it was read, and keeps the mirror", async () => {
    // Read as Available; by the write an approval has set Adopted, so `status = 'Available'`
    // matches no row and `updateMany` reports `count: 0`.
    double.pet.updateMany.mockResolvedValue({ count: 0 });

    const result = await updatePetStatus(PET_ID, "Pending");

    expect(result).toEqual({ success: false, error: CHANGED_WHILE_SAVING });
    expect(statusWriteCall().where).toEqual({ id: PET_ID, status: "Available" });
    expect(double.auditLog.create).not.toHaveBeenCalled();
    // The row still exists, so its mirror copy (the database's, as read) is not dropped, and not
    // given the status that was refused.
    expect(findServerPetById(PET_ID)?.status).toBe("Available");
  });

  it("writes a status move out of a stored status the enum does not know, matching on id", async () => {
    // `fromDbPetStatus` passes an unrecognised value through, and the state machine lets staff
    // move it to a canonical one. That used to throw inside the write's `try`, where the outage
    // swallow turned it into a success that wrote nothing.
    double.pet.findUnique.mockResolvedValue({ ...newerRow(), status: "Rehab" });

    const result = await updatePetStatus(PET_ID, "Available");

    expect(result).toEqual({ success: true });
    expect(statusWriteCall()).toEqual({ where: { id: PET_ID }, data: { status: "Available" } });
  });
});

describe("updateServerPet", () => {
  it("refuses an id that is not the baseline's stored id, and writes nothing", async () => {
    const pet = (await findServerPetByIdAsync(PET_ID))!;

    const edited = { ...pet, description: "Edited through a padded id." };

    await expect(
      updateServerPet(` ${PET_ID}`, edited, TEST_ADMIN_ACTOR, { updates: true }, { baseline: pet })
    ).rejects.toThrow(/is not the stored id/);
    expect(double.petUpdate.deleteMany).not.toHaveBeenCalled();
    expect(double.pet.update).not.toHaveBeenCalled();
  });

  it("reports only what a status write wrote, not the rest of the caller's object", async () => {
    const pet = (await findServerPetByIdAsync(PET_ID))!;

    const stored = await updateServerPet(
      PET_ID,
      { ...pet, status: "Pending", description: "Never written by a status change." },
      TEST_ADMIN_ACTOR,
      {},
      { baseline: pet, columns: "status" }
    );

    expect(stored).toMatchObject({ status: "Pending", description: pet.description });
    expect(findServerPetById(PET_ID)?.description).toBe(pet.description);
  });

  it("audits and returns what the database saw, while the mirror keeps its own copy", async () => {
    const pet = (await findServerPetByIdAsync(PET_ID))!;
    // Another write on this instance, after `pet` was read: the mirror's description now differs
    // from the baseline's. (The reverse, a mirror older than the baseline, is the same mismatch.)
    const newer = { ...pet, description: "Newer, from this instance." };
    await updateServerPet(PET_ID, newer, TEST_ADMIN_ACTOR, {}, { baseline: pet });

    const statusOnly = { baseline: pet, columns: "status" as const };
    const stored = await updateServerPet(PET_ID, { ...pet, status: "Pending" }, TEST_ADMIN_ACTOR, {}, statusOnly);

    // The row it was conditional on, with the one column it wrote.
    expect(stored).toMatchObject({ status: "Pending", description: pet.description });
    // The permanent audit row records only the change this write made.
    const { before, after } = getAuditLogs(1)[0].details as Record<string, Record<string, unknown>>;
    const changed = Object.keys(after).filter(
      (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])
    );
    expect(changed).toEqual(["status"]);
    // The mirror is not reverted to the baseline's description.
    expect(findServerPetById(PET_ID)).toMatchObject({
      status: "Pending",
      description: "Newer, from this instance.",
    });
  });

  it("refuses a status-only write that would also replace history", async () => {
    const pet = (await findServerPetByIdAsync(PET_ID))!;
    await expect(
      updateServerPet(PET_ID, pet, TEST_ADMIN_ACTOR, { updates: true }, { baseline: pet, columns: "status" })
    ).rejects.toThrow(/status-only write cannot replace history/);
    expect(double.pet.updateMany).not.toHaveBeenCalled();
  });
});

describe("when the database cannot be read", () => {
  it("refuses both actions rather than starting from the mirror", async () => {
    double.pet.findUnique.mockRejectedValue(new Error("connection refused"));

    const status = await updatePetStatus(PET_ID, "Pending");
    const edit = await updatePet(PET_ID, editForm());

    expect(status.success).toBe(false);
    expect(status.error).toMatch(/Could not read pet/);
    expect(edit.success).toBe(false);
    expect(edit.error).toMatch(/Could not read pet/);
    expect(double.pet.update).not.toHaveBeenCalled();
    expect(double.pet.updateMany).not.toHaveBeenCalled();
    expect(findServerPetById(PET_ID)?.status).toBe("Available");
  });
});

describe("a fault in mapping the row that was read", () => {
  it("still falls back to the mirror on the display path, as it always has", async () => {
    double.pet.findUnique.mockResolvedValue({ ...newerRow(), medicalTimeline: [null] });

    expect((await findServerPetByIdAsync(PET_ID))?.description).toBe(fixture.description);
    // And so the public profile is served rather than failing.
    expect((await getPetById(PET_ID))?.id).toBe(PET_ID);
  });

  it("surfaces as itself on a write path, not as a database outage", async () => {
    // A row the query returned but the mapper cannot read: not an outage, so not reported as one.
    double.pet.findUnique.mockResolvedValue({ ...newerRow(), medicalTimeline: [null] });

    const result = await updatePetStatus(PET_ID, "Pending");

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/Could not read pet/);
    expect(double.pet.updateMany).not.toHaveBeenCalled();
  });
});

describe("photo notifications", () => {
  it("diffs the submitted gallery against the database's, not the mirror's", async () => {
    const dbPhoto = "https://example.test/newer-gallery.jpg";
    const added = "https://example.test/added-by-this-edit.jpg";
    // The mirror (the fixture) has never seen `dbPhoto`, so diffing against it would mail
    // supporters about a photo another instance already announced.
    expect(findServerPetById(PET_ID)?.galleryImages).not.toContain(dbPhoto);

    const result = await updatePet(
      PET_ID,
      { ...editForm(), galleryImages: [dbPhoto, added] },
      { notifySponsors: true }
    );

    expect(result.success).toBe(true);
    expect(dispatchPetPhotoUpdate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchPetPhotoUpdate).mock.calls[0][0].newImageUrls).toEqual([added]);
  });
});
