# The shelter's bank account is not confirmed

**Status:** open · opened 2026-11-05

The owner confirmed on 2026-11-05 that the Maybank account the site printed is fake and asked the shelter for
the real account (#252). `SHELTER_BANK_ACCOUNT` in `src/lib/domain/shelterIdentity.ts` is `null`
until then, so every bank-transfer panel shows the WhatsApp fallback instead.

Two things remain:

1. **The real details.** Fill in `SHELTER_BANK_ACCOUNT` (bank and branch, number, holder name)
   from a bank statement or the bank's confirmation. The holder name decides whether
   "Pertubuhan Kebajikan" can return; the society-name guard in `tests/unit/shelterIdentity.test.ts`
   will fail on it, which is intended, since the shelter is not a registered society (#239).
   Then add the DuitNow/transfer FAQ that #238 waits on.
2. **Production FAQs.** `faq-024` is not on production `/faq`
   (`tasks/open/production-faqs-need-the-edits-the-fixture-made.md`), so no production edit is
   needed for it; add the fixed wording there only if that entry brings it across.

When filling it in, also: reword `faq-024` in `src/data/faqs.json`, the README donation line and
the runbook's §6 "Bank account" paragraph, which all describe the WhatsApp fallback; update the component tests that assert the WhatsApp fallback
(`SponsorshipModal.test.tsx` `BANK_INSTRUCTIONS`, `DonationReceiptIntegrity.test.tsx`) to the
confirmed state, keep the target-pet "no account before the pledge reference" checks, and bring
back the `DonationReceiptIntegrity.test.tsx` test that copying the account does not change the
donor's chosen payment method (deleted in #281 because there is no copy button to click).

Declined in #281's review, recorded here once:
- `SponsorshipModal` is English-only while `BankTransferDetails` follows the site language, so a
  Malay visitor sees a Malay panel inside English copy. Translating the modal is its own task.
- `/donate`'s pledge screen shows no DuitNow QR for a QR donor who submits before scanning. It
  never did; #281 only restores the bank panel it removed. Showing the chosen rail's
  instructions there, as the sponsorship popup does, is a separate change.
- The guard misses digits split by JSX spacers (`{" "}`), escape sequences written in source, or
  zero-width characters: beyond its stated ceiling.
- The copy button's reset timer is not cleared on unmount or a second click, and the button
  does nothing where `navigator.clipboard` is missing. Both shipped before #281 in the two
  copies it merged; they matter only once an account is confirmed.
- `faq-024` (and other FAQs and the runbook) spell out the WhatsApp number as text, which no
  guard ties to `SHELTER_WHATSAPP_NUMBER`.
- The pledge and sponsorship emails (`src/lib/email.ts`) ask a bank-transfer donor to quote the
  reference but give no account or WhatsApp route. They gave no account before #281 either.
- The guard also misses `_` and U+2212 as separators (beyond its ceiling).
- The pre-filled WhatsApp text is built with `isMs` in the component, not the dictionary, and
  `BankTransferDetails` uses the untyped `t()` rather than `useTypedTranslation`, like its callers.
- `${SHELTER_WHATSAPP_URL}?text=...` is built inline in about eight places; a
  `shelterWhatsAppLink(text)` helper is its own refactor.
- README's donation section still promises LHDN/ROS tax receipts and exports (#239's scope).
- Once confirmed, the account prints before any pledge on `/donate` and the popup's general
  gift, as it did before #281, so a donor can transfer with no reference. Whether to hold it
  back until the reference exists, as the pet path does, is a choice for the fill-in PR. The
  radio hints there read `SHELTER_BANK_ACCOUNT` directly, so their confirmed wording has no test.
- A general account-number-shaped guard outside `shelterIdentity.ts` (like the `wa.me` one):
  no reliable shape for Malaysian account numbers that does not also match phone numbers and
  references.

**Settles when:** the real account is in `SHELTER_BANK_ACCOUNT`.
