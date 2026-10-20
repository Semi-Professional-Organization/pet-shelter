import { describe, it, expect } from "vitest";
import {
  atomicUpdateApplicationStatus,
  findServerApplicationById,
  insertServerApplication,
} from "@/lib/server/applicationRepository";
import { findServerPetById, updateServerPet } from "@/lib/server/petRepository";
import { TEST_ADMIN_ACTOR } from "../setup/authSession";
import type { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";

/**
 * An approval's consequences run when an application becomes approved, not on every save.
 *
 * Approving marks the animal adopted and closes every other open application for it. That
 * ran on any write whose status was APPROVED, including a save that only changed the notes
 * of an application approved long ago, and scheduling a meet and greet on one: an animal
 * returned to the shelter since went back to Adopted, and the people who had applied for it
 * since were rejected. Fails against the repository before 2026-10-20.
 */
const PET_ID = "pet-001";

function application(id: string, status: ApplicationStatus): AdoptionApplicationRecord {
  const pet = findServerPetById(PET_ID)!;
  return {
    id,
    petId: pet.id,
    petName: pet.name,
    applicantName: `Applicant ${id}`,
    email: `${id}@example.com`,
    phone: "012-345 6789",
    address: "Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    status,
    adminReviewNotes: "",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  } as AdoptionApplicationRecord;
}

describe("atomicUpdateApplicationStatus", () => {
  it("does not re-run an approval when an approved application is saved again", async () => {
    await insertServerApplication(application("app-approved", "UNDER_REVIEW"));
    expect((await atomicUpdateApplicationStatus("app-approved", "APPROVED", "Approved.", TEST_ADMIN_ACTOR)).success).toBe(true);
    expect(findServerPetById(PET_ID)?.status).toBe("Adopted");

    // The adoption falls through: the animal comes back and someone new applies for it.
    const pet = findServerPetById(PET_ID)!;
    await updateServerPet(PET_ID, { ...pet, status: "Available" }, TEST_ADMIN_ACTOR);
    await insertServerApplication(application("app-since", "SUBMITTED"));

    const resaved = await atomicUpdateApplicationStatus(
      "app-approved",
      "APPROVED",
      "Approved. Adopter moved house.",
      TEST_ADMIN_ACTOR
    );

    expect(resaved.success).toBe(true);
    expect(findServerApplicationById("app-approved")?.adminReviewNotes).toBe("Approved. Adopter moved house.");
    expect(findServerApplicationById("app-since")?.status).toBe("SUBMITTED");
    expect(findServerPetById(PET_ID)?.status).toBe("Available");
  });
});
