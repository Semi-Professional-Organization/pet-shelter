# Operational Runbook: Donations and Sponsorship Payments

**Hope for Strays**, No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor

Rewritten on 2026-11-05. The earlier version of this runbook (then
`RUNBOOK_DONATION_AND_LHDN_TAX_RECEIPTS.md`) told staff that gifts are tax-deductible and listed
ROS and LHDN numbers to print on receipts. That was never true: the shelter is **not a registered
society** and holds **no LHDN Subsection 44(6) approval** (owner, 2026-11-05; #239). The site no
longer issues tax receipts. See
`tasks/decisions/2026-11-05-a-reconciled-gift-earns-an-acknowledgement-not-a-tax-receipt.md`.

## 1. What staff may and may not tell a donor

- **Do** say that every confirmed gift is recorded and acknowledged by email.
- **Do not** say a gift is tax-deductible, that the shelter is a registered society or NGO, or
  quote any ROS or LHDN number. There is none.
- If a donor asks for a tax receipt, say plainly that the shelter cannot issue one. Donors who
  pledged before 2026-11-05 may have been told one would follow; the acknowledgement email says
  once that it is not a tax receipt, for that reason.

## 2. How a gift reaches the ledger

```
1. Donor chooses an amount on /donate, or a tier in a pet's sponsorship modal
2. Donor pays by DuitNow QR or bank transfer, using the pledge reference as the
   transfer description (HFS-GFT-... for a general gift, HFS-PLG-... for a sponsorship)
3. The site records a PENDING pledge. Nothing is numbered and no money is assumed yet.
4. A coordinator matches the transfer on the bank statement and confirms it in
   /admin/donations ("Confirm payment received", then "Record donation")
5. Confirming draws a gapless HFS-DON-YYYYMM-NNNN record number, writes an
   append-only Donation row and emails the donor a thank-you acknowledgement
```

A pledge that no transfer ever backed is **dismissed** from the same queue, with an optional
reason that goes to the audit log. A dismissed pledge cannot be confirmed afterwards.

`Donation` rows are append-only. A wrong row is corrected with an offsetting record, never by
deleting or renumbering it; that decision belongs to the owner.

## 3. Exports

On `/admin/audit`:

- **Export Donations CSV** reads the donation ledger and writes one row per recorded donation:
  record number, date, donor, amount, tier, rail, frequency and dedicated pet. It has no tax
  columns. If the ledger is empty or capped, the screen says so; read that notice before relying
  on the file.
- **Export Audit Trail** writes the append-only audit log as it stands.

## 4. In-kind drop-offs

1. **Food**: dog and cat kibble and puppy or kitten milk formula, unopened and in date.
2. **Medical supplies**: unopened disinfectants, pee pads, sterile gloves, flea and tick
   preventatives.
3. **Bedding**: clean towels and fleece blankets. Recycle items with loose threads.
4. Record each drop-off in the intake logbook at reception.

Visiting hours: Tuesday to Sunday, 10:00 AM to 5:00 PM.

## 5. Troubleshooting

### The donor did not get the acknowledgement email
1. Ask them to check spam.
2. In `/admin/audit`, search for their email address and look for `EMAIL_SENT` or
   `EMAIL_FAILED`.
3. If the pledge is still pending, it has not been confirmed yet, so no email was due.

### "Too many submissions"
More than 20 submissions from one email address in 5 minutes. Ask the donor to wait, or to pay by
bank transfer with the reference they already have.

### "Minimum donation amount is RM 5.00"
The form rejects amounts below RM 5.00.

## 6. Changing payment details

- **QR codes**: `/admin/settings`, DuitNow QR section.
- **Bank account name** shown on `/donate` (`donations.accountHolder` in
  `src/lib/i18n/translations.ts`): being confirmed with the shelter under #252. Do not change it
  until the shelter confirms the name on the account.
- **Sponsorship tiers**: `SPONSORSHIP_TIERS` in `src/lib/domain/sponsorshipTiers.ts`.
