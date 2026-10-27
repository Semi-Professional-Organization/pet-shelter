# A failed settings save is served as if it were saved

**Status:** ASSERTED · opened 2026-10-27 · found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code

`updateServerSettings` in `src/lib/server/settingsRepository.ts` passes a failed upsert to
`handlePersistenceError(…, "write")`, which swallows it outside strict mode, and then writes the
submitted values into the in-memory copy anyway. `getServerSettingsAsync` answers from that copy
when there is no row or the query fails. So until the process restarts, the public site can show
settings that never reached the database, including the DuitNow, Touch 'n Go and bank QR codes
and the payment payload: payment details nobody saved, on the page supporters pay from.

The admin form is protected (`getServerSettingsWithSource` says `fromDatabase: false`); the
public readers are not.

**Settles when:** a failed settings save is reported to the admin as failed and does not change
what the public site serves, pinned by a test that fails the upsert in non-strict mode with
`DATABASE_URL` set and reads the settings back.
