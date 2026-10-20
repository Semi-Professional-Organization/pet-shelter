import { describe, it, expect } from "vitest";
import { getServerPetsAsync } from "@/lib/server/petRepository";
import {
  getServerApplicationsAsync,
  atomicUpdateApplicationStatus,
  insertServerApplication,
  deleteServerApplication,
  findServerApplicationById,
  findServerApplicationByIdAsync,
} from "@/lib/server/applicationRepository";
import { ROLES } from "@/lib/security/rbac";
import { findUserByEmail, listUsers } from "@/lib/server/userStore";

describe("Database & Persistence Integration Layer", () => {
  const mockAdminActor = {
    id: "usr-admin-01",
    email: "admin@hopeforstrays.org",
    name: "Dr. Sarah Tan",
    role: ROLES.SUPER_ADMIN,
    expiresAt: Date.now() + 86400000,
  };

  it("retrieves seeded pets list through persistence store", async () => {
    const pets = await getServerPetsAsync();
    expect(Array.isArray(pets)).toBe(true);
    expect(pets.length).toBeGreaterThan(0);
    expect(pets.some((p) => p.name === "Bella")).toBe(true);
  });

  it("retrieves seeded staff users through user store", async () => {
    const users = await listUsers();
    expect(users.length).toBeGreaterThanOrEqual(3);

    const admin = await findUserByEmail("admin@hopeforstrays.org");
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe("SUPER_ADMIN");
    expect(admin?.name).toBe("Dr. Sarah Tan");
  });

  it("executes multi-entity atomic application approval", async () => {
    const apps = await getServerApplicationsAsync();
    expect(apps.length).toBeGreaterThan(0);

    const appToReview = apps.find((a) => a.id === "app-002");
    expect(appToReview).toBeDefined();

    if (appToReview) {
      const result = await atomicUpdateApplicationStatus(
        appToReview.id,
        "UNDER_REVIEW",
        "Staff interview scheduled",
        mockAdminActor
      );
      expect(result.success).toBe(true);

      const approvedResult = await atomicUpdateApplicationStatus(
        appToReview.id,
        "APPROVED",
        "Home visit passed, approved for adoption",
        mockAdminActor
      );
      expect(approvedResult.success).toBe(true);
    }
  });

  it("inserts and deletes an application while keeping memory store synchronized", async () => {
    const testApp = {
      id: "app-test-sync-01",
      petId: "pet-001",
      petName: "Luna",
      applicantName: "Integration Test Applicant",
      email: "test.applicant@example.com",
      phone: "+60123456789",
      address: "123 Test Street, Petaling Jaya",
      housingType: "Landed House",
      hasFencedYard: "Yes",
      currentPets: "None",
      householdExperience: "Experienced",
      status: "SUBMITTED" as const,
      createdAt: new Date().toISOString().split("T")[0],
      updatedAt: new Date().toISOString().split("T")[0],
    };

    await insertServerApplication(testApp);

    const found = findServerApplicationById(testApp.id);
    expect(found).not.toBeNull();
    expect(found?.applicantName).toBe("Integration Test Applicant");

    const foundAsync = await findServerApplicationByIdAsync(testApp.id);
    expect(foundAsync).not.toBeNull();
    expect(foundAsync?.applicantName).toBe("Integration Test Applicant");

    const deleted = await deleteServerApplication(testApp.id, mockAdminActor);
    expect(deleted).toBe(true);

    const foundAfterDelete = findServerApplicationById(testApp.id);
    expect(foundAfterDelete).toBeNull();

    const foundAsyncAfterDelete = await findServerApplicationByIdAsync(testApp.id);
    expect(foundAsyncAfterDelete).toBeNull();

    const deleteAgain = await deleteServerApplication(testApp.id, mockAdminActor);
    expect(deleteAgain).toBe(false);
  });
});
