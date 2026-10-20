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
 * A decision is checked against the database's row, not this instance's mirror.
 *
 * `atomicUpdateApplicationStatus` validated the transition against the in-memory mirror
 * before its transaction. On a host with several instances the mirror can hold an older
 * status than the database, and the check refused a move the database allows. Since the
 * review dialog sends every decision to the server and waits for its answer, a reviewer saw
 * that refusal. Fails against the repository before 2026-10-20.
 */
let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(double);
  wireTransaction(double);
});

const APPLICATION: AdoptionApplicationRecord = {
  id: "itest-app-stale",
  petId: "",
  petName: "Milo",
  applicantName: "Ahmad Razak",
  email: "ahmad@example.com",
  phone: "012-3456789",
  address: "Petaling Jaya",
  housingType: "landed_terrace",
  hasFencedYard: "yes",
  currentPets: "none",
  householdExperience: "experienced",
  status: "SUBMITTED",
  adminReviewNotes: "",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
} as AdoptionApplicationRecord;

describe("atomicUpdateApplicationStatus with a database", () => {
  it("approves an application the database has under review while this mirror says submitted", async () => {
    const { insertServerApplication, atomicUpdateApplicationStatus } = await import(
      "@/lib/server/applicationRepository"
    );
    await insertServerApplication(APPLICATION);
    // Another instance moved it on; this one never heard.
    (double.adoptionApplication as Record<string, unknown>).findUnique = vi
      .fn()
      .mockResolvedValue({ ...APPLICATION, petId: null, status: "UNDER_REVIEW" });
    double.adoptionApplication.updateMany.mockResolvedValue({ count: 1 });

    const result = await atomicUpdateApplicationStatus(APPLICATION.id, "APPROVED", "Approved.", TEST_ADMIN_ACTOR);

    expect(result).toEqual({ success: true });
    expect(double.adoptionApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: APPLICATION.id, status: "UNDER_REVIEW" },
        data: expect.objectContaining({ status: "APPROVED" }),
      })
    );
  });
});
