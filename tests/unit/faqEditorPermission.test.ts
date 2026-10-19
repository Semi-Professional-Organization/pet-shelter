import { describe, it, expect, vi, beforeEach } from "vitest";
import { signInAs } from "../setup/authSession";
import { ROLES, type Role } from "@/lib/security/permissions";

/**
 * Who may edit FAQs: MANAGE_CONTENT holders, the capability the FAQ tab, the bulletin and
 * transparency editors and the Content Editor's role description all name.
 *
 * It was the role list `[ADMIN, COORDINATOR]`, written before CONTENT_EDITOR existed. So
 * the FAQ tab was offered to a Content Editor whom every FAQ action refused, while a
 * Volunteer Coordinator, offered no FAQ tab, could edit FAQs by URL. Both cases below fail
 * against that list. The decision: tasks/decisions/2026-10-19-faq-editing-is-manage-content.md.
 *
 * The guard runs before the form is validated, so an empty submission tells the two apart:
 * a refusal names the permission; an admitted member gets the validation error instead.
 */

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));

async function editFaqAs(role: Role): Promise<{ success: boolean; error?: string }> {
  await signInAs(role);
  const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
  vi.mocked(findMemberAuthStateById).mockResolvedValue({
    role,
    status: "ACTIVE",
    name: "Test Member",
    email: "member@hopeforstrays.org",
  });
  const { createFaqAction } = await import("@/actions/faqs");
  return createFaqAction({} as never);
}

const REFUSAL = /not authorized for this operation/;

describe("FAQ editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([ROLES.CONTENT_EDITOR, ROLES.SUPER_ADMIN, ROLES.ADMIN])("admits %s", async (role) => {
    const res = await editFaqAs(role);

    expect(res.success).toBe(false);
    expect(res.error).not.toMatch(REFUSAL);
  });

  it.each([ROLES.VOLUNTEER_COORDINATOR, ROLES.COORDINATOR, ROLES.ANIMAL_MANAGER, ROLES.STAFF, ROLES.VOLUNTEER])(
    "refuses %s",
    async (role) => {
      const res = await editFaqAs(role);

      expect(res).toEqual({ success: false, error: expect.stringMatching(REFUSAL) });
    }
  );
});
