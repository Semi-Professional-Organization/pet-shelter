# Admin console loose ends found during the role dead-end sweep

**Status:** ASSERTED · opened 2026-10-19 · read from the code, not reproduced

Each was seen and left: none sends a role somewhere it cannot use, which is what that change fixed.

## 1. The new-application alert links to a hard-coded origin

`src/lib/email.ts` writes `https://hopeforstrays.org/admin/applications` into the staff alert,
where the invitation email in the same file uses `APP_BASE_URL`. Any other deployment's alert opens
the production site.

Agent-checkable trigger: `grep -n "hopeforstrays.org/admin" src/lib/email.ts` prints two lines
today; closed when it prints none.

## 2. The receipts export is guarded by a role list and reports failure as success

"Export Receipts CSV (LHDN)" on `/admin/audit` calls `fetchDonationReceiptsAction`, which checks
`[ROLES.ADMIN, ROLES.COORDINATOR]` rather than a permission. The holders match `VIEW_AUDIT_LOG`
today and would drift apart if that permission were granted to another role. A failed export is
shown in the green success banner.

## 3. "Reset Defaults" on the settings page only resets this browser's copy

It rewrites localStorage and changes nothing on the server, with no message saying so.

## 4. Content editors are shown instructions only an operator can follow

The bulletin editor's outage text names a migration directory, and the transparency editor's
sample-data notice says to run `npm run db:push`.

## 5. The legacy admin cookie authorises pet writes but not the pet list

`verifyAdminSession` accepts the shared-secret `admin_session` cookie for pet writes and uploads;
`getAdminPets` does not. A session that carries it is shown the browser's demo animals while its
writes land on real rows. Removing that branch is already proposed in
`.claude/commands/remove-legacy-admin-token.md`.

## 6. In a database outage the boards still show demo records

The pets and applications pages no longer catch their read's failure, but in a deployment without
`STRICT_PERSISTENCE` the repositories do it a level down: `getServerApplicationsAsync` answers a
failed query with its in-memory mirror, and the pet reads fall back the same way. So during an
outage the boards show whatever the mirror holds — the bundled demo records on a fresh instance —
with nothing to say they are not the shelter's. Same family as
`tasks/open/an-outage-serves-and-bills-fixture-animals.md`.

## 7. The settings form starts from a personal email address

The "Staff Notification Destination" field and a Super Admin's test-email recipient default to a
hard-coded personal address, in `src/lib/client/settingsStore.ts`,
`src/lib/server/settingsRepository.ts` and the settings form's placeholders. `loadShelterSettings`
does not carry that field (`HYDRATED_SETTING_KEYS` in `src/actions/settings.ts`), so a stored
value never replaces the default in the form. A Super Admin who presses "Send Test Email" without
editing the field sends the shelter's test email to that inbox, and saving the form stores the
address. Staff alerts are addressed from `SHELTER_NOTIFICATION_EMAIL` and are not affected, nor
are members without `MANAGE_SETTINGS`, whose test email now defaults to their own address.

Agent-checkable trigger: `grep -rn "@gmail.com" src` prints five lines today; closed when it
prints none.

## 8. Smaller ones

- An Animal Manager can trigger supporter photo-update emails (pet saves need only `MANAGE_PETS`)
  without holding `SEND_SHELTER_EMAIL`.
- "Remove image" in the pet form deletes the stored file before the form is saved, so cancelling
  leaves the record pointing at a deleted file.
- There is no `error.tsx` anywhere under `src/app`, so any uncaught error shows the framework's
  page. The FAQ editor, which has no outage fallback by design, does this without a database.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
