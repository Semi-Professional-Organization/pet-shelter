# The two reconcile actions build the acknowledgement payload separately

**Status:** open · opened 2026-11-05

`toReceiptDTO` in `src/actions/donations.ts` and the inline `receipt` object in
`reconcilePetSponsorshipAction` (`src/actions/sponsorships.ts`) both map a `DonationRecord` to the
acknowledgement email's input, each with its own Asia/Kuala_Lumpur date formatting. Since #248 they
also differ in shape: the gift lane still passes the retired tax fields (which the email's
`DonationAcknowledgement` type ignores) because the CSV export shares `toReceiptDTO`, and the
sponsorship lane omits them. Review of #248 found this and it was declined there as pre-existing
duplication outside that change's scope.

**Settles when:** one helper, typed as `DonationAcknowledgement`, builds the email payload for both
lanes, ideally in the same change as #251, which removes the retired fields from `DonationReceiptDTO`.
