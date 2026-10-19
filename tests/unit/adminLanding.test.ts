import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { getLastRedirect, MockNavigationError } from "../setup/nextMocks";
import { signInAs, identityForRole } from "../setup/authSession";
import { ROLES, type Role } from "@/lib/security/permissions";

/**
 * Where a member lands on entering the admin console.
 *
 * Every sign-in used to push to `/admin/pets`, and `/admin` itself rendered the pet
 * inventory, so a new STAFF account's first screen was "Forbidden — permission
 * required" (observed in production on 2026-10-19). `/admin` now chooses the first
 * section the member's live role opens. These cases fail against that version:
 * it rendered for every role and redirected nobody.
 */

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));

type LiveRow = { role: string; status: string; name: string; email: string };

async function liveRowIs(row: LiveRow | null): Promise<void> {
  const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
  vi.mocked(findMemberAuthStateById).mockResolvedValue(row);
}

function activeRow(role: string): LiveRow {
  return { role, status: "ACTIVE", name: "Test Member", email: "member@hopeforstrays.org" };
}

/** Renders `/admin` and returns where it redirected, or the markup it rendered instead. */
async function enterConsole(): Promise<{ redirectedTo: string | null; html: string | null }> {
  const { default: AdminIndexPage } = await import("@/app/admin/page");
  try {
    const element = (await AdminIndexPage()) as ReactElement;
    return { redirectedTo: null, html: renderToStaticMarkup(element) };
  } catch (error) {
    if (error instanceof MockNavigationError) return { redirectedTo: getLastRedirect(), html: null };
    throw error;
  }
}

describe("/admin sends each member to the first section their role opens", () => {
  beforeEach(async () => {
    await liveRowIs(null);
  });

  it.each<[Role, string]>([
    [ROLES.STAFF, "/admin/applications"],
    [ROLES.VOLUNTEER_COORDINATOR, "/admin/applications"],
    [ROLES.CONTENT_EDITOR, "/admin/faqs"],
    [ROLES.ANIMAL_MANAGER, "/admin/pets"],
    [ROLES.SUPER_ADMIN, "/admin/pets"],
  ])("lands %s on %s", async (role, expected) => {
    await signInAs(role);
    await liveRowIs(activeRow(role));

    expect((await enterConsole()).redirectedTo).toBe(expected);
  });

  it.each<[Role, string]>([
    [ROLES.ADMIN, "/admin/pets"],
    [ROLES.COORDINATOR, "/admin/applications"],
  ])("lands a row still carrying the alias %s on %s", async (role, expected) => {
    await signInAs(role);
    await liveRowIs(activeRow(role));

    expect((await enterConsole()).redirectedTo).toBe(expected);
  });

  it("chooses from the live role, not the one sealed into the cookie", async () => {
    // Demoted since signing in: the cookie still says Super Admin, the row says
    // STAFF, and every section's gate reads the row.
    await signInAs(ROLES.SUPER_ADMIN);
    await liveRowIs(activeRow(ROLES.STAFF));

    expect((await enterConsole()).redirectedTo).toBe("/admin/applications");
  });

  it("tells a VOLUNTEER it has no section instead of sending it to one that refuses it", async () => {
    // Sign-in seals VOLUNTEER as STAFF, which would land it on applications;
    // the row keeps VOLUNTEER, which holds no permission at all.
    await signInAs({ ...identityForRole(ROLES.VOLUNTEER), role: ROLES.STAFF });
    await liveRowIs(activeRow(ROLES.VOLUNTEER));

    const { redirectedTo, html } = await enterConsole();

    expect(redirectedTo).toBeNull();
    expect(html).toContain("Your account has no admin sections yet");
  });

  it("sends a signed-out visitor to sign in", async () => {
    expect((await enterConsole()).redirectedTo).toBe("/admin/login");
  });

  it("sends a suspended member to sign in, where the refusal says why", async () => {
    await signInAs(ROLES.SUPER_ADMIN);
    await liveRowIs({ ...activeRow(ROLES.SUPER_ADMIN), status: "SUSPENDED" });

    expect((await enterConsole()).redirectedTo).toBe("/admin/login");
  });
});
