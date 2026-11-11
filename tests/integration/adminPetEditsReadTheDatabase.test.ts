import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import initialPets from "@/data/pets.json";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";
import { signInAsAdmin } from "../setup/authSession";
import { updatePet, updatePetStatus } from "@/actions/pets";
import { findServerPetById } from "@/lib/server/petRepository";

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

const PET_ID = "pet-001";
const fixture = initialPets.find((p) => p.id === PET_ID)!;

/** The database's copy: newer than the fixture in every column a status change must not touch. */
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
  vi.unstubAllEnvs();
  vi.stubEnv("STRICT_PERSISTENCE", "false");
  vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
  // Postgres's `=`: case-sensitive, and the repository trims before it asks.
  double.pet.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === PET_ID ? newerRow() : null
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await signInAsAdmin();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The single `prisma.pet.update` a successful write makes. */
function petUpdateCall() {
  expect(double.pet.update).toHaveBeenCalledTimes(1);
  return double.pet.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
}

describe("when the mirror and the database disagree", () => {
  it("is arranged so the mirror really holds the older copy", () => {
    expect(findServerPetById(PET_ID)?.description).toBe(fixture.description);
    expect(findServerPetById(PET_ID)?.customQrUrl).not.toBe("https://example.test/newer-qr.png");
  });

  it("a status change writes the status column and nothing else", async () => {
    const result = await updatePetStatus(PET_ID, "Pending");

    expect(result).toEqual({ success: true });
    const { where, data } = petUpdateCall();
    expect(where).toEqual({ id: PET_ID });
    expect(data).toEqual({ status: "Pending" });
    expect(double.petUpdate.deleteMany).not.toHaveBeenCalled();
    expect(double.medicalTimelineEvent.deleteMany).not.toHaveBeenCalled();
    // The mirror now carries the database's copy with the new status, not the fixture's.
    expect(findServerPetById(PET_ID)).toMatchObject({
      status: "Pending",
      description: "Edited on another instance after this one loaded the fixture.",
    });
  });

  it("an edit carries over the database's columns, not the mirror's", async () => {
    expect(findServerPetById(PET_ID)?.birthDateIsEstimate).toBe(true);

    const result = await updatePet(PET_ID, editForm());

    expect(result.success).toBe(true);
    const { where, data } = petUpdateCall();
    expect(where).toEqual({ id: PET_ID });
    expect(data).toMatchObject({
      description: "Submitted by this edit.",
      birthDateIsEstimate: false,
    });
  });
});

describe("an id that is not the stored id verbatim", () => {
  it.each([
    ["miscased", "PET-001"],
    ["padded", " pet-001"],
  ])("refuses a status change for a %s id and writes nothing", async (_kind, id) => {
    const result = await updatePetStatus(id, "Pending");

    expect(result).toEqual({ success: false, error: "Pet not found" });
    expect(double.pet.update).not.toHaveBeenCalled();
    expect(double.$transaction).not.toHaveBeenCalled();
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
  it("reports failure when the row is gone by the time it is written (P2025)", async () => {
    double.pet.update.mockRejectedValue(
      Object.assign(new Error("Record to update not found."), { code: "P2025" })
    );

    expect(await updatePetStatus(PET_ID, "Pending")).toEqual({
      success: false,
      error: "Pet not found",
    });
    expect(await updatePet(PET_ID, editForm())).toEqual({
      success: false,
      error: "Pet not found",
    });
    // No mirror write and no audit row for a write that did not happen.
    expect(findServerPetById(PET_ID)?.status).toBe("Available");
    expect(double.auditLog.create).not.toHaveBeenCalled();
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
    expect(findServerPetById(PET_ID)?.status).toBe("Available");
  });
});
