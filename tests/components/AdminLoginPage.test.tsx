import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { routerMock } from "../setup/nextMocks";
import { setupUser } from "./support/render";

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), enterAdminConsole: vi.fn() }));

vi.mock("@/lib/client/adminAuth", () => ({
  // Both shapes, so this file can be run against the page before and after sign-in moved
  // out of the hook: `useAdminAuth().login` then, `signInStaff` now.
  useAdminAuth: () => auth,
  signInStaff: auth.login,
  registerStaff: auth.register,
  enterAdminConsole: auth.enterAdminConsole,
}));

import AdminLoginPage from "@/app/admin/login/page";

/**
 * The staff sign-in page must not hand out the seeded accounts in production.
 *
 * On master it pre-filled `admin@hopeforstrays.org` / `admin123`, so pressing
 * "Sign In to Portal" on an untouched page signed in as SUPER_ADMIN, and it rendered
 * one-click buttons for five seeded accounts. The server refusal is the control
 * (`tests/unit/security/publishedStaffPasswords.test.ts`); this is the advertisement.
 */
describe("/admin/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("in production, pre-fills nothing and offers no demo sign-in", () => {
    vi.stubEnv("NODE_ENV", "production");

    const { container } = render(<AdminLoginPage />);

    expect(container.querySelector<HTMLInputElement>("#login-email")?.value).toBe("");
    expect(container.querySelector<HTMLInputElement>("#login-password")?.value).toBe("");
    expect(screen.queryByText(/Quick Demo/i)).toBeNull();
    expect(container.textContent).not.toMatch(/hopeforstrays\.org/);
  });

  it("outside production, keeps the offline demo sign-in", () => {
    render(<AdminLoginPage />);

    expect(screen.getByText(/Quick Demo/i)).toBeInTheDocument();
  });
});

/**
 * Where a successful sign-in goes, and how.
 *
 * All three ways in did `router.push("/admin/pets")`. That page only Super Admins and
 * Animal Managers can open, so a new STAFF account's first screen was a refusal (seen in
 * production on 2026-10-19). And a client-side push is bounced back to the sign-in page
 * in a browser with no cached user: the admin layout mounted here while signed out and
 * keeps that verdict across client navigation (observed locally; see
 * `tasks/decisions/2026-10-19-died-a-client-side-push-into-the-console-after-sign-in.md`).
 * `enterAdminConsole` is a document load of `/admin`, which picks the section for the
 * member's live role; `tests/unit/adminLanding.test.ts` pins that choice per role.
 */
function expectEnteredTheConsole(): void {
  expect(auth.enterAdminConsole).toHaveBeenCalledTimes(1);
  expect(routerMock.push).not.toHaveBeenCalled();
}

describe("/admin/login enters the console by a document load, never a push to one section", () => {
  beforeEach(() => {
    auth.login.mockReset();
    auth.register.mockReset();
    auth.enterAdminConsole.mockClear();
  });

  it("after signing in", async () => {
    auth.login.mockResolvedValue({ success: true });
    const user = setupUser();
    const { container } = render(<AdminLoginPage />);

    await user.type(container.querySelector("#login-email")!, "new.staff@hopeforstrays.org");
    await user.type(container.querySelector("#login-password")!, "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: /Sign In to Portal/i }));

    expectEnteredTheConsole();
  });

  it("after creating an account, which is always STAFF", async () => {
    auth.register.mockResolvedValue({ success: true });
    const user = setupUser();
    const { container } = render(<AdminLoginPage />);

    await user.click(screen.getByRole("button", { name: /Create Account/i }));
    await user.type(container.querySelector("#reg-name")!, "Nurul Huda");
    await user.type(container.querySelector("#reg-email")!, "nurul@hopeforstrays.org");
    await user.type(container.querySelector("#reg-invite-code")!, "an-invite-code");
    await user.type(container.querySelector("#reg-password")!, "a-long-enough-password");
    await user.type(container.querySelector("#reg-confirm-password")!, "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: /Create Account & Enter/i }));

    expectEnteredTheConsole();
  });

  it("after a demo sign-in as Staff", async () => {
    auth.login.mockResolvedValue({ success: true });
    const user = setupUser();
    render(<AdminLoginPage />);

    await user.click(screen.getByRole("button", { name: "Staff" }));

    expectEnteredTheConsole();
  });

  it("not after a refused sign-in", async () => {
    auth.login.mockResolvedValue({ success: false, error: "Invalid staff email or password." });
    const user = setupUser();
    const { container } = render(<AdminLoginPage />);

    await user.type(container.querySelector("#login-email")!, "new.staff@hopeforstrays.org");
    await user.type(container.querySelector("#login-password")!, "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: /Sign In to Portal/i }));

    expect(auth.enterAdminConsole).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid staff email or password/)).toBeInTheDocument();
  });
});
