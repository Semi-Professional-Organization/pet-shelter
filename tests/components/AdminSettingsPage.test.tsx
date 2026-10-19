import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { signInAs } from "../setup/authSession";
import { ROLES, type Role } from "@/lib/security/permissions";

const settingsActions = vi.hoisted(() => ({
  loadShelterSettings: vi.fn(),
  updateShelterSettings: vi.fn(),
  sendTestEmailAction: vi.fn(),
  getVolunteerFormLinks: vi.fn(),
}));

vi.mock("@/actions/settings", () => settingsActions);
vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));

import AdminSettingsPage from "@/app/admin/settings/page";

/**
 * What /admin/settings shows a Volunteer Coordinator.
 *
 * The section opens for SEND_SHELTER_EMAIL, so a coordinator can send a test email. Every
 * other control needs MANAGE_SETTINGS, which a coordinator lacks, yet the whole form
 * rendered: filled from this browser's copy or the built-in defaults, because the read was
 * refused, with a "Save All Settings" that was refused too. The first case fails against
 * the page before 2026-10-19.
 */
async function renderSettingsAs(role: Role): Promise<void> {
  await signInAs(role);
  const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
  vi.mocked(findMemberAuthStateById).mockResolvedValue({
    role,
    status: "ACTIVE",
    name: "Test Member",
    email: "member@hopeforstrays.org",
  });

  // The page became a Server Component that gates and then renders the form; before, it
  // was the client form itself. Rendered either way so the old page can be held to this.
  const Page = AdminSettingsPage as unknown as () => ReactElement | Promise<ReactElement>;
  const isAsync = Page.constructor.name === "AsyncFunction";
  render(isAsync ? await Page() : <Page />);
}

describe("/admin/settings", () => {
  beforeEach(() => {
    settingsActions.loadShelterSettings.mockReset().mockResolvedValue({ settings: {}, fromDatabase: true });
    settingsActions.getVolunteerFormLinks.mockReset().mockResolvedValue({ volunteerFormResponsesUrl: "" });
  });

  it("shows a Volunteer Coordinator the test email tool and nothing it cannot save", async () => {
    await renderSettingsAs(ROLES.VOLUNTEER_COORDINATOR);

    expect(screen.queryByRole("button", { name: /Save All Settings/i })).toBeNull();
    expect(screen.queryByLabelText(/Resend API Key/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Send Test Email/i })).toBeInTheDocument();
    expect(settingsActions.loadShelterSettings).not.toHaveBeenCalled();
  });

  it("shows a Super Admin the whole form", async () => {
    await renderSettingsAs(ROLES.SUPER_ADMIN);

    expect(await screen.findByRole("button", { name: /Save All Settings/i })).toBeInTheDocument();
    expect(settingsActions.loadShelterSettings).toHaveBeenCalled();
  });
});
