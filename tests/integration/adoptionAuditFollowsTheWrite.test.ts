import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getPrismaDouble, resetPrismaDouble, wireTransaction, type PrismaDouble } from "./support/prismaDouble";
import { TEST_ADMIN_ACTOR } from "../setup/authSession";
import type { AdoptionApplicationRecord } from "@/types/application";

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

/**
 * A `PET_STATUS_TRANSITION_ADOPTED` audit row is written exactly when the approval's transaction
 * updated a `pets` row, and names that row.
 *
 * It used to be derived from the in-memory mirror: a legacy application with no `petId` updated
 * no row yet the mirror's name fallback marked an animal and audited it, and an approval for an
 * animal this instance's mirror did not hold updated the row and audited nothing (issue #101).
 */
let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(async () => {
  resetPrismaDouble(double);
  wireTransaction(double);
  const { resetAuditLogs } = await import("@/lib/domain/auditLog");
  resetAuditLogs();
});

function application(overrides: Partial<AdoptionApplicationRecord>): AdoptionApplicationRecord {
  return {
    id: "itest-app-audit",
    petId: "",
    petName: "Bella",
    applicantName: "Ahmad Razak",
    email: "ahmad@example.com",
    phone: "012-3456789",
    address: "Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    status: "UNDER_REVIEW",
    adminReviewNotes: "",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    ...overrides,
  } as AdoptionApplicationRecord;
}

/** Stores the application and makes the database answer with it under review. */
async function givenApplicationUnderReview(app: AdoptionApplicationRecord) {
  const { insertServerApplication } = await import("@/lib/server/applicationRepository");
  await insertServerApplication(app);
  (double.adoptionApplication as Record<string, unknown>).findUnique = vi
    .fn()
    .mockResolvedValue({ ...app, petId: app.petId || null, status: "UNDER_REVIEW" });
  double.adoptionApplication.updateMany.mockResolvedValue({ count: 1 });
}

async function approve(id: string) {
  const { atomicUpdateApplicationStatus } = await import("@/lib/server/applicationRepository");
  return atomicUpdateApplicationStatus(id, "APPROVED", "Approved.", TEST_ADMIN_ACTOR);
}

async function adoptionAuditRows() {
  const { getAuditLogs } = await import("@/lib/domain/auditLog");
  return getAuditLogs(1000).filter((e) => e.action === "PET_STATUS_TRANSITION_ADOPTED");
}

describe("the adoption audit row follows the database write", () => {
  it("writes none for a legacy application with no petId, and leaves the mirror alone", async () => {
    // `pets.json` seeds the mirror with a Bella (`pet-001`), which is what the name fallback used
    // to find and audit although the transaction never touched `pets`.
    const app = application({ petId: "", petName: "Bella" });
    await givenApplicationUnderReview(app);

    const result = await approve(app.id);

    expect(result).toEqual({ success: true });
    expect(double.pet.updateMany).not.toHaveBeenCalled();
    expect(await adoptionAuditRows()).toEqual([]);
    const { findServerPetById } = await import("@/lib/server/petRepository");
    expect(findServerPetById("pet-001")?.status).not.toBe("Adopted");
  });

  it("writes one naming the row for an animal this instance's mirror does not hold", async () => {
    // A cold serverless instance, an animal created after seeding: the mirror cannot resolve the
    // id, which used to mean the database recorded the adoption and the audit log said nothing.
    const app = application({ petId: "itest-cold-mirror-pet", petName: "Nova" });
    await givenApplicationUnderReview(app);
    double.pet.updateMany.mockResolvedValue({ count: 1 });

    const result = await approve(app.id);

    expect(result).toEqual({ success: true });
    expect(double.pet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "itest-cold-mirror-pet" } })
    );
    const rows = await adoptionAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe("itest-cold-mirror-pet");
  });

  it("writes none when the update matched no row", async () => {
    const app = application({ petId: "itest-gone-pet", petName: "Ghost" });
    await givenApplicationUnderReview(app);
    double.pet.updateMany.mockResolvedValue({ count: 0 });

    await approve(app.id);

    expect(await adoptionAuditRows()).toEqual([]);
  });
});
