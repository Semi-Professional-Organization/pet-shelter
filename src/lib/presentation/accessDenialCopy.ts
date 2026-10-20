/**
 * The words of the 403 page, in one place.
 *
 * Two things render it: `src/app/forbidden.tsx`, for a page gate that refuses the live
 * role, and the bare document `src/proxy.ts` returns for /admin/members, which reads the
 * cookie's role. They were two hand-kept copies and had already drifted apart. The proxy
 * adds one sentence of its own, because only it can be wrong about a role changed since
 * sign-in.
 *
 * Plain text: the proxy escapes it into HTML, React escapes it into the page.
 */
export const FORBIDDEN_COPY = {
  label: "403 — Forbidden",
  heading: "You do not have access to this area",
  body:
    "Your staff account does not carry the permission required for this page. If you " +
    "believe this is a mistake, ask a Super Admin to review your role under Staff & Permissions.",
  /** /admin, not a section: it sends each role to the first section it can open. */
  backHref: "/admin",
  backLabel: "Back to Admin",
} as const;
