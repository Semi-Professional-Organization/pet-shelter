import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { sealSession, SESSION_COOKIE_NAME } from "@/lib/security/sessionToken";
import { ROLES, type Role } from "@/lib/security/permissions";
import { FORBIDDEN_COPY } from "@/lib/presentation/accessDenialCopy";

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
    // These three were 401s reading "Your session has ended". A request without a valid
    // session now goes to the sign-in form, which is what every section's page gate answers
    // for the same request (tasks/decisions/2026-10-19-sessions-change-by-document-load.md).
    function sentToSignIn(res: { status: number; headers: Headers }): boolean {
      return res.status === 307 && new URL(res.headers.get("location")!).pathname === "/admin/login";
    }

    it("sends a visitor with no session cookie to sign in", () => {
      expect(sentToSignIn(proxy(request("/admin/members")))).toBe(true);
    });

    it("sends a malformed or tampered cookie to sign in", () => {
      const valid = sessionFor(ROLES.SUPER_ADMIN);
      // Flip the last hex character; a fixed suffix is a no-op when the signature already ends in it.
      const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;

      expect(sentToSignIn(proxy(request("/admin/members", "not-a-token")))).toBe(true);
      expect(sentToSignIn(proxy(request("/admin/members", tampered)))).toBe(true);
    });

    it("sends an expired session to sign in", () => {
      // sealSession stamps expiry from now; a negative TTL is already past.
      const expired = sessionFor(ROLES.SUPER_ADMIN, -60);
      expect(sentToSignIn(proxy(request("/admin/members", expired)))).toBe(true);
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
      expect(proxy(request("/admin/members/usr-1", sessionFor(ROLES.STAFF))).status).toBe(403);
    });

    it("lets a Server Action answer for itself, signed out or refused", () => {
      // Each members action re-checks the live role through the DAL and returns a refusal
      // the client can read. A redirect here had the browser re-POST to the sign-in page,
      // which answered "Server Action not found". Fails against the proxy that redirected.
      const action = (cookie?: string) =>
        new NextRequest("http://localhost:3000/admin/members", {
          method: "POST",
          headers: {
            "next-action": "7f3a9c",
            ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
          },
        });

      expect(isPassThrough(proxy(action()))).toBe(true);
      expect(isPassThrough(proxy(action(sessionFor(ROLES.STAFF))))).toBe(true);
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

    it("say what the in-app 403 page says, and what only the proxy can be wrong about", async () => {
      // Two hand-kept copies of these words had drifted apart. The proxy reads the cookie's
      // role, so it alone adds the line for a member whose role changed since sign-in.
      const body = await proxy(request("/admin/members", sessionFor(ROLES.STAFF))).text();

      expect(body).toContain(FORBIDDEN_COPY.heading);
      expect(body).toContain(FORBIDDEN_COPY.body.replace("&", "&amp;"));
      expect(body).toContain("sign out and sign in again");
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
