# The shelter may not be a registered society, but the site issues LHDN tax receipts as one

**Status:** open · opened 2026-10-01

On 2026-10-01 the user said the shelter is probably **not a registered society**, so it holds
neither an ROS registration nor LHDN Subsection 44(6) tax-deductible approval. The codebase assumes
both: `src/lib/domain/shelterIdentity.ts` carries two ROS numbers (`PPM-012-10-18042016` public,
`PPM-021-10-18082021` on receipts — already disputed as P2), an LHDN approval reference
(`LHDN.01/35/42/51/179-6.4912`) and the legal name "Persatuan Harapan Haiwan Terbiar Selangor".
"Persatuan" itself asserts a society.

**Step 1 — public claims (done 2026-10-01, this session):** badges, footer, home standards line,
navbar "(LHDN)", donate/get-involved/terms/privacy copy, FAQ data and translation strings no longer
claim registration or tax deductibility. See `tasks/today.md`.

**2026-11-05 update.** The owner answered both questions below: the shelter is not registered,
and the receipt feature was never active live. #248 removed the opt-in, the NRIC field, the
issuer snapshot on new rows and the tax wording from every email, in both the donation and the
sponsorship lanes (`tasks/decisions/2026-11-05-a-reconciled-gift-earns-an-acknowledgement-not-a-tax-receipt.md`).
The items below that remain are #249 (identity constants, society names, modal receipt block),
#250 (admin export and audit labels, transparency stat, print styles)
and #252 (account holder name).

**2026-11-05, second update (#249, #250).** The identity constants, both ROS numbers, the LHDN
reference, the "Persatuan" and "Pertubuhan Kebajikan" names (except the bank account name), the
modal's ROS line, the certificate's registration row, the dead `receipt*` translation keys, the
footer's "registered non-profit" line, the admin "LHDN" export and its tax columns, the queue's
"Issue receipt" wording, the transparency stat and "filed with ROS" copy, the placeholder report
PDFs and the donations runbook are gone or rewritten. P2 is closed.
`tests/unit/shelterIdentity.test.ts` fails if an ROS number, LHDN reference, society name or
"44(6)" reappears in `src/`. What is still open:

- **#251:** the stored `taxIdOrIc`, `taxDeductibleRef` and `shelterRegistrationNo` columns.
- **#252:** the bank account. The site's account was fake; PR #281 removes it, the holder-name
  exception in the guard and the `donations.accountHolder` key. The real account is
  `tasks/open/the-shelter-bank-account-is-not-confirmed.md`.
- **Production data, by hand:** if the sample transparency ledger was ever seeded into
  production, its `tax_receipts_issued` impact stat and "filed with ROS" report summaries are
  still in the database; the baseline file no longer carries them. Production faq-005:
  `tasks/open/production-faqs-need-the-edits-the-fixture-made.md`.
- **Configuration:** `ROS_REGISTRATION_NO` is no longer read. It can be deleted from Vercel and
  from `.env.production.enc` (encrypted, so not edited in this change).
- Internal names (`DONATION_RECEIPT` email template, `DonationReceiptEmail` audit entity,
  `--receipt-*` tokens, `receiptNumber`) are kept: renaming them changes how old audit rows read
  and touches every paper-styled surface, for no visible difference.

**Step 2 — as found before 2026-11-05 (see the update above for what is now gone):** the tax-receipt *feature* was untouched —

- `src/lib/server/donationLedger.ts`, `src/actions/donations.ts`: issue "Section 44(6)" receipts and
  snapshot the identifiers onto `Donation` rows (`prisma/schema.prisma`).
- `src/lib/email.ts` (+ `emailTokens.ts`): receipt emails.
- `src/components/features/pets/SponsorshipModal.tsx`, `src/lib/domain/sponsorshipTiers.ts`:
  client-side sponsorship receipt.
- `src/lib/presentation/exportCsv.ts`: ROS CSV export. `globals.css` `--receipt-*` print styles.
- Admin audit views (`AuditLogViewer.tsx`, `useAuditLogController.ts`) label receipt events.

**After the 2026-10-20 rebase onto master.** Master kept building on 44(6) approval while this
branch was open (`19e4b7c` receipts after reconciliation, `e16cb5d` the opt-in). Step 1 was
re-applied to master's surfaces, including ones this branch never saw (the `/transparency` badges
and its "official LHDN tax-deductible e-Receipt instantly" line, the `/donate` and `/faq`
metadata). Still claiming, all part of the receipt feature or a banking fact, left for step 2:

- `DonationWidget.tsx`: the Section 44(6) opt-in checkbox and the post-submit "your official
  Section 44(6) receipt is emailed" line;
- `SponsorshipModal.tsx`: the "Pertubuhan Kebajikan" name and `STATUTORY_ROS_REGISTRATION_NO` in
  its receipt block; `donations.receiptSubtitle`; the admin "Export Receipts CSV (LHDN)" label;
- the bank account and its holder name (removed in #281, see #252);
- `src/data/transparency.json`'s sample "LHDN tax-deductible receipts issued" stat;
- production faq-005: `tasks/open/production-faqs-need-the-edits-the-fixture-made.md`.

Unanswered questions that decide step 2:

1. Is "not registered" **confirmed**, or a belief? If the shelter is registered some other way
   (company, university society), the wording changes rather than disappears.
2. Has the **live site ever issued a tax receipt**? If so, existing `Donation` rows and sent
   emails are a legal matter for the shelter; the rows must be decided on, not deleted.

**Settles when:** #251 drops the stored columns and #252 settles the account name. Both questions
above are answered (not registered; never issued live), and P2 was closed with #249.
