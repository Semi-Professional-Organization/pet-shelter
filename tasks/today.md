# Today — 2 Oct 2026

Style reference: `docs/page-style-guide.md`. Plan: `tasks/ui-checklist.md`. Focus is still
**structure** (where things sit), not colour.

## New info

**Foster uses the same process as adoption** (stakeholder, 2 Oct). Foster moves out of Get Involved
into one **Adopt & Foster** path, with **one explicit point where the visitor chooses adopt or
foster** and branches from there. Decision: `tasks/decisions/2026-10-02-foster-uses-the-adoption-process.md`.

## 1. Adopt & Foster — structure (UI only, no data change) — done

- [x] `/adoption` is **Adopt or Foster**: H1 + a two-card choice (Adopt · Foster → `#adopt`,
      `#foster`), each branch with its own CTA, then the shared 3 steps (copy now covers both),
      standards, and "Already applied? → Track"
- [x] Foster content moved from Get Involved into the foster branch (bilingual now — **Malay is my
      translation, needs a native read**); foster CTA stays WhatsApp (no foster form until §2)
- [x] Navbar **Adopt & Foster** dropdown: Meet Our Animals · Adopt or Foster · Track Application
      Status; mobile menu gained an Adopt or Foster link; Get Involved has no Foster
- [x] Footer: "Adopt or Foster" (→ `/adoption`) and "Volunteer" (→ `/get-involved#volunteer`) —
      one Adopt or Foster link instead of a separate Foster link, since the page holds both
- [x] **Simplified (user review):** branch sections and choice cards removed; the page is now
      intro → 3 steps → **Apply to Adopt** (→ `/pets`) / **Apply to Foster** (WhatsApp) → track link.
      Standards section dropped from `/adoption` (vet protocol and free policy are already in the
      profile and step 3); home-suitability check moved into step 1, take-back safety net into step 3.
      Standards still renders on home.
- [ ] **Next flow (user's direction):** process info → application (adopt or foster) → choose the
      animal inside the application; pet pages keep "Apply" with the animal preselected. Needs a
      standalone `/apply` and the type field (§2). Open questions: one animal or several per
      application? do fosterers choose the animal? allow "no preference"?

## 2. Adopt & Foster — data (GRAVE, `midwife` lane, plan before building)

`AdoptionApplication` has **no type field**, so a foster application can't be stored as one.

- [ ] Add application type (adopt | foster) to `prisma/schema.prisma` + migration; existing rows = adopt
- [ ] Application form: "I want to adopt / foster", preset by whichever branch or button the
      visitor came from
- [ ] Admin applications list + detail show and filter by type; tracking page shows it
- [ ] Emails and status copy say "foster" where it applies

## Questions for the shelter

- [ ] **Does a fosterer pick a specific animal, or does the shelter assign one?** Decides whether
      the foster branch goes through `/pets` or straight to the form.
- [ ] Is "not registered" confirmed? Has the live site ever issued a tax receipt? (step 2 of
      `tasks/open/shelter-not-registered-tax-receipts.md`)
- [ ] Volunteer shift days/times, orientation needed? Event group size, participation certificate?
- [ ] Adopter (and fosterer) criteria — for the Adopt or Foster page
- [ ] Real bank details: account number and account holder name

## Carried from 1 Oct

- [ ] Browser check — light/dark, 400px, Malay: impact, faq, adoption, applications/track, donate,
      get-involved
- [x] **Committed 1 Oct's work** — `b0778f0` docs · `6d7c159` guard · `461319c` /adoption ·
      `871fbf0` page restructure · `1e79254` registration/tax claims (own commit)
- [ ] Fix the home `Section` spacing bug in `HomeSections.tsx`
- [ ] Convert remaining pages: needs, bulletins, privacy/terms, pets + FAQ, `pets/[id]`
- [ ] Decide: wishlist on `/needs` only, or both pages
- [ ] Decide: standards on home, `/adoption`, or both — then rename `HomeProcessSection`
- [ ] Get-involved and impact pages have no Malay — add translations
- [ ] Hero: drop the dead CTA overrides
- [ ] `npx prisma generate`; install `jsdom` so component tests run
- [ ] Later (styling pass): reconcile `ui/card` vs panel; a `whatsapp` button variant

## Found while checking

(write here)

---

## Yesterday — 1 Oct 2026 (committed `b0778f0`..`1e79254`; delete this log when no longer useful)

Previous note (23 Sep) is in git history. Full plan: `tasks/ui-checklist.md`. Style reference for
every page: `docs/page-style-guide.md`. Focus right now is **structure** (where things sit), not
colour — styling gets redone later.

### Done

- [x] **Page style guide** — `docs/page-style-guide.md`, read from the home page: frame, gutters,
      rhythm, type scale, panel card, CTAs. Linked from `docs/README.md`; corrected the stale font
      section in `docs/design-system.md` §4.
- [x] **Rules settled today** (all in the guide): only the hero is centred, every other title is
      left-aligned · no small label above a page H1 · titles, text and cards all span the full
      container width (only the home hero is capped).
- [x] **Pages converted to the guide:** `impact`, `faq`, `applications/track`, `donate` (+ the
      `DonationWidget` outer frame).
- [x] **Small labels removed** above the H1 on 8 pages (impact, faq, donate, get-involved, needs,
      applications/track, privacy, terms).
- [x] **New `/adoption` page** — process steps + standards + CTA. Navbar "Adoption Process &
      Criteria" and footer link there; footer "Volunteer & Foster Care" → `/get-involved#volunteer`.
      Both old links pointed at home sections removed in `1137d3e`.
- [x] **Navbar dropdowns** show page names only (no description, no icon).
- [x] **H1 = page name** (rule in the guide §3): Donate & Sponsor, Our Impact, Get Involved, Track
      Application Status; old headlines moved into the lead paragraph.
- [x] **Get Involved restructured + on the guide:** Volunteer (routine cleaning + feeding; choose cat area, dog area or both) ·
      Volunteer Events (occasional: painting, building; individuals and groups — absorbed the CSR
      section) · Foster (content unchanged, pending) · Partners (vets, universities, company
      sponsorship). Placeholder cards (dog walking, grooming, vet transport) removed. Navbar
      dropdown matches.
- [x] **Registration / tax claims removed from public pages** (step 1) — the shelter is probably
      not a registered society: ROS number, LHDN 44(6) and "Persatuan/Pertubuhan" naming gone from
      donate, home, footer, navbar, get-involved, terms, privacy, donation form copy, 4 FAQs and
      the translation strings. Step 2 (the tax-receipt feature) is open:
      `tasks/open/shelter-not-registered-tax-receipts.md`.
- [x] **Design-system guard green (20/20)** — `--background` back to `#fff8f4`, `text-[11px]` →
      `text-2xs` in `PetGallery`.

### Notes

- **Waiting on stakeholder:** is the foster process the same as adoption? → **answered 2 Oct: yes** —
  `tasks/decisions/2026-10-02-foster-uses-the-adoption-process.md`.
- **Nothing was looked at in a browser today, and nothing is committed.**
- `<Section className="space-y-…">` spaces nothing (class lands on the outer `<section>`). Home's
  "Our Work" and "Join us" are probably missing their header gap.
- Two card systems: `ui/card.tsx` (`rounded-card` + ring) vs home panel (`rounded-3xl` + border).
  Pages follow the panel for now.
- Wishlist exists twice: static list on `/donate`, catalog-driven on `/needs`.
- Standards section now renders on home **and** `/adoption`; `HomeProcessSection` is only used by
  `/adoption`, so its `Home*` name is wrong.
- No real adopter criteria exist anywhere (age, landlord consent, …) — needs shelter input.
- Hero CTA: `text-sm font-bold tracking-wide px-6` overrides are dead (guide §8.1).
- Environment, not our code: stale Prisma client fails 4 unit files (`npx prisma generate`);
  `jsdom` missing so component tests can't start; `@playwright/test` missing for e2e.
- Obsidian REST API (`127.0.0.1:27124`) was not reachable, so this note lives here.

### Todo

- [ ] Browser check of today's pages — light/dark, 400px, Malay: impact, faq, adoption,
      applications/track (needs a real reference ID), donate
- [ ] Commit today's work (`atomic-commit`)
- [ ] Fix the home `Section` spacing bug in `HomeSections.tsx`
- [ ] Convert remaining pages: get-involved, needs, bulletins, privacy/terms, pets + FAQ, `pets/[id]`
- [ ] Decide: wishlist on `/needs` only, or both pages
- [ ] Decide: standards on home, `/adoption`, or both — then rename `HomeProcessSection`
- [ ] Place Foster in the nav once the stakeholder answers
- [ ] Ask the stakeholder: is "not registered" confirmed? has the live site ever issued a tax
      receipt? Then plan step 2 (remove the receipt feature: ledger, emails, exports, IC field)
- [ ] Confirm with the shelter before re-adding (dropped as unverified): event group size
      "8 to 25", "participation certificate", volunteer shift days/times, orientation needed?
- [ ] Get-involved and impact pages have no Malay — add translations
- [ ] Real bank details: the account number `5140 1234 5678` is a placeholder, and the account
      holder name must match the real account
- [ ] Get adopter criteria from the shelter → section on `/adoption`
- [ ] Hero: drop the dead CTA overrides
- [ ] `npx prisma generate`; install `jsdom` so component tests run
- [ ] Later (styling pass): reconcile `ui/card` vs panel; a `whatsapp` button variant

### Found while checking

(write here)
