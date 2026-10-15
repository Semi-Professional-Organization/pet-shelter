# A supporter's NRIC is not copied into the audit log

**Decided:** 2026-10-13 · closes `tasks/open/two-contribution-lanes-disagree-about-storing-an-nric.md`
(opened 2026-09-22; its text is in `git log -- tasks/open/two-contribution-lanes-disagree-about-storing-an-nric.md`)

## What was wrong

Both contribution lanes reconcile a payment, issue a Section 44(6) receipt, and write an audit row
the LHDN CSV fallback can export. They disagreed about the supporter's tax identifier:
`reconcileDonationPledgeAction` wrote `taxIdOrIc` into its `DONATION_RECEIVED` details and
`reconcilePetSponsorshipAction` did not. In one fallback export a general donor's
"Tax ID / IC / Passport" cell was filled and a sponsor's was blank, though both had supplied one.

## The decision

Neither lane writes it. `taxIdOrIc` was removed from the `DONATION_RECEIVED` details.

The identifier is still on the `Donation` row, which is what `fetchDonationReceiptsAction` — the
authoritative export — reads, and it is still on the receipt email. What stops is a second copy in
`AuditLog.metadata`, a table with a different retention story from the ledger.

This is the direction the codebase already leaned. `listPendingSponsorships` and
`listPendingDonationPledges` both keep the field out of the coordinator's queue with an explicit
allow-list `select`, on the reasoning that confirming a transfer does not need anybody's NRIC.

## What it costs

The CSV *fallback* — taken only when the ledger read comes back empty — now leaves the tax column
blank for rows written from 2026-10-13. A fallback export is a degraded path and now behaves like
one for that column. Rows written earlier still carry the identifier in their details and still
export it; nothing was deleted from existing audit history.

## What would reverse this

A requirement that the fallback export be fileable for relief on its own. Then both lanes should
write the identifier, not one, and the retention of `audit_logs` should be decided at the same
time — the asymmetry was the defect, not either answer.
