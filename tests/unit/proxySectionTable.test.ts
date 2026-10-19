import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { sealSession, SESSION_COOKIE_NAME } from "@/lib/security/sessionToken";
import { ROLES, type Role } from "@/lib/security/permissions";

/**
 * The proxy asks the section table who may open /admin/members.
 *
 * It kept its own `MANAGE_MEMBERS` rule, so widening the section in the table (to
 * `VIEW_MEMBERS`, say) would have left the proxy refusing members the nav and the page
 * gate admit. Here the table is widened to STAFF; the proxy before 2026-10-19 still
 * refused STAFF, so the first case fails against it.
 */
vi.mock("@/lib/security/adminSections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/adminSections")>();
  return {
    ...actual,
    canOpenAdminSection: (role: string | null | undefined, href: string) =>
      (href === "/admin/members" && role === ROLES.STAFF) ||
      actual.canOpenAdminSection(role, href as Parameters<typeof actual.canOpenAdminSection>[1]),
  };
});

import { proxy } from "@/proxy";

function request(role: Role): NextRequest {
  const token = sealSession({ id: `usr-${role}`, email: "member@hopeforstrays.org", name: "Member", role }, 3600);
  return new NextRequest("http://localhost:3000/admin/members", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("proxy and the section table", () => {
  it("admits whoever the table opens the section to", () => {
    const res = proxy(request(ROLES.STAFF));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBeNull();
  });

  it("refuses whoever the table does not", () => {
    expect(proxy(request(ROLES.CONTENT_EDITOR)).status).toBe(403);
  });
});
