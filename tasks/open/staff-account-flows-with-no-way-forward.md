# Staff account flows that leave someone with no way forward

**Status:** ASSERTED · opened 2026-10-19 · read from the code during the role dead-end sweep, not
reproduced

Found alongside the role dead ends and left out of that change because none is about what a role
may do.

## 1. A Super Admin cannot give a legacy VOLUNTEER row the STAFF role in one step

A row still carrying the retired `VOLUNTEER` role is displayed as "Staff" (`normalizeRole`), so
"Save Role" is disabled when Staff is picked, and `updateMemberRole` compares the normalised role
and would treat it as no change anyway. The row keeps no permissions. Workaround: assign another
role, then Staff.

## 2. Suspending an invited member and reactivating them locks them out

Suspending clears the invitation token (`updateMemberStatusRecord` in
`src/lib/server/memberStore.ts`). `toggleMemberStatus` refuses to reactivate a member who is still
`INVITED`, but a suspended invitee is `SUSPENDED`, so reactivation goes through and leaves an
`ACTIVE` account holding the unusable placeholder password. "Resend" is no longer offered and the
server would refuse it. There is no staff password reset.

## 3. Member actions fail silently once the cookie expires

Server Actions post to the route they are used on. On `/admin/members` the proxy answers an
expired cookie with its HTML 401 document instead of running the action, and the four handlers in
`src/hooks/useMemberTableController.ts` have no `catch`, so the click shows nothing.

## 4. A dead invitation link still shows the activation form

`/admin/invite` checks only that the link has a token and an email. An expired, used or replaced
invitation is reported after the person has chosen and confirmed a password. A thrown
`acceptInvitation` call leaves the button spinning with no message.

## 5. Signed-in staff are shown the sign-in form, and sign-in forgets where they were going

The footer's "Staff Portal" goes to `/admin/login`, which does not check for a session. And
signing in always enters the console at `/admin`, so a bookmarked section or a link from an email
is lost along the way.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
