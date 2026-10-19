# Decisions on real adoption applications never reach the server

**Status:** ASSERTED · opened 2026-10-19 · read from the code during the role dead-end sweep, not
reproduced against a database

Found while mapping which roles can use the applications board. Not a role problem — it affects
every role, Super Admin included — so it was left out of that change on purpose.

## 1. The board checks the browser's copy before it calls the server

`useApplicationTableController` (`src/hooks/useApplicationTableController.ts`) applies a status
change or a decision to the client store first and calls `updateApplicationStatus` on the server
only if the store accepted it. The store (`src/lib/client/applicationStore.ts`) holds the three
sample applications from `src/data/applications.json` plus anything this browser created, and
answers `"Application not found"` for any other id. Applications submitted through the public form
get a server id, so for every real application the row select and "Save Decision" stop at
"Application not found" and the server is never asked.

Agent-checkable trigger: in `src/hooks/useApplicationTableController.ts`, `handleQuickStatus` and
`handleUpdateStatusWithNotes` call the store's `updateApplicationStatus` before `serverUpdateStatus`
and return early when it fails. Closed when a server-sourced row reaches `serverUpdateStatus`
without the store's approval.

## 2. A refused change stays in the browser's copy

When the server refuses a change, only the on-screen list is rolled back; the store keeps the
change in localStorage (`hope_for_strays_applications_v1`), and the next check against the store
uses it.

## 3. Scheduling a meet and greet reopens a decided application

After a successful `scheduleApplicationInterview`, the dialog saves the status `UNDER_REVIEW` a
second time (`src/components/admin/ApplicationDetailDialog.tsx`), though the server action keeps
the existing status on purpose. An approved or rejected application can be reopened this way, and
a second status email goes out. The success text says an email was sent even when the box was
unticked.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
