# The admin donation exports still carry old tax fields and a notice that can vanish

**Status:** open · opened 2026-11-05

Found by the review of #249/#250 and declined there as out of scope. None of it is a claim the
site makes to the public.

- **Old audit rows can still show an NRIC.** #251 dropped the tax columns and the DTO fields,
  but the audit-trail CSV and the audit viewer print each entry's full `details` JSON, which for
  a row written before 2026-10-13 can hold a donor NRIC. The receipt feature was never live, so
  production rows should hold none; #251's `precheck.sql` reports the count
  (`audit_rows_with_nric`). Decide whether old `details` need redacting on read if it is above 0.
- **A truncation warning can disappear.** Every transient export notice in
  `src/hooks/useAuditLogController.ts` starts an uncancelled 4s timer that clears the notice. A
  timer from an earlier export can clear the incomplete-export warning that is meant to stay.
  Pre-existing.
- **Failure notices look like success.** `AuditLogViewer.tsx` renders every export notice with
  success styling and a check icon, including "Nothing was exported" and "Do not treat this as
  complete". Pre-existing.

**Settles when:** the audit NRIC count is known (and redaction decided if it is not 0), and the notice gets a tone and a cancellable timer.
