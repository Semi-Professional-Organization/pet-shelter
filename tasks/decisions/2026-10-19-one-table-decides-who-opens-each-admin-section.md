# One table decides who opens each admin section: the nav, the landing and the page gate

**Decided:** 2026-10-19

`src/lib/security/adminSections.ts` lists the nine sections in nav order with the permissions that
open each (any one of them suffices). Three things read it:

- the nav in `src/app/admin/layout.tsx`, through `adminSectionsFor(user.role)`;
- the `/admin` landing, through `adminHomeFor(session.role)`;
- every section's page, through `requireAdminSection(href)` in `adminSectionGate.ts`, which renders
  the 401 page for a member who is signed out, suspended or gone and the 403 page for a role the
  section does not open.

## Why

The three answered from three places and disagreed. A role-by-section sweep on 2026-10-19 found:

- the FAQ tab offered to Content Editors, whom the FAQ page and actions refused, while Volunteer
  Coordinators could open the page with no tab (`2026-10-19-faq-editing-is-manage-content.md`);
- five sections with no page gate at all (pets, applications, donations, audit, settings) and a
  sixth (transparency) gated only in the browser, on the cookie's role. Pets and applications
  swallowed their data load's refusal and showed the browser's demo copy as if it were the
  shelter's records, with every control live and every save rolled back;
- the nav drawn from the role sealed into the cookie at sign-in, which is stale after a role change
  and is STAFF for a legacy VOLUNTEER, while every guard behind it reads the live row.

## Details someone could reasonably reverse

- **The gate is presentation, not the boundary.** Every Server Action guards itself; the gate
  decides between the section and a clear refusal. Do not delete an action guard because a page
  gate exists.
- **Settings opens for `MANAGE_SETTINGS` or `SEND_SHELTER_EMAIL`.** A Volunteer Coordinator sends
  test emails there. A member without `MANAGE_SETTINGS` is now shown only the test email tool,
  because the read that fills the form and the save both need `MANAGE_SETTINGS`.
- **The nav gates on the role as the server reports it, never a normalised copy.** `normalizeRole`
  folds VOLUNTEER onto STAFF; `roleHasPermission` resolves aliases itself and fails closed.
  `getCurrentUserAction` now answers through the DAL for the same reason.
- **The proxy still reads the cookie** for `/admin/members` (it exists for the HTTP status). A member
  promoted since signing in now sees the Staff & Permissions tab and is refused there until they
  sign in again; its 403 text says so. Generalising the proxy was rejected before for this reason
  (its own header) and still is.
- **Controls inside a page follow the member's permissions**, computed on the server from the
  verified session and passed down: the applications board hides status changes and the decision
  dialog without `REVIEW_APPLICATIONS` and delete without `DELETE_APPLICATIONS`; the transparency
  editor hides "Upload PDF" without `MANAGE_PET_MEDIA`
  (`2026-10-19-content-editors-paste-report-links-rather-than-upload.md`).

`tests/unit/adminSectionPages.test.ts` holds the table to an explicit role-by-section matrix and
checks each page's refusals; `tests/components/AdminLayout.test.tsx` holds the nav to it.
