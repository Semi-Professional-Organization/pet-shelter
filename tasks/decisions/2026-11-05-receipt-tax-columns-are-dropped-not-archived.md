# The receipt tax columns are dropped, not archived

**Decided:** 2026-11-05 · #251, under #239

`donations."taxIdOrIc"`, `donations."taxDeductibleRef"`, `donations."shelterRegistrationNo"`,
`donation_pledges."taxIdOrIc"` and `pet_sponsorships."taxIdOrIc"` are dropped by
`prisma/migrations/manual/20261105_drop_receipt_tax_columns/`, and their values are not copied
into an archive table first.

Why no archive, unlike `pets_age_archive_20260922`: the owner confirmed the live site never issued
a tax receipt, so these columns hold no document anyone relies on. What they can hold is NRICs a
donor typed at checkout before 2026-11-05, which nothing reads any more. Keeping a copy would keep
personal data with no purpose, which is the opposite of what the drop is for. The Neon snapshot
branch taken before the contract step is the one recovery point, and it ages out on Neon's own
schedule.

The contract file refuses to run if any `donations` row carries a non-empty tax value, because
such a row would be an issued tax receipt and #251 says that is the shelter's call, not a
migration's. Pending pledges' NRICs do not block it: they were never on a receipt.

The two reconcile lanes now build the acknowledgement payload with one helper,
`toDonationReceiptDTO` in `src/lib/server/donationAcknowledgement.ts`, which settles the open
entry `two-acknowledgement-payload-builders.md`. `DonationAcknowledgement` is gone: with the tax
fields removed from `DonationReceipt` it was the same type.

Reversing this: run `rollback.sql` (shape only, columns come back empty) and restore values from
the Neon snapshot if they are needed. A real registration in future would need its own design, not
these columns back.
