# Production FAQs still need the edits `feature/frontend` made to the fixture

**Status:** open · opened 2026-10-20

`feature/frontend` changed FAQ content by editing `src/data/faqs.json`: it moved the `/donate`
page's inline FAQ into the catalogue (as faq-021 to faq-025 after the rebase, renumbered because
master already uses faq-009 to faq-013 for adoption questions) and deleted the tax-deductibility
questions (faq-005 and the three moved tax FAQs). Since
`tasks/decisions/2026-09-03-faq-cms-replaces-the-json-catalog.md`, that file only seeds a fresh
database and backs an outage. **The live `/faq` reads the database**, so on production:

- faq-005 ("Is my donation tax-deductible…") is still published, claiming Section 44(6) approval;
- the DuitNow and drop-off questions (fixture faq-024, faq-025) are not on `/faq`, and the
  `/donate` page no longer shows them inline.

**Settles when:** staff have unpublished faq-005 and added the DuitNow and drop-off questions at
`/admin/faqs` (or `npm run db:migrate:faqs` has been run deliberately against production), checked
by reading `/faq` on the live site.
