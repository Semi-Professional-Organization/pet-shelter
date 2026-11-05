# Two interfaces describe one acknowledgement

**Status:** open · opened 2026-11-05

`DonationReceiptDTO` (`src/lib/validations/donation.ts`) and `DonationReceipt`
(`src/types/sponsorship.ts`) now carry the same fields; they differ only in `frequency` being
optional on the second and in how `tierId` is typed. #251 removed the third copy,
`DonationAcknowledgement`, and made one builder (`toDonationReceiptDTO`) feed both the email and
the export. Found by the #251 review and declined there as a type tidy-up outside the column drop.

**Settles when:** one is an alias of the other, with the `frequency` and `tierId` differences
resolved.
