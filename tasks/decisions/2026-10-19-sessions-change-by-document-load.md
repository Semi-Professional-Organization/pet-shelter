# Entering the console after a session is created is a document load of /admin

**Decided:** 2026-10-19

Supersedes the design recorded dead in
`2026-10-19-died-a-client-side-push-into-the-console-after-sign-in.md`.

## The problem, as the dead design's corpse showed it

Two separate things were wrong with signing in:

1. **Where it went.** Every sign-in, registration, demo sign-in and accepted invitation pushed to
   `/admin/pets`, which only Super Admins and Animal Managers can open. A new STAFF account's first
   screen was a refusal (production, 2026-10-19).
2. **How it went.** `src/app/admin/layout.tsx` also wraps `/admin/login` and `/admin/invite`. It
   mounts there while signed out, its `useAdminAuth` instance records that, and an App Router layout
   persists across client-side navigation. A `router.push` into the console after a sign-in that
   happened in a different hook instance met a layout that still believed nobody was signed in: it
   rendered nothing and pushed back to `/admin/login`. Observed locally in a browser with no cached
   user (K1).

## What was chosen

- `enterAdminConsole()` in `src/lib/client/adminAuth.ts`: `window.location.assign("/admin")`. The
  sign-in page (all three paths) and the invite page call it. A new document mounts the layout with
  the new cookie.
- `/admin` (`src/app/admin/page.tsx`) is a Server Component that reads the verified session and
  redirects to the first section, in nav order, that the live role opens; a role that opens none
  (legacy VOLUNTEER) is told so; a signed-out or suspended visitor gets the 401 page, as on every
  section, rather than a silent redirect to the sign-in form.
- "Back to Admin" on the 403 page and in the proxy's 403 document points at `/admin` too.

Observed (K2, K2b in the session's build gate): signed out in the app, then the demo Staff button —
on `/admin/applications` at 3 s and still at 10 s. `/admin/pets` as Staff gave the 403 page, and its
"Back to Admin" settled on `/admin/applications` at 3 s. The `/admin` document answered `200` and
the client followed the redirect after hydration, so nothing here depends on an HTTP 307.

## Alternatives not taken

- **Share the auth state between hook instances** (a module-level store behind
  `useSyncExternalStore`). It removes the stale layout at its root, but it rewrites a client store
  that `docs/architecture/LAYERS.md` tolerates only for admin and demo UI, to fix two call sites.
  If a third transition from a public admin route into the console appears, take this instead.
- **Choose the landing on the client** from the role sign-in returns. That role is the one sealed
  into the cookie, which normalises VOLUNTEER to STAFF, so a volunteer would land on a section that
  refuses it; and the 403 page has no role to choose with at all.

## Reversing it

Point the call sites back at `router.push` only together with a layout that learns of the new
session; otherwise the bounce returns for every browser without a cached user.
