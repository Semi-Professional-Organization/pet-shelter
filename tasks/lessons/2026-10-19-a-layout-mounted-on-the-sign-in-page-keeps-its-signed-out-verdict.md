# A layout mounted on the sign-in page keeps its signed-out verdict across client navigation

**Learned:** 2026-10-19

`src/app/admin/layout.tsx` wraps `/admin/login` and `/admin/invite` as well as the console. It
mounts on the sign-in page while signed out, and its own `useAdminAuth` instance records that. An
App Router layout persists across client-side navigation, so when the sign-in page — with its own
hook instance — signed in and called `router.push`, the layout still believed nobody was signed
in: it rendered nothing and pushed back to `/admin/login`. Every fresh-browser sign-in and every
accepted invitation bounced. Nothing had caught it for weeks: a browser that already held a cached
user in localStorage mounted the layout signed in, the e2e fixture seeds that cache on purpose,
and the component tests mock the hook. It surfaced only when a kill condition demanded an observed
sign-in in a clean profile.

**Rule:** when a session is created outside a persistent client layout's own state, end the flow
with a document load (or make the state shared), and verify any post-sign-in navigation in a real
browser with no cached session before believing it.
