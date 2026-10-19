import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { setMockLocation } from "../setup/nextMocks";
import { normalizeRole, ROLES } from "@/lib/security/permissions";

const auth = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("@/lib/client/adminAuth", () => ({ useAdminAuth: () => auth.current }));
vi.mock("@/actions/settings", () => ({
  getVolunteerFormLinks: vi.fn().mockResolvedValue({ volunteerFormResponsesUrl: "" }),
}));

import AdminLayout from "@/app/admin/layout";

/**
 * The admin nav offers a tab exactly when its section's page opens for the member.
 *
 * The case that fails against the layout before 2026-10-19 is VOLUNTEER. The hook folded
 * the role onto the canonical set before the layout gated on it, and `normalizeRole` folds
 * VOLUNTEER onto STAFF, so a volunteer was offered "Adoption Applications", which every
 * guard behind it refuses: VOLUNTEER never held STAFF's read of applicant data.
 */
function signedInAs(role: string): void {
  auth.current = {
    user: { id: "usr-member", email: "member@hopeforstrays.org", name: "Test Member", role },
    // What the hook also returned until 2026-10-19, kept so the old layout is tested fairly.
    role: normalizeRole(role),
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  };
}

function tabs(): string[] {
  const nav = screen.getByRole("navigation", { name: "Admin Tabs" });
  return within(nav)
    .queryAllByRole("link")
    .map((link) => link.getAttribute("href") ?? "");
}

const ALL = [
  "/admin/pets",
  "/admin/applications",
  "/admin/faqs",
  "/admin/transparency",
  "/admin/donations",
  "/admin/members",
  "/admin/audit",
  "/admin/settings",
  "/admin/bulletins",
];
const COORDINATOR_TABS = ["/admin/applications", "/admin/donations", "/admin/audit", "/admin/settings"];

describe("admin nav", () => {
  beforeEach(() => {
    setMockLocation("/admin/applications");
  });

  it.each<[string, string[]]>([
    [ROLES.SUPER_ADMIN, ALL],
    [ROLES.ANIMAL_MANAGER, ["/admin/pets", "/admin/applications"]],
    [ROLES.CONTENT_EDITOR, ["/admin/faqs", "/admin/transparency", "/admin/bulletins"]],
    [ROLES.VOLUNTEER_COORDINATOR, COORDINATOR_TABS],
    [ROLES.STAFF, ["/admin/applications"]],
    [ROLES.ADMIN, ALL],
    [ROLES.COORDINATOR, COORDINATOR_TABS],
    [ROLES.VOLUNTEER, []],
  ])("offers %s the tabs %j", (role, expected) => {
    signedInAs(role);

    render(
      <AdminLayout>
        <p>section</p>
      </AdminLayout>
    );

    expect(tabs()).toEqual(expected);
  });
});
