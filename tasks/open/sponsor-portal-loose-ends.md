# Sponsor portal loose ends found during the role dead-end sweep

**Status:** ASSERTED · opened 2026-10-19 · read from the code, not reproduced

The sweep fixed the sign-in loop for a sponsor whose record is gone, "Become a sponsor" leading to
the general-gift form, and "Claim your portal" being offered to every donor. These were left.

## 1. The wall toggle promises a place on the wall it may not give

`WallOptInToggle` tells any opted-in sponsor "You appear on /sponsors", but the wall skips sponsors
with no standing (`src/lib/domain/sponsorAccess.ts`, `src/lib/domain/supporterTier.ts`).

## 2. /sponsors points at a checkout option that does not exist

The page tells visitors to tick the Sponsor Wall option at checkout. No checkout form has one; it
exists only in the server schema (`src/lib/validations/sponsorship.ts`).

## 3. A sponsored rescue that has since been archived links to a 404

"View profile" on the dashboard goes to `/pets/<id>`, which treats an archived animal as missing,
and there is no `not-found.tsx`.

## 4. Gold sponsors are invited to an open day that has passed

`src/app/sponsor/dashboard/page.tsx` carries "Sanctuary open day — 18 October 2026".

## 5. Smaller ones

- On the dashboard, the upgrade nudge's "Sponsor portal" button links to the page it is on.
- The wall toggle and sign-out run their actions in transitions with no `catch` and there is no
  `error.tsx`, so a thrown action replaces the page with the framework's error screen; a failed
  caretaker question shows nothing.
- Registering with a general gift's receipt is refused with "That receipt number does not match
  this email address", when the reason is that only a sponsorship receipt can claim a portal.
- `cancelRecurringPledgeAction` exists, but nothing in the portal offers it.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
