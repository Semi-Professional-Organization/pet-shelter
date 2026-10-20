import { describe, it, expect, vi, beforeEach } from "vitest";
import { signInAs, identityForRole } from "../setup/authSession";
import { ROLES } from "@/lib/security/permissions";

/**
 * What the console is told about the signed-in member.
 *
 * `getCurrentUserAction` read the cookie, so the admin layout drew a suspended member's
 * console and a demoted member's old tabs until the cookie expired, while every page and
 * action behind them read the live row. It now answers from the same row. Each case fails
 * against the cookie version.
 */

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));

async function liveRowIs(role: string, status = "ACTIVE"): Promise<void> {
  const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
  vi.mocked(findMemberAuthStateById).mockResolvedValue({
    role,
    status,
    name: "Live Name",
    email: "live@hopeforstrays.org",
  });
}

describe("getCurrentUserAction", () => {
  beforeEach(async () => {
    const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
    vi.mocked(findMemberAuthStateById).mockResolvedValue(null);
  });

  it("reports nobody for a suspended member whose cookie has not expired", async () => {
    await signInAs(ROLES.SUPER_ADMIN);
    await liveRowIs(ROLES.SUPER_ADMIN, "SUSPENDED");
    const { getCurrentUserAction } = await import("@/actions/auth");

    expect(await getCurrentUserAction()).toEqual({ user: null });
  });

  it("reports the live role of a member demoted since signing in", async () => {
    await signInAs(ROLES.SUPER_ADMIN);
    await liveRowIs(ROLES.STAFF);
    const { getCurrentUserAction } = await import("@/actions/auth");

    expect((await getCurrentUserAction()).user?.role).toBe(ROLES.STAFF);
  });

  it("reports VOLUNTEER, not the STAFF its sign-in was sealed with", async () => {
    await signInAs({ ...identityForRole(ROLES.VOLUNTEER), role: ROLES.STAFF });
    await liveRowIs(ROLES.VOLUNTEER);
    const { getCurrentUserAction } = await import("@/actions/auth");

    expect((await getCurrentUserAction()).user?.role).toBe(ROLES.VOLUNTEER);
  });

  it("reports nobody when signed out", async () => {
    const { getCurrentUserAction } = await import("@/actions/auth");

    expect(await getCurrentUserAction()).toEqual({ user: null });
  });
});
