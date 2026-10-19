import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { sealSession, SESSION_COOKIE_NAME } from "@/lib/security/sessionToken";
import { ROLES, type Role } from "@/lib/security/permissions";

/**
 * The proxy is the only thing that can attach a real HTTP status to an
 * unauthorized admin request — a page calling `forbidden()` has already begun
 * streaming a 200. It was previously untested; these cases pin the status
 * matrix so the guard cannot be silently weakened.
 */

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {},
  });
}

function sessionFor(role: Role, maxAgeSeconds = 3600): string {
  return sealSession(
    {
      id: `usr-${role}`,
      email: `${role.toLowerCase()}@hopeforstrays.org`,
      name: `${role} User`,
      role,
    },
    maxAgeSeconds
  );
}

/** Proxy signals "continue" with a 200 NextResponse.next(). */
function isPassThrough(response: { status: number; headers: Headers }): boolean {
  return response.status === 200 && response.headers.get("content-type") === null;
}

describe("Proxy route guard", () => {
  describe("/admin/members", () => {
    it("returns 401 with no session cookie", () => {
      const res = proxy(request("/admin/members"));
      expect(res.status).toBe(401);
    });

    it("returns 401 for a malformed or tampered cookie", () => {
      const valid = sessionFor(ROLES.SUPER_ADMIN);
      const tampered = `${valid.slice(0, -2)}ff`;

      expect(proxy(request("/admin/members", "not-a-token")).status).toBe(401);
      expect(proxy(request("/admin/members", tampered)).status).toBe(401);
    });

    it("returns 401 for an expired session", () => {
      // sealSession stamps expiry from now; a negative TTL is already past.
      const expired = sessionFor(ROLES.SUPER_ADMIN, -60);
      expect(proxy(request("/admin/members", expired)).status).toBe(401);
    });

    it.each([
      ROLES.ANIMAL_MANAGER,
      ROLES.CONTENT_EDITOR,
      ROLES.VOLUNTEER_COORDINATOR,
      ROLES.STAFF,
    ])("returns 403 for %s", (role) => {
      const res = proxy(request("/admin/members", sessionFor(role)));
      expect(res.status).toBe(403);
    });

    it.each([ROLES.COORDINATOR, ROLES.VOLUNTEER])(
      "returns 403 for the deprecated alias %s",
      (role) => {
        expect(proxy(request("/admin/members", sessionFor(role))).status).toBe(403);
      }
    );

    it("admits a SUPER_ADMIN", () => {
      const res = proxy(request("/admin/members", sessionFor(ROLES.SUPER_ADMIN)));
      expect(isPassThrough(res)).toBe(true);
    });

    it("admits a pre-migration ADMIN cookie", () => {
      // Migration safety: sessions issued before the RBAC change must keep
      // working, or deploying it locks the only administrator out.
      const res = proxy(request("/admin/members", sessionFor(ROLES.ADMIN)));
      expect(isPassThrough(res)).toBe(true);
    });

    it("guards nested paths under the prefix", () => {
      expect(proxy(request("/admin/members/usr-1")).status).toBe(401);
    });
  });

  describe("denial responses", () => {
    it("are HTML, uncacheable and non-indexable", () => {
      const res = proxy(request("/admin/members", sessionFor(ROLES.STAFF)));

      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    });

    it("send a refused member to /admin, which lands each role on a section it opens", async () => {
      // Was /admin/pets, which refuses every role this response is shown to except an
      // Animal Manager, so "Back to Admin" led to a second refusal.
      const body = await proxy(request("/admin/members", sessionFor(ROLES.STAFF))).text();

      expect(body).toContain('href="/admin"');
      expect(body).not.toContain("/admin/pets");
    });

    it("send a signed-out visitor to sign in, not to a Super Admin about their role", async () => {
      const body = await proxy(request("/admin/members")).text();

      expect(body).toContain('href="/admin/login"');
      expect(body).toContain("Go to Sign In");
      expect(body).not.toMatch(/review your role/);
    });

    it("leak nothing about the protected resource", async () => {
      const res = proxy(request("/admin/members", sessionFor(ROLES.STAFF)));
      const body = await res.text();

      expect(body).not.toMatch(/hopeforstrays\.org/);
      expect(body).not.toMatch(/lastLogin|inviteToken|passwordHash/i);
    });
  });

  describe("routes outside the matcher", () => {
    // The matcher already prevents these from reaching proxy in production;
    // the function must also be inert if one ever does.
    it.each(["/admin/login", "/admin/invite", "/admin/pets", "/pets", "/"])(
      "passes %s through untouched",
      (path) => {
        expect(isPassThrough(proxy(request(path)))).toBe(true);
      }
    );
  });

  describe("matcher configuration", () => {
    it("covers the members route and its children only", () => {
      expect(config.matcher).toEqual(["/admin/members", "/admin/members/:path*"]);
    });
  });
});
