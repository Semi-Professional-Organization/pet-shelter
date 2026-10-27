# Only the session secret can stop the boot

**Decided:** 2026-10-27, by the owner (asked for #129 to be fixed at its root).

## What changed

`assertSecretsConfigured()` still checks all three authentication secrets when the server starts,
and still reports every bad one at once. It now throws only when `SESSION_SECRET` is unsafe. A
weak, unset or published `ADMIN_SECRET_KEY` or `STAFF_INVITE_SECRET` is logged with
`console.error`, naming the feature it disables, and the public site keeps serving.

The accessors are unchanged: in production each still throws on every call with a bad value. So
the feature behind it stays off until the secret is fixed:

- `STAFF_INVITE_SECRET`: `registerAction` catches the throw and refuses staff sign-up with
  "Staff registration is unavailable right now". Nothing is created.
- `ADMIN_SECRET_KEY`: `getAdminPrincipal` already caught it and grants nothing to the legacy
  `admin_session` cookie. Signed staff sessions are unaffected.

This is option 2 of `2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`, added on
top of the option the owner chose then (a short invite code is accepted with a warning). It does
not reverse that decision. It closes the open entry `one-weak-secret-still-takes-the-whole-site-down`.

## Why the session secret stays fatal

It signs every session cookie and keys field encryption, and `crypto.ts` resolves it at module
load. Without it nothing that reads a session can run, so a boot without it would not be a working
public site either; it would be a site that fails later and less clearly.

## Reversible, and why someone might

If a disabled feature is judged worse than an outage (for example, staff cannot sign up for days
because nobody reads the logs), the throw can return for that secret by setting `fatal: true` in
`BOOT_CHECKS` in `src/lib/security/secrets.ts`. The cost is the 2026-10-17 outage shape again.

## Not done here

The rate limiter is still per-process, so on Vercel it does not bound guessing a short invite code
across warm instances. That is the ceiling on `getStaffInviteSecret` and in `registerAction`;
fixing it needs shared state (Postgres or Redis) and is a separate change.
