import { describe, it, expect, vi, beforeEach } from "vitest";
import { signInAs } from "../setup/authSession";
import { ROLES } from "@/lib/security/permissions";

/**
 * The pets and applications boards let a failed read surface.
 *
 * Each page caught any error from its read and handed the client table `undefined`, which
 * falls back to the browser's copy: the bundled demo animals or sample applicants, every
 * control live, with nothing to say they were not the shelter's records. The section gate
 * now settles access first, so the catch only hid other failures. Both cases fail against
 * the pages that caught.
 */

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));
vi.mock("@/actions/pets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/actions/pets")>()),
  getAdminPets: vi.fn(),
}));
vi.mock("@/actions/applications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/actions/applications")>()),
  getApplications: vi.fn(),
}));

const READ_FAILED = new Error("relation \"pets\" does not exist");

describe("admin boards", () => {
  beforeEach(async () => {
    await signInAs(ROLES.SUPER_ADMIN);
    const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
    vi.mocked(findMemberAuthStateById).mockResolvedValue({
      role: ROLES.SUPER_ADMIN,
      status: "ACTIVE",
      name: "Test Member",
      email: "member@hopeforstrays.org",
    });
  });

  it("let the pets read fail rather than show demo animals as the inventory", async () => {
    const { getAdminPets } = await import("@/actions/pets");
    vi.mocked(getAdminPets).mockRejectedValue(READ_FAILED);
    const { default: AdminPetsPage } = await import("@/app/admin/pets/page");

    await expect(AdminPetsPage()).rejects.toBe(READ_FAILED);
  });

  it("let the applications read fail rather than show sample applicants as the shelter's", async () => {
    const { getApplications } = await import("@/actions/applications");
    vi.mocked(getApplications).mockRejectedValue(READ_FAILED);
    const { default: AdminApplicationsPage } = await import("@/app/admin/applications/page");

    await expect(AdminApplicationsPage()).rejects.toBe(READ_FAILED);
  });
});
