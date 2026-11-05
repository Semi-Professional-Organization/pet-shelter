# A reconciled gift earns an acknowledgement, not a tax receipt

**Decided:** 2026-11-05

The owner confirmed on 2026-11-05 that the shelter is not a registered society, holds no ROS
registration and no LHDN Subsection 44(6) approval, and that the receipt feature was never
active on the live site (#239). So from this change:

- Neither the donation form nor the sponsorship modal offers a relief opt-in or asks for an NRIC,
  passport or SSM number. Both validators drop `taxIdOrIc` and `wantsTaxReceipt` if a stale client
  still sends them, rather than rejecting the gift.
- Reconciliation still draws a gapless `HFS-DON-*` number and writes a `Donation` row: that is the
  shelter's record that money arrived, which it needs whether or not anyone can claim relief. The
  row gets no donor tax number, and `taxDeductibleRef` and `shelterRegistrationNo` are written as
  empty strings because the columns are `NOT NULL` until #251 drops them. `DonationDraft`,
  `DonationPledgeDraft` and `SponsorshipDraft` cannot carry those fields, so no caller can put
  them back by accident.
- The email sent at reconciliation is a thank-you that states the amount, the rail and the
  reference, and says once that it is not a tax receipt. It names no statute, registry or tax
  authority, and its input type (`DonationAcknowledgement`) has no field to print one from. The
  one negative line stays because donors who pledged before this date were told a tax receipt
  would follow.

This reverses `2026-09-08-lhdn-relief-is-opt-in-not-a-column.md` (there is no relief to opt
into) and `2026-09-08-a-receipt-asserts-relief-only-when-it-can-back-it.md` (no receipt asserts
relief at all, so `isTaxClaimable` is gone). The admin CSV export from
`2026-08-31-lhdn-export-reads-the-ledger.md` still exists; it now prints a row's stored
identifiers as they are, so new rows export empty ROS and LHDN cells instead of back-filled
constants, and #250 renames it.

Reversing this needs a real registration and approval first. Then the identifiers come back in
`shelterIdentity.ts`, a migration restores what #251 removed, and the opt-in returns to both forms.

Left for later PRs under #239: the ROS/LHDN constants and society names (#249), the admin LHDN CSV
label, audit labels, transparency stat and `--receipt-*` print styles (#250), the stored columns
(#251), and the bank account holder name (#252, waiting on the owner).
