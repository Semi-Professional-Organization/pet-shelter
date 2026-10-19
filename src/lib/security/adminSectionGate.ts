import { forbidden, unauthorized } from "next/navigation";
import { getVerifiedSession } from "./dal";
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
 * refusal — the 401 page when they are signed out, suspended or no longer a member,
 * the 403 page when their live role does not open the section.
 */
export async function requireAdminSection(href: AdminSectionHref): Promise<SessionUser> {
  const session = await getVerifiedSession();
  if (!session) unauthorized();
  if (!canOpenAdminSection(session.role, href)) forbidden();
  return session;
}
