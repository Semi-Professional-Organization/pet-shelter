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

**Step 2 — still live, GRAVE (midwife lane):** the tax-receipt *feature* is untouched —

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
- `donations.accountHolder` ("Pertubuhan Kebajikan Hope for Strays") — the bank account's name,
  a banking fact to confirm with the shelter, not copy to reword;
- `src/data/transparency.json`'s sample "LHDN tax-deductible receipts issued" stat;
- production faq-005: `tasks/open/production-faqs-need-the-edits-the-fixture-made.md`.

Unanswered questions that decide step 2:

1. Is "not registered" **confirmed**, or a belief? If the shelter is registered some other way
   (company, university society), the wording changes rather than disappears.
2. Has the **live site ever issued a tax receipt**? If so, existing `Donation` rows and sent
   emails are a legal matter for the shelter; the rows must be decided on, not deleted.

**Settles when:** both questions are answered by the stakeholder, and step 2 has either removed the
receipt feature (with a migration plan for snapshot columns) or re-pointed it at real, verified
identifiers. Close P2 (`docs/tasks/HANDOFF_SECURITY_REHAB_AND_HISTORY.md`) in the same change.
