import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { setMockLocation } from "../setup/nextMocks";

const actions = vi.hoisted(() => ({ getCurrentUserAction: vi.fn() }));

vi.mock("@/actions/auth", () => ({
  getCurrentUserAction: actions.getCurrentUserAction,
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  logoutAction: vi.fn(),
}));
vi.mock("@/actions/settings", () => ({
  getVolunteerFormLinks: vi.fn().mockResolvedValue({ volunteerFormResponsesUrl: "" }),
}));

import AdminLayout from "@/app/admin/layout";

/**
 * When the admin layout asks the server who is signed in.
 *
 * The check is a member-row read through the DAL. The layout also wraps /admin/login and
 * /admin/invite, renders them as they are, and used to run the check there too, for an
 * answer nothing read; on a signed-out visit it also wiped the cached copy a sign-in was
 * about to rely on. The first case fails against that layout.
 */
describe("admin layout session check", () => {
  beforeEach(() => {
    actions.getCurrentUserAction.mockReset().mockResolvedValue({ user: null });
  });

  it.each(["/admin/login", "/admin/invite"])("is not made on %s", (path) => {
    setMockLocation(path);

    render(
      <AdminLayout>
        <p>page</p>
      </AdminLayout>
    );

    expect(actions.getCurrentUserAction).not.toHaveBeenCalled();
  });

  it("is made on a section", () => {
    setMockLocation("/admin/applications");

    render(
      <AdminLayout>
        <p>page</p>
      </AdminLayout>
    );

    expect(actions.getCurrentUserAction).toHaveBeenCalledTimes(1);
  });
});
