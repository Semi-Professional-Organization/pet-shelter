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

**Settles when:** the real account is in `SHELTER_BANK_ACCOUNT`.
