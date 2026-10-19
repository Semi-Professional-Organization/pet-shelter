import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { routerMock, setMockLocation } from "../setup/nextMocks";
import { setupUser } from "./support/render";

const mocks = vi.hoisted(() => ({ acceptInvitation: vi.fn(), enterAdminConsole: vi.fn() }));

vi.mock("@/actions/members", () => ({ acceptInvitation: mocks.acceptInvitation }));
vi.mock("@/lib/client/adminAuth", () => ({ enterAdminConsole: mocks.enterAdminConsole }));

import AcceptInvitationPage from "@/app/admin/invite/page";

/**
 * Where an accepted invitation goes.
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
    setMockLocation("/admin/invite", "token=a-single-use-token&email=new.editor%40hopeforstrays.org");
  });

  async function activate(): Promise<void> {
    const user = setupUser();
    const { container } = render(<AcceptInvitationPage />);

    await user.type(container.querySelector("#invite-password")!, "a-long-enough-password");
    await user.type(container.querySelector("#invite-confirm-password")!, "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: /Activate Staff Account/i }));
  }

  it("enters the console by a document load once the invitation is accepted", async () => {
    mocks.acceptInvitation.mockResolvedValue({
      success: true,
      data: { email: "new.editor@hopeforstrays.org", name: "New Editor" },
      status: 200,
    });

    await activate();

    // It learns no role to cache, so it must not leave the previous person as the
    // console's fallback on a shared browser.
    expect(mocks.enterAdminConsole).toHaveBeenCalledExactlyOnceWith({ forgetCachedUser: true });
    expect(routerMock.push).not.toHaveBeenCalled();
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
