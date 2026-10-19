/**
 * The admin console's sections: where each one lives, what the nav calls it, and
 * which permissions open it.
 *
 * One table for the three questions that used to be answered separately: which tabs
 * a role sees (`src/app/admin/layout.tsx`), where a member lands on entering the
 * console (`src/app/admin/page.tsx`), and whether a section's page renders for them
 * (`requireAdminSection` in `adminSectionGate.ts`). Answered from different lists,
 * they drifted: every sign-in went to `/admin/pets` whatever the role, so a new STAFF
 * account's first screen was a page it can never open (observed in production on
 * 2026-10-19).
 *
 * A section admits a role that holds ANY of its permissions. The settings page is
 * why: a Super Admin edits the configuration there and a Volunteer Coordinator only
 * sends a test email, so requiring the write permission alone would shut the
 * coordinator out of work it legitimately has.
 *
 * Every section names its permissions; there is no "shown to everyone" entry. The
 * nav once had a `permissions: null` opt-out, used once, for a "Community Bulletins"
 * tab that pointed at the PUBLIC /bulletins page and so sent every role, Volunteer
 * included, to a page whose "editing" wrote to their own browser.
 *
 * Deliberately free of `next/*` and `node:*` imports, like `permissions.ts`, so the
 * client nav can evaluate it.
 */

import { PERMISSIONS, roleHasPermission, type Permission } from "./permissions";

interface AdminSectionDefinition {
  href: `/admin/${string}`;
  label: string;
  permissions: readonly Permission[];
}

/** In navigation order, which is also the order a member's landing section is chosen in. */
const SECTIONS = [
  { href: "/admin/pets", label: "Pet Management (CRUD)", permissions: [PERMISSIONS.MANAGE_PETS] },
  { href: "/admin/applications", label: "Adoption Applications", permissions: [PERMISSIONS.VIEW_APPLICATIONS] },
  { href: "/admin/faqs", label: "FAQ Knowledge Base", permissions: [PERMISSIONS.MANAGE_CONTENT] },
  { href: "/admin/transparency", label: "Financial Transparency", permissions: [PERMISSIONS.MANAGE_CONTENT] },
  { href: "/admin/donations", label: "Payment Reconciliation", permissions: [PERMISSIONS.RECONCILE_SPONSORSHIPS] },
  { href: "/admin/members", label: "Staff & Permissions", permissions: [PERMISSIONS.MANAGE_MEMBERS] },
  { href: "/admin/audit", label: "Audit & Security Logs", permissions: [PERMISSIONS.VIEW_AUDIT_LOG] },
  {
    href: "/admin/settings",
    label: "Shelter Settings",
    permissions: [PERMISSIONS.MANAGE_SETTINGS, PERMISSIONS.SEND_SHELTER_EMAIL],
  },
  { href: "/admin/bulletins", label: "Community Bulletins", permissions: [PERMISSIONS.MANAGE_CONTENT] },
] as const satisfies readonly AdminSectionDefinition[];

export type AdminSectionHref = (typeof SECTIONS)[number]["href"];

export type AdminSection = AdminSectionDefinition & { href: AdminSectionHref };

export const ADMIN_SECTIONS: readonly AdminSection[] = SECTIONS;

/**
 * True when `role` holds a permission that opens `href`.
 *
 * Takes the role exactly as stored or sealed. `roleHasPermission` resolves the
 * deprecated aliases itself and fails closed, which normalising first would undo:
 * `normalizeRole` folds VOLUNTEER onto STAFF, and STAFF opens a section a VOLUNTEER
 * cannot.
 */
export function canOpenAdminSection(role: string | null | undefined, href: AdminSectionHref): boolean {
  const section = ADMIN_SECTIONS.find((candidate) => candidate.href === href);
  return section !== undefined && section.permissions.some((permission) => roleHasPermission(role, permission));
}

/** The sections `role` can open, in navigation order. */
export function adminSectionsFor(role: string | null | undefined): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => canOpenAdminSection(role, section.href));
}

/** The section `role` lands on when it enters the console, or null when it can open none. */
export function adminHomeFor(role: string | null | undefined): AdminSectionHref | null {
  return adminSectionsFor(role)[0]?.href ?? null;
}
