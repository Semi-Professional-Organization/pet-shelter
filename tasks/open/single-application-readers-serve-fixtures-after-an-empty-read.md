# Two single-application readers serve fixtures after an empty read

**Status:** ASSERTED · opened 2026-10-27 · found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, which settled #65 for
the list readers only

`findServerApplicationByIdAsync` and `findServerApplicationByReferenceAsync` in
`src/lib/server/applicationRepository.ts` fall through to the `applications.json` mirror when
the database answers with no row, not only when it throws. That is the shape the pet readers and
`getServerApplicationsAsync` gave up. So with a healthy production database, the public tracking
lookup for a fixture reference such as `app-001`, with the fixture's email (both public in this
repository), returns the demo application's status as if it were real.

**Settles when:** both readers return `null` after a successful empty read and reach the mirror
only from their `catch` or with no database configured, pinned by a strict-mode test using a real
`applications.json` id.
