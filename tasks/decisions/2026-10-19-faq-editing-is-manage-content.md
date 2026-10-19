# FAQ editing is MANAGE_CONTENT, not the role list [ADMIN, COORDINATOR]

**Decided:** 2026-10-19

The FAQ page and every FAQ write admitted `FAQ_EDITOR_ROLES = [ADMIN, COORDINATOR]`
(`src/lib/domain/faqAccess.ts`, now deleted). The nav offered the FAQ tab to `MANAGE_CONTENT`
holders. So a Content Editor was shown the tab and refused by the page, and a Volunteer Coordinator
could edit FAQs by URL with no tab leading there.

Both now ask for `MANAGE_CONTENT`: `requireFaqEditor()` in `src/actions/faqs.ts` calls
`requirePermission(PERMISSIONS.MANAGE_CONTENT)`, and the page goes through the section gate.

## Who gains and who loses (per `tasks/lessons/2026-09-03-collapsing-role-lists-into-permissions-silently-widens-access.md`)

| Role | Before | After |
|---|---|---|
| SUPER_ADMIN (and ADMIN rows) | edit | edit |
| CONTENT_EDITOR | refused | **edit** |
| VOLUNTEER_COORDINATOR (and COORDINATOR rows) | edit | **refused** |
| ANIMAL_MANAGER, STAFF, VOLUNTEER | refused | refused |

## Why this direction

- `ROLE_DESCRIPTIONS[CONTENT_EDITOR]` is "Manage FAQs, transparency data, and community
  bulletins", which is what a Super Admin reads when assigning the role, and `MANAGE_CONTENT` is
  documented as "FAQs, transparency figures, community bulletins".
- The role list's own comment said the original request named `SUPER_ADMIN` and `CONTENT_EDITOR`,
  which did not exist yet, so `ADMIN` and `COORDINATOR` stood in for them. Both roles exist now.
- The coordinator's description never mentioned FAQs and no tab led a coordinator to the page.
- `2026-09-18-content-actions-honour-suspension.md` kept the role list only because changing who
  may edit was out of its scope, not as a choice of who should.

## Reversing it

If coordinators must edit FAQs, grant `MANAGE_CONTENT` to `VOLUNTEER_COORDINATOR` in
`ROLE_PERMISSIONS`, knowing it also opens transparency and bulletins to them, or add a FAQ-only
permission. Do not reintroduce a role list: a list and a permission side by side is how this drifted.
