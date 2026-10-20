# The applications board shows its own copy after the first change, and scheduling replaces the review notes

**Status:** ASSERTED · opened 2026-10-20 · read from the code during the role dead-end sweep;
section 3 is observed in `tests/unit/applicationInterviewScheduling.test.ts`

Decisions on real applications reach the server since the role dead-end sweep (the board used to
stop at the browser's sample copy with "Application not found"). These were seen alongside and
left, because none changes who may do what. They predate the sweep, which made them reachable.

## 1. After its first change the board stops following the server

`useApplicationTableController` keeps a local copy of the rows as soon as a member changes one
(`localApplications || initialApplications`), and every list the server sends afterwards is
ignored until the page is reloaded. So what the server does as a consequence of a decision does
not appear: approving one application closes every other open application for the same animal,
and those rows keep showing Submitted or Under Review. A reviewer who then moves one of them on
reopens an application the server had already closed, since Rejected may move back to Under
Review.

## 2. A refused change rolls back every row, not just its own

Each handler keeps a copy of the whole list from before its request and restores it on a refusal.
A second change made while the first was in flight, which the server accepted, disappears from
the screen when the first is refused.

## 3. Scheduling a meet and greet replaces the review notes

`scheduleApplicationInterview` writes the meeting's details as the application's review notes,
so whatever reviewers had written there is lost. An older comment beside it said the details were
appended. Whether to append, and how the applicant-facing text should read, is a product choice.

**Settles when:** each section is fixed or moved to `tasks/decisions/` as a deliberate non-fix.
Sections 1 and 2 likely settle together, by letting the server's list be the board's source of
truth after each change (React's `useOptimistic` is built for that).
