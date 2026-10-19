import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, unsealSession } from "@/lib/security/sessionToken";
import { canOpenAdminSection, type AdminSectionHref } from "@/lib/security/adminSections";
import { EMAIL_BRAND, EMAIL_TONE } from "@/lib/presentation/emailTokens";

/**
 * Pre-render authorization for privileged admin routes.
 *
 * This exists for one reason: HTTP status. A page that calls `forbidden()`
 * renders the 403 UI, but the response has already begun streaming as a 200 and
 * Next.js cannot change the status once headers are sent -- see the "Status
 * Codes" section of the bundled Next.js loading docs. The check has to run
 * before the response streams to produce a real 403, and proxy is where that
 * happens.
 *
 * It is a status layer, not the security boundary. The page and every server
 * action guard themselves independently, and only they can see database state
 * such as a suspension, which this signature-only check cannot. Deleting this
 * file would cost the correct status code, not the protection.
 *
 * Scope is deliberately one route. Generalising this into a route -> permission
 * table for all of /admin was considered and rejected: proxy can only read the
 * signed cookie, which makes it an optimistic check. Promoting someone
 * mid-session would then produce a false negative — the DAL refreshes the role
 * from the database and would allow the request, but the stale cookie would
 * have proxy reject it before the app ran. Server Functions also POST to the
 * route they are used on, so a route-level permission would wrongly reject
 * legitimate actions (a Volunteer Coordinator sending a test email from
 * /admin/settings, say). Route data is guarded at its source instead.
 *
 * Proxy runs on the Node.js runtime in Next 16, so the real token codec and
 * permission matrix are reused here rather than reimplemented.
 */

/**
 * Sections that must answer with an accurate status before rendering. Who may open
 * one is the section table's answer (`adminSections.ts`), the one its nav tab and
 * page gate give, so the three cannot drift; only the role read here is the cookie's.
 */
const GUARDED_SECTIONS: AdminSectionHref[] = ["/admin/members"];

/**
 * Returns a document response, which is the documented way to produce a status
 * from proxy ("Producing a response", proxy.md).
 *
 * Two alternatives were considered and rejected on the docs:
 *
 * - Serving a different response to client-side navigations. Not possible:
 *   Next strips `rsc`, `next-router-state-tree` and `next-router-prefetch` from
 *   `request.headers` in proxy specifically "to prevent accidentally handling
 *   an RSC request differently than the HTML request as both need to align"
 *   (proxy.md). There is no supported way to branch on request kind here.
 * - `NextResponse.rewrite(url, { status })` to reuse app/forbidden.tsx. The
 *   docs never give `rewrite` an init, and the rewrite branch in
 *   next/dist/server/lib/router-utils/resolve-routes.js returns no statusCode,
 *   so the status is silently dropped and you are back to a 200.
 *
 * The residual gap — a client-side navigation receiving HTML — is reachable
 * where the nav and the cookie disagree. The admin nav draws its tabs from the
 * member's live role when the console loads (from the browser's cached copy if
 * that check fails), and this function reads the role sealed into the cookie at
 * sign-in, so a member promoted since signing in is offered the tab and refused
 * here; and a cookie that expires while the console is open is refused here on
 * the next click. The texts below say what ends each: signing in again.
 */
const NEXT_STEP: Record<401 | 403, { hint: string; href: string; label: string }> = {
  // A signed-out visitor needs the sign-in page, not advice about their role.
  401: { hint: "Sign in again to continue to the shelter staff portal.", href: "/admin/login", label: "Go to Sign In" },
  // /admin, not a section: it sends each role to the first section it can open.
  403: {
    hint:
      "Ask a Super Admin to review your role under Staff &amp; Permissions. If your role was " +
      "changed since you signed in, sign out and sign in again.",
    href: "/admin",
    label: "Back to Admin",
  },
};

function denialResponse(status: 401 | 403, title: string, message: string): NextResponse {
  const next = NEXT_STEP[status];
  // Deliberately minimal: this is a network-boundary rejection, and the styled
  // in-app equivalents are src/app/forbidden.tsx and src/app/unauthorized.tsx.
  //
  // Colours come from the email hex mirror rather than literals. This document
  // is assembled outside the CSS pipeline, so it cannot use the design-system
  // custom properties -- emailTokens is the sanctioned mirror of those tokens
  // for exactly that situation, and it keeps this page in step with the palette
  // instead of freezing a copy of it.
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${status} ${title}</title>
</head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:${EMAIL_BRAND.muted};color:${EMAIL_BRAND.foreground}">
<main style="max-width:32rem;padding:2rem;text-align:center">
<p style="font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${EMAIL_TONE.danger.text};margin:0 0 .5rem">${status} — ${title}</p>
<h1 style="font-size:1.5rem;margin:0 0 .75rem">${message}</h1>
<p style="font-size:.875rem;color:${EMAIL_BRAND.mutedForeground};margin:0 0 1.5rem">${next.hint}</p>
<a href="${next.href}" style="font-size:.75rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${EMAIL_BRAND.foreground};border:1px solid ${EMAIL_BRAND.border};padding:.6rem 1rem;text-decoration:none">${next.label}</a>
</main>
</body>
</html>`;

  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const section = GUARDED_SECTIONS.find(
    (href) => pathname === href || pathname.startsWith(`${href}/`)
  );
  if (!section) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Nobody signed in: the sign-in form, as the section gates answer, not "Your
  // session has ended" for a session that never existed.
  if (!token) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const session = unsealSession(token);
  if (!session) {
    return denialResponse(401, "Sign in required", "Your session has ended");
  }

  // The table resolves deprecated aliases, so a cookie issued before the RBAC
  // migration (role "ADMIN") is still recognised as a Super Admin here.
  if (!canOpenAdminSection(session.role, section)) {
    return denialResponse(403, "Forbidden", "You do not have access to this area");
  }

  return NextResponse.next();
}

export const config = {
  // Scoped to the guarded routes so static assets, images and every other page
  // bypass this entirely.
  matcher: ["/admin/members", "/admin/members/:path*"],
};
