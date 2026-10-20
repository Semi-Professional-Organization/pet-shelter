import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { routerMock, setMockLocation } from "../setup/nextMocks";
import { setupUser } from "./support/render";

const mocks = vi.hoisted(() => ({ acceptInvitation: vi.fn(), enterAdminConsole: vi.fn() }));

vi.mock("@/actions/members", () => ({ acceptInvitation: mocks.acceptInvitation }));
vi.mock("@/actions/auth", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  logoutAction: vi.fn(),
  getCurrentUserAction: vi.fn(),
}));
// The real module, so what the browser caches is observed; only the document load is
// replaced, which jsdom cannot perform.
vi.mock("@/lib/client/adminAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/adminAuth")>()),
  enterAdminConsole: mocks.enterAdminConsole,
}));

import AcceptInvitationPage from "@/app/admin/invite/page";

const STORAGE_KEY = "hope_for_strays_admin_session";

/**
 * Where an accepted invitation goes, and who the console then believes is signed in.
 *
 * It pushed to `/admin/pets` for every invited role, though an invitation can carry any of
 * the five and only two open that page; and as a client-side push it met the admin layout
 * that mounted on this page while signed out, which bounced it to `/admin/login`. It now
 * enters the console by a document load of `/admin`, as sign-in does.
 */
describe("/admin/invite", () => {
  beforeEach(() => {
    mocks.acceptInvitation.mockReset();
    mocks.enterAdminConsole.mockClear();
    localStorage.clear();
    setMockLocation("/admin/invite", "token=a-single-use-token&email=new.editor%40hopeforstrays.org");
  });

  async function activate(): Promise<void> {
    const user = setupUser();
    const { container } = render(<AcceptInvitationPage />);

    await user.type(container.querySelector("#invite-password")!, "a-long-enough-password");
    await user.type(container.querySelector("#invite-confirm-password")!, "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: /Activate Staff Account/i }));
  }

  const NEW_MEMBER = {
    id: "usr-new-editor",
    email: "new.editor@hopeforstrays.org",
    name: "New Editor",
    role: "CONTENT_EDITOR",
    expiresAt: 1_900_000_000_000,
  };

  it("enters the console by a document load once the invitation is accepted", async () => {
    mocks.acceptInvitation.mockResolvedValue({ success: true, data: NEW_MEMBER, status: 200 });

    await activate();

    expect(mocks.enterAdminConsole).toHaveBeenCalledOnce();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("caches the member the invitation signed in, as sign-in does", async () => {
    // The console falls back on this copy if its first session check fails. Forgetting it
    // instead left nobody, and the console sent a member who had just set a password to
    // the sign-in page; keeping it would have left the previous person on a shared
    // browser. Fails against the page before 2026-10-20, which cached no one.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: "usr-previous", email: "previous@hopeforstrays.org", name: "Previous", role: "SUPER_ADMIN" })
    );
    mocks.acceptInvitation.mockResolvedValue({ success: true, data: NEW_MEMBER, status: 200 });

    await activate();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(NEW_MEMBER);
  });

  it("stays put and says why when the invitation is refused", async () => {
    mocks.acceptInvitation.mockResolvedValue({
      success: false,
      error: "This invitation link is not valid.",
      status: 400,
    });

    await activate();

    expect(mocks.enterAdminConsole).not.toHaveBeenCalled();
    expect(screen.getByText("This invitation link is not valid.")).toBeInTheDocument();
  });
});
