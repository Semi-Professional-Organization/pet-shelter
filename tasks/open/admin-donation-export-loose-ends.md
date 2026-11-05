# The admin donation exports still carry old tax fields and a notice that can vanish

**Status:** open · opened 2026-11-05

Found by the review of #249/#250 and declined there as out of scope. None of it is a claim the
site makes to the public.

- **Tax fields still reach the browser.** The donations CSV no longer has tax columns, but
  `toReceiptDTO` in `src/actions/donations.ts` still sends each row's `taxIdOrIc`,
  `taxDeductibleRef` and `shelterRegistrationNo` to the admin page, and the audit-trail CSV and
  the audit viewer print each entry's full `details` JSON, which for a pre-2026-11-05 row can hold
  a donor NRIC. The receipt feature was never live, so production rows should hold none. Belongs
  with #251, which drops the columns: drop the DTO fields in the same change, and decide whether
  old audit `details` need redacting on read.
- **A truncation warning can disappear.** Every transient export notice in
  `src/hooks/useAuditLogController.ts` starts an uncancelled 4s timer that clears the notice. A
  timer from an earlier export can clear the incomplete-export warning that is meant to stay.
  Pre-existing.
- **Failure notices look like success.** `AuditLogViewer.tsx` renders every export notice with
  success styling and a check icon, including "Nothing was exported" and "Do not treat this as
  complete". Pre-existing.

**Settles when:** #251 removes the fields, and the notice gets a tone and a cancellable timer.
