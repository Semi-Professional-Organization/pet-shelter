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

Unanswered questions that decide step 2:

1. Is "not registered" **confirmed**, or a belief? If the shelter is registered some other way
   (company, university society), the wording changes rather than disappears.
2. Has the **live site ever issued a tax receipt**? If so, existing `Donation` rows and sent
   emails are a legal matter for the shelter; the rows must be decided on, not deleted.

**Settles when:** both questions are answered by the stakeholder, and step 2 has either removed the
receipt feature (with a migration plan for snapshot columns) or re-pointed it at real, verified
identifiers. Close P2 (`docs/tasks/HANDOFF_SECURITY_REHAB_AND_HISTORY.md`) in the same change.
