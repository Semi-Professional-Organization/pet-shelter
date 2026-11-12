# Donor text reaches the plain-text donation emails with its newlines

**Status:** ASSERTED · opened 2026-11-11 · found by review of #205, read from `src/lib/email.ts`

#205 made the dedication one line at the schema (`normaliseDedication` in
`src/lib/domain/donationPledge.ts`), so a new `targetPetName` cannot start a line of its own in
a plain-text email. The other donor-supplied fields were left alone, and they reach the text
bodies raw:

- `sendDonationReceiptEmail` prints `receipt.donorName` (`- Name:`), `receipt.tierName`
  (`- Allocation:`) and `fields.notes` (`- Donor Message:`).
- `sendDonationPledgeEmail` prints `pledge.donorName` (`Dear …,`) and `pledge.tierName`
  (`- Programme:`).

`donationPledgeSchema` bounds `donorName` and `notes` by length only, and `tierName` not at all
(`tasks/open/a-gift-pledge-tier-name-is-unbounded-client-text.md`). So a newline in any of them
can start a line such as `TOTAL RECEIVED: RM 9,999.00` in the mail the donor or staff read.
Rows stored before #205 can also still hold a newline in `targetPetName`, since the
normalisation applies only to new writes.

**Settles when:** one single-line helper is applied to every interpolated value where
`email.ts` builds the plain-text body of these mails, pinned by a test that sends a value
containing a newline through each field and asserts the text body has no line it did not write.
