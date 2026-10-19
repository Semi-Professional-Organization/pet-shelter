# The merged site groups Adopt & Foster on master's pages, drops `/impact`, and restructures before restyling

**Decided:** 2026-10-20

The owner answered three questions raised by `docs/tasks/REVIEW_UI_OVERHAUL.md`:

1. **Structure now, visuals later.**
   - The overhaul first gives every public page one frame and settles the site map (the review's
     §4 rules).
   - Colour and type are redone afterwards, starting from `/impeccable init`.
2. **`/impact` goes; `/transparency` stays.**
   - `feature/frontend`'s `src/app/impact/page.tsx` hard-coded money figures ("RM 182,400" raised,
     "86" active sponsorships) with no data source. The owner confirmed they are placeholders.
   - Master's data-driven `/transparency`, which already labels sample data, replaces it.
3. **`feature/frontend`'s grouping on master's pages.**
   - The "Adopt & Foster" nav group and the `/adoption` explainer stay, as decided on
     `feature/frontend` around 2026-10-01.
   - Master's multi-step `/adopt` wizard, `/transparency` and `/sponsors` portal are kept.

Why: master carries the honesty and i18n fixes (pledge-not-receipt, labelled sample QR, a correct
`lang`), and `feature/frontend` carries the coherent page frame and the owner's adopt/foster
decisions. Taking each branch's strength avoids merging `feature/frontend`'s older component logic.

Three more answers the same day:

4. **Admin is in scope.**
   - The overhaul covers the 12 admin pages as well as the public site.
   - #107 must be fixed before the admin pet form is reworked: saving that form deletes the
     animal's medical timeline.
5. **The organisation is not a campus society.**
   - The "UM" in the wordmark and any campus-society framing are wrong.
   - What the first screen leads with otherwise is settled through `/impeccable init`.
6. **The hero cut-outs cannot ship.**
   - The owner has no rights to the PNGs in `public/cutouts/` that `feature/frontend`'s `Hero.tsx`
     loads.
   - They stay out of git and get replaced. One option from the review: named, linked shelter
     animals photographed by the shelter.
