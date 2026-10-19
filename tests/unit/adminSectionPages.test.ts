import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MockNavigationError } from "../setup/nextMocks";
import { signInAs } from "../setup/authSession";
import { CANONICAL_ROLES, ROLES, type Role } from "@/lib/security/permissions";
import { ADMIN_SECTIONS, canOpenAdminSection, type AdminSectionHref } from "@/lib/security/adminSections";

/**
 * Who may open each admin section, and what everyone else gets.
 *
 * The nav, the landing after sign-in and each page's gate used to answer this from three
 * different places, and they disagreed: the FAQ tab was offered to Content Editors whom the
 * page refused, and five sections had no page gate at all, so a role they should not admit
 * got the screen and buttons that all failed. One table now answers for all three
 * (`src/lib/security/adminSections.ts`), and this file holds it to the matrix below.
 *
 * Every refusal case fails against the pages before that change except /admin/members,
 * which already had this gate. The others rendered or showed an inline panel instead of the
 * 403 and 401 pages; the old settings page, a client component, cannot even be called here.
 */

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));

/** The specification, written out rather than derived from the table it checks. */
const OPENS: Record<AdminSectionHref, Role[]> = {
  "/admin/pets": [ROLES.SUPER_ADMIN, ROLES.ANIMAL_MANAGER],
  "/admin/applications": [ROLES.SUPER_ADMIN, ROLES.ANIMAL_MANAGER, ROLES.VOLUNTEER_COORDINATOR, ROLES.STAFF],
  "/admin/faqs": [ROLES.SUPER_ADMIN, ROLES.CONTENT_EDITOR],
  "/admin/transparency": [ROLES.SUPER_ADMIN, ROLES.CONTENT_EDITOR],
  "/admin/donations": [ROLES.SUPER_ADMIN, ROLES.VOLUNTEER_COORDINATOR],
  "/admin/members": [ROLES.SUPER_ADMIN],
  "/admin/audit": [ROLES.SUPER_ADMIN, ROLES.VOLUNTEER_COORDINATOR],
  "/admin/settings": [ROLES.SUPER_ADMIN, ROLES.VOLUNTEER_COORDINATOR],
  "/admin/bulletins": [ROLES.SUPER_ADMIN, ROLES.CONTENT_EDITOR],
};

/** Deprecated aliases a stored row may still carry, and the canonical role each opens as. */
const ALIASES: [Role, Role | null][] = [
  [ROLES.ADMIN, ROLES.SUPER_ADMIN],
  [ROLES.COORDINATOR, ROLES.VOLUNTEER_COORDINATOR],
  // Folded onto STAFF for display, but it never held STAFF's application read.
  [ROLES.VOLUNTEER, null],
];

const PAGES: Record<AdminSectionHref, () => Promise<{ default: () => unknown }>> = {
  "/admin/pets": () => import("@/app/admin/pets/page"),
  "/admin/applications": () => import("@/app/admin/applications/page"),
  "/admin/faqs": () => import("@/app/admin/faqs/page"),
  "/admin/transparency": () => import("@/app/admin/transparency/page"),
  "/admin/donations": () => import("@/app/admin/donations/page"),
  "/admin/members": () => import("@/app/admin/members/page"),
  "/admin/audit": () => import("@/app/admin/audit/page"),
  "/admin/settings": () => import("@/app/admin/settings/page"),
  "/admin/bulletins": () => import("@/app/admin/bulletins/page"),
};

const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";
const UNAUTHORIZED = "NEXT_HTTP_ERROR_FALLBACK;401";

async function liveRowIs(role: Role, status = "ACTIVE"): Promise<void> {
  const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
  vi.mocked(findMemberAuthStateById).mockResolvedValue({
    role,
    status,
    name: "Test Member",
    email: "member@hopeforstrays.org",
  });
}

/** Renders a section's page and returns the interrupt it threw, or "rendered". */
async function open(href: AdminSectionHref): Promise<string> {
  const { default: Page } = await PAGES[href]();
  try {
    await Page();
    return "rendered";
  } catch (error) {
    if (error instanceof MockNavigationError) return error.digest;
    throw error;
  }
}

const sections = ADMIN_SECTIONS.map((section) => section.href);

describe("the section table", () => {
  it("covers exactly the sections in the matrix", () => {
    expect([...sections].sort()).toEqual(Object.keys(OPENS).sort());
  });

  it.each(sections)("opens %s to exactly the matrix's canonical roles", (href) => {
    const opened = CANONICAL_ROLES.filter((role) => canOpenAdminSection(role, href));
    expect([...opened].sort()).toEqual([...OPENS[href]].sort());
  });

  it.each(ALIASES)("opens to the alias %s what it opens to %s", (alias, canonical) => {
    for (const href of sections) {
      const expected = canonical ? OPENS[href].includes(canonical) : false;
      expect(canOpenAdminSection(alias, href)).toBe(expected);
    }
  });
});

describe("each section's page applies the table's gate", () => {
  beforeEach(async () => {
    const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
    vi.mocked(findMemberAuthStateById).mockResolvedValue(null);
  });

  const refusals = sections.flatMap((href) =>
    [...CANONICAL_ROLES, ROLES.VOLUNTEER]
      .filter((role) => !OPENS[href].includes(role as Role))
      .map((role) => [href, role] as const)
  );

  it.each(refusals)("%s answers %s with the 403 page", async (href, role) => {
    await signInAs(role);
    await liveRowIs(role);

    expect(await open(href)).toBe(FORBIDDEN);
  });

  it.each(sections)("%s answers a signed-out visitor with the 401 page", async (href) => {
    expect(await open(href)).toBe(UNAUTHORIZED);
  });

  it.each(sections)("%s answers a suspended member it would admit with the 401 page", async (href) => {
    const role = OPENS[href][0];
    await signInAs(role);
    await liveRowIs(role, "SUSPENDED");

    expect(await open(href)).toBe(UNAUTHORIZED);
  });

  it.each(sections)("%s refuses on the live role, not the one sealed into the cookie", async (href) => {
    // Signed in as a Super Admin, since demoted to a role this section does not open.
    const demotedTo = CANONICAL_ROLES.find((role) => !OPENS[href].includes(role))!;
    await signInAs(ROLES.SUPER_ADMIN);
    await liveRowIs(demotedTo);

    expect(await open(href)).toBe(FORBIDDEN);
  });

  it.each(sections)("%s calls the gate with its own href", (href) => {
    // The admitted side of the gate cannot be rendered here without each page's data, so
    // this pins that the page asks the table about itself and not a neighbour.
    const source = readFileSync(join(process.cwd(), "src", "app", ...href.split("/").slice(1), "page.tsx"), "utf8");
    expect(source).toContain(`requireAdminSection("${href}")`);
  });
});
