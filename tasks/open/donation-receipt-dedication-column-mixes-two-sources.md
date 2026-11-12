# The receipt dedication column mixes donor notes with verified sponsorship pets

**Status:** ASSERTED · opened 2026-11-11 · found while implementing #205, read from the code

`Donation.targetPetName` is written from two sources. A general gift copies the donor's own
note from its `DonationPledge`, which no one checks against the catalogue
(`tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md`). A sponsorship receipt
copies the sponsored pet's name (`receiptDraftFor` in `src/lib/server/sponsorshipLedger.ts`),
which the server verified by id at checkout. Nothing on the `Donation` row says which.

So one column in the receipts CSV (`generateReceiptsCsvString`) and one row in the
acknowledgement email cover both. #205 labelled them for the unverified case ("Donor's Note
(Dedication)" in the CSV, "Dedication" in the email), so a sponsorship row is understated rather
than a general gift overstated.

A related gap on the donor's side: with `?pet=` naming no animal in the catalogue, the widget's
chooser shows the general fund as selected while the pledge still carries the name, so the donor
first sees their dedication on the confirmation screen. Neither is a false claim after #205, so
both were left alone.

**Settles when:** either staff confirm one column is enough, or the export tells a sponsorship
receipt from a general gift (for example by the pledge reference prefix) and labels each, and the
widget shows a `?pet=` dedication before submission or drops it.
