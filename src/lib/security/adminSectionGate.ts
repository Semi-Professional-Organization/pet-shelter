import { forbidden, redirect, unauthorized } from "next/navigation";
import { getVerifiedSession, hasSessionCookie } from "./dal";
import { canOpenAdminSection, type AdminSectionHref } from "./adminSections";
import type { SessionUser } from "./session";

/**
 * The gate every admin section's page calls before rendering anything.
 *
 * Answers from the same table as the nav and the landing (`adminSections.ts`), so a
 * page cannot admit a role its tab hides, or refuse one its tab offers. Before this,
 * five sections had no page gate at all and a sixth checked only in the browser, so a
 * role the page should not have admitted got a working-looking screen — for pets and
 * applications, the browser's sample data — and buttons that all failed.
 *
 * Presentation, not the security boundary: every Server Action behind a section
 * guards itself. What this decides is whether a member sees the section or a clear
 * answer instead: the sign-in form for nobody, the 401 page for a session the DAL will
 * not honour, the 403 page for a role the section does not open.
 */
export async function requireAdminSection(href: AdminSectionHref): Promise<SessionUser> {
  const session = await getVerifiedSession();
  if (!session) return refuseMissingSession();
  if (!canOpenAdminSection(session.role, href)) forbidden();
  return session;
}

/**
 * What the console shows when the DAL vouches for no member.
 *
 * Nobody signed in — no cookie, or one that has expired — goes to the sign-in form: the
 * 401 page's "Your session has ended" would be wrong for a session that never existed,
 * and a bookmark or an emailed link is the usual way in. A cookie the DAL will not
 * honour (suspended, deleted, or an account only the in-memory store holds, which
 * sign-in accepts) gets the 401 page, which says what to do if it comes straight back.
 */
export async function refuseMissingSession(): Promise<never> {
  if (!(await hasSessionCookie())) redirect("/admin/login");
  unauthorized();
}
