# The receipt dedication column mixes donor notes with verified sponsorship pets

**Status:** ASSERTED · opened 2026-11-11 · found while implementing #205, read from the code

`Donation.targetPetName` is written from two sources. A general gift copies the donor's own
note from its `DonationPledge`, which no one checks against the catalogue
(`tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md`). A sponsorship receipt
copies the sponsored pet's name (`receiptDraftFor` in `src/lib/server/sponsorshipLedger.ts`),
which the server verified by id at checkout. Nothing on the `Donation` row says which.

So the receipts CSV (`generateReceiptsCsvString` in `src/lib/presentation/exportCsv.ts`) prints
both in one column. #205 named that column `Dedication / Sponsored Pet` so it claims neither
alone, and marked it with a `ceiling:` comment. A coordinator reading one row still cannot tell
an unchecked name from a verified animal.

**Settles when:** the receipts CSV has a separate dedication column and sponsored-pet column,
each filled only for its own kind of receipt, pinned by a test in `tests/unit/exportCsv.test.ts`
that exports one general gift and one sponsorship receipt; or the owner records in
`tasks/decisions/` that one column is enough.
