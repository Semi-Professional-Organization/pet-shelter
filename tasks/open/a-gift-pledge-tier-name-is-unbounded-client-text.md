# A gift pledge's tier name is unbounded client text that staff read as the allocation

**Status:** ASSERTED · opened 2026-11-11 · found by review of #205, read from the code

`donationPledgeSchema` in `src/lib/validations/donation.ts` accepts `tierName` as
`z.string().optional()`, with no maximum length. `submitDonationPledgeAction` in
`src/actions/donations.ts` then prefers it over the catalogue's own name:
`optionalText(validated.tierName) ?? matchedTier?.name ?? "Custom Rescue Donation"`. The donation
form sends the catalogue name, but any caller of the Server Action can send any text of any
length.

That text is snapshotted onto the pledge, shown in the coordinator's queue as the row's
`purpose` (`src/components/admin/DonationPledgeReconciliation.tsx`), with no label saying the
caller supplied it, and copied to the `Donation` receipt and the acknowledgement email at
reconciliation. #205 dealt with the dedication, which is free text by decision. It did not touch
the tier name, which reads as the shelter's own allocation.

**Settles when:** the server derives the name from `tierId` (keeping the client's text only for
the custom tier, bounded and labelled), or the schema bounds it and the queue labels it as the
donor's. Either is pinned by a test posting a `tierName` that differs from the catalogue's.
