# DIED: landing a client-side push after sign-in on a server-side /admin redirect

**Decided:** 2026-10-19

The first design for "each role lands on the first section it can open" kept the sign-in page's
`router.push`, pointed it at `/admin`, and made `/admin` a Server Component that redirects to the
member's first section. Its kill condition, registered in `tasks/open/CLAIM-role-dead-ends.md`
before the run, was K1: signed in as the seeded Staff account on a local `next dev`, the browser
must settle on `/admin/applications` within 10 seconds.

**K1 fired.** At 11 seconds after the click the browser was on `/admin/login`, with the Staff user
cached in localStorage, so the sign-in itself had succeeded. The network log shows
`GET /admin?_rsc` and then `GET /admin/login?_rsc`. The `/admin` payload carried the right answer,
`"digest":"NEXT_REDIRECT;replace;/admin/applications;307;"`, so the server chose correctly; the
client never acted on it.

**The corpse.** `src/app/admin/layout.tsx` wraps `/admin/login` and `/admin/invite` too. It mounts
there while signed out, its `useAdminAuth` instance records "not authenticated", and an App Router
layout persists across client-side navigation. The sign-in page's own `useAdminAuth` instance
signed in; the layout's did not hear about it. So on the next route it returned `null` instead of
the page, which is where the redirect would have been caught, and its effect pushed back to
`/admin/login`. Read from the code, the same mechanism bounces every fresh-browser sign-in on
`master` (pushing to `/admin/pets`) and every invitation acceptance; it is masked only for a
browser that already holds a cached user in localStorage. Inferred, not reproduced on `master`.

**What K1 pre-registered as the alternative does not survive the corpse.** It said the landing
"must be chosen on the client". Any client-side push into the console after sign-in meets the same
stale layout, whoever chose the destination, so that alternative would fire K1 too.

**Back to Phase 0** with this in view: see `2026-10-19-sessions-change-by-document-load.md`.
