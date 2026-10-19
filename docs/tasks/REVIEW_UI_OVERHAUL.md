# Review: UI overhaul — critique, technical audit and issue sweep

**Date:** 2026-10-20 · **Status:** findings only — no product code was changed
**Targets:** `feature/frontend` at `ace5a17` (the in-progress restyle) and `master` at `ade1869`
(the deployed line), each run as a clean snapshot with **no database**, so animals, bulletins and
figures came from the built-in demo fixtures. Public site only; `/admin` was not signed into.
**Method:** dual-agent impeccable critique (A: design review · B: detector + browser evidence), run
as two isolated subagents; impeccable `audit` (technical) folded into B; hallmark `audit` folded into
A; plus a sweep of all 51 open GitHub issues and both branches' ledgers. Tools: impeccable 4.6.0
(engine 0.1.15), hallmark 1.1.0.
**Verification:** claims marked *verified* were re-checked against git objects in this session;
measured numbers come from the assessors' runs in a browser at the stated viewport. Anything not
checked is marked UNVERIFIED.

---

## 1. Read first

- **The two branches split the honesty fixes and the layout.** `feature/frontend` carries the
  coherent page frame (`Section`/`SectionHeader`, `docs/page-style-guide.md`). Master carries the
  honesty and i18n fixes the restyle predates. **Merge rule: master's logic, `feature/frontend`'s
  layout.** Merging `feature/frontend`'s versions of the donation, bulletin and adoption components
  brings fixed defects back (§3, P0-1).
- **Blockers before a deploy of `feature/frontend`** (all *verified*):
  - `src/components/layout/Hero.tsx` loads `/cutouts/*.png`, which `.gitignore:59` (`*.png`)
    excludes — the hero is empty on every fresh clone and deploy. `Hero.tsx:24-26` itself says to
    replace the images "before this ships"; the rights to the current cut-outs are unconfirmed.
  - `src/app/impact/page.tsx` reads no data source and hard-codes "RM 182,400" raised, "86" active
    sponsorships, a per-category split and an RM 24,000 / 30,000 goal under "We publish these
    figures…". `/donate` shows a different allocation (45/30/20/5 vs 46/27/16/8/3). **Owner to
    confirm** whether any figure is real.
- **Logic defects the overhaul must not paint over** — tracked, independent of the visual work:
  #97 (an application can report success with no row written), #107 (saving the admin pet form
  wipes the medical timeline), #91 and #90 (sponsorship billing against archived or demo animals),
  the registration and tax-deductibility claims (`tasks/open/shelter-not-registered-tax-receipts.md`,
  on `feature/frontend` only), #124 ("100% Free Adoption" in 12 places while fees are free text).

## 2. Scores

| Lens | `feature/frontend` | master | Band |
|---|---|---|---|
| Nielsen heuristics (critique, all 10 apply — the site has forms) | ≈20/40 | ≈22/40 | Acceptable (site as a whole: **21/40**) |
| Technical audit health (5 dimensions × 4) | **11/20** | **12/20** | Acceptable |
| Hallmark anti-slop audit (both branches) | | | 5 critical · 8 major · 5 minor |
| Cognitive-load checklist | | | 5 of 8 fail — high |

Earlier run for comparison: the 2026-09-06 impeccable critique of the home page alone scored 24/32
(75%) with two heuristics n/a. This run scores the whole public site on all ten, so the two are not
like-for-like.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No `aria-current` or active nav state anywhere; ff's donation flow reports a "dispatched" receipt after the server fails |
| 2 | Match with the real world | 3 | Strong Malaysian fit (housing taxonomy, DuitNow, NRIC, BM); jargon leaks — TNRM in the home H1, "Vacuum Effect", "Malaysian Payment Rail", "weighted algorithm" |
| 3 | User control and freedom | 2 | Dialogs close on Esc and restore focus; "Apply to Foster" dead-ends; the default 404 and error pages offer no way back |
| 4 | Consistency and standards | 2 | ff 2, master 1: six panel radii, seven container widths, centred vs left titles, two WhatsApp numbers, five brand names |
| 5 | Error prevention | 1 | Pre-ticked consent (ff); "experienced" and "fully fenced" defaults (both); unadoptable animals selectable; the filter-bar Apply silently picks an animal |
| 6 | Recognition rather than recall | 2 | Bulletins and Needs missing from the desktop nav; nothing in browsing links to the profile page |
| 7 | Flexibility and efficiency | 2 | URL-synced filters (ff) and `/adopt?petId=` (master) help; no skip link |
| 8 | Aesthetic and minimalist design | 2 | Eyebrows and chips on every section, 3–5 actions per profile, mobile pages 10–15k px tall |
| 9 | Error recovery | 2 | Master's errors are plain-language but not bound to fields and focus does not move; bare 404; the foster empty state blames "your filters" |
| 10 | Help and documentation | 3 | Master's FAQ search and categories, the NRIC rationale, the quiz, the tracking page (ff's FAQ: 2) |

| Audit dimension | ff | master | Key finding |
|---|---|---|---|
| Accessibility | 2 | 2 | Button focus halo 1.40:1 (both); ff leaves `<html lang="en">` in BM; master `/pets` has no h1 |
| Performance | 2 | 3 | ff's LCP is a lazy-loaded hero cut-out with no preload; all of ff `/donate` is `'use client'` |
| Theming | 3 | 3 | Zero colour literals or arbitrary colour classes in TSX; dark mode intact apart from the pairs in §3 |
| Responsive | 2 | 2 | `/donate` overflows at 320–414 (both); master `/transparency` and `/get-involved` too |
| Implementation integrity | 2 | 2 | ff hero images untracked; master has no `Section` primitive (35 hand-rolled headings); #121 dropdown copy-pasted |

## 3. Priority issues

### Critique (design) — ranked

**[P0-1] `feature/frontend` reintroduces trust defects master already fixed** *(verified)*
- **What:**
  - `DonationWidget.tsx`: when the server action fails, the non-ok path and the catch both build a
    local receipt (≈200–205). The success screen then says "Your Donation Has Been Received" and
    "An official tax-exempt e-Receipt…" (238, 243).
  - The DuitNow QR is a hand-drawn `<svg>` (610), with no sample label anywhere in the file.
  - `BulletinFeed.tsx:108-118` gives every visitor a "Staff Admin Mode" toggle that edits and
    deletes in that browser only.
  - Master removed or labelled all three across `03bdf14`, `e16cb5d`, `d96b5d1` and `19e4b7c`
    (`DonationQrPanel.tsx:233`: "Sample image — no QR code has been configured yet.").
- **Why it matters:** a donor can leave holding a fabricated tax document at the riskiest moment of
  the journey.
- **Fix:** put ff's layout on master's `DonationWidget`, `DonationQrPanel` and `BulletinFeed`; never
  take ff's logic in those files. → `/impeccable harden`

**[P1-2] No single page frame, and the nav carries ten targets** — the owner's top priority
- **Content left edge at 1440:**
  - x128 on ff `Section` pages;
  - x80 on master's hero and ff `/needs`;
  - x49 on master `/pets`, `/faq` and `/bulletins` (no max width);
  - x192–336 on master `/donate`, `/transparency`, `/track`, `/adopt` and `/get-involved`;
  - x320 on the legal pages.
- **The chrome sits on yet another column:** the nav starts at x40 and the footer at x48.
- **Sizes drift:**
  - H1 sizes run 60/48/36/30.
  - H2 sizes run 48/30/24/20/14/12.
  - ff `/bulletins` sets an H1 at 36px under an H2 at 48px.
  - master `/sponsor/login` puts an H2 above its H1.
  - ff's home has 0px header-to-content gaps (`HomeSections.tsx:113, 235`).
- **Navigation:**
  - The desktop header has 10 targets and the ff mobile menu has 11.
  - Impact is desktop-only; Bulletins and Sponsor are mobile-only.
  - The desktop Sponsor button is commented out (`Navbar.tsx:219-227`).
- **Fix:** see §4's twelve standardisation rules. → `/impeccable layout`, then `/impeccable distill`
  for the nav

**[P1-3] Mobile overflow and clipped calls to action** *(measured)*
- **`/donate` (both):**
  - The CTA label "COMPLETE DONATION PLEDGE & GENERATE E-RECEIPT — RM 50" is 354px of
    `whitespace-nowrap` text in a 218px button.
  - Page `scrollWidth` is 405 / 432 / 452 px at 320 / 375 / 414, so a phone zooms the whole page
    out.
  - "COPY BANK ACCOUNT" and "MEET OUR ADOPTABLE ANIMALS" also overflow at 320.
- **master `/transparency`:** lays out at a 513px viewport at 320–414. The cause is an
  `overflow-x-auto` wrapper that is not `relative` (`FinancialReportsTable.tsx:37`), so the absolute
  `sr-only` spans (`:97`) escape its clip.
- **master `/get-involved`:** 399px wide at 320/375.
- **Desktop:** master's card "APPLY TO ADOPT" is clipped even at 1280 (135px of text in a 111px
  button); ff fixed this one.
- **Root cause:** `src/components/ui/button.tsx:7` on both branches (*verified*):
  `whitespace-nowrap uppercase tracking-widest`.
- **Fix:** let button labels wrap below `sm`, shorten them ("Pledge RM 50"), wrap tables in a
  `relative` overflow box, and put `overflow-x: clip` on the root. → `/impeccable adapt`

**[P1-4] The adoption form steers and pre-consents** *(verified for the defaults)*
- **Defaults** (`useAdoptionFormController.ts`):
  - ff pre-ticks consent: `agreeToTerms: true` at :69. Master fixed only this, to `false` at :136.
  - Both still default `householdExperience: "experienced"` and `hasFencedYard: "yes"`.
- **Animal choice:**
  - The select lists Pending and In-Rehab animals (#99).
  - The filter-bar Apply preselects `filteredPets[0]` (`PetGallery.tsx:333`).
- **Phones:** at 375, ff's dialog content is 459px wide inside a 343px dialog
  (`ui/dialog.tsx:56` grid without `minmax(0,1fr)`), so the title, labels and submit are clipped.
- **Fix:**
  - Use master's page wizard.
  - Start every choice on an empty "Choose…" with required validation.
  - List adoptable animals only.
  - Give the dialog grid `grid-cols-[minmax(0,1fr)]`.
  - → `/impeccable harden`, `/impeccable adapt`

**[P1-5] `feature/frontend` breaks bilingual parity** *(measured)*
- **`lang` never follows the language:** with Malay chosen, reloading ff `/faq` renders "Soalan
  Lazim", but `document.documentElement.lang` stays `"en"` and React logs a hydration mismatch.
  - ff reads `localStorage` inside the `useState` initialiser and writes `lang` only on toggle
    (`LanguageProvider.tsx:25-37, 45`).
  - Master's provider (`useSyncExternalStore` plus an effect, ≈109–121) gets this right.
- **English left on the Malay site:** the ff hero H1 (`Hero.tsx:61-63`), the home section titles
  (`app/page.tsx:32-33, 52-53`), the bulletin chrome, and all of `/impact` and `/get-involved`.
- **Fix:** take master's provider, then add a BM render test per public route. → `/impeccable harden`

### Audit (technical) — the rest, by severity

| Sev | Issue | Where | Fix · command |
|---|---|---|---|
| P1 | **Keyboard focus invisible on every Button.** `outline-none` + `ring-ring/30` measures 1.40:1 against card and page; the 1px border-ring is 1.32:1 on filled buttons. The global 2px outline (3.3–3.5:1) that links and cards get is opted out of. WCAG 1.4.11 / 2.4.7 | `ui/button.tsx:7` (both, *verified*) | Solid ring ≥3:1 with offset · `/impeccable harden` |
| P1 | **AA text-contrast failures, both themes:** white on WhatsApp green 1.98:1; `text-success-accent` on card 3.6:1 (12 uses ff, 22 master); `text-primary` on `work-ground` 4.3:1 (every eyebrow inside an ff `Section`); primary on tinted washes 3.42–4.45:1; dark `#d17469` on `work-panel` 4.48:1; master "100% Free Adoption" badge 4.3:1, opacity-modified counters 3.53–3.58:1, `/transparency` chart labels 2.82–4.42:1, dark receipt warning 1.45:1. WCAG 1.4.3 | listed in the audit run | Carry the list into the palette redo; add every pair to the guard · `/impeccable colorize` |
| P1 | **The guard suite is green while those pairs fail:** 105/105 (ff) and 99/99 (master) pass, because `designSystemGuards.test.ts:471-485` declares 13 brand pairs plus tone pairs and none of the failing ones (`work-*` grounds, washes, `success-accent` as text, `brand-whatsapp`, `brand-duitnow`, `expense-*`, receipt paper in dark, `ring/30`) | `tests/unit/designSystemGuards.test.ts` | Extend the pair list before the colour work, so the redo is measured | 
| P1 | ff hero: LCP is a lazy cut-out (`dog-png-2.png`) with no `preload`/`sizes`; 320px sources rendered up to 252 CSS px | `Hero.tsx:55` | Preload the LCP image, ship 2× sources · `/impeccable optimize` |
| P2 | Forms: placeholder-only inputs (custom amount, `/needs` search); adoption errors are bare `<p>` with no `aria-invalid`/`aria-describedby`; required marked by "*" only (0 `required` across 12 controls); ff has 0 live regions (master 6); no `autocomplete`/`type=tel` | `DonationWidget.tsx:523` ff, `RehabNeedsSection.tsx:143`, `AdoptionForm.tsx:114-185` | `/impeccable harden` |
| P2 | Structure: master `/pets` has no h1 (h2 at `PetGallery.tsx:106`); h1→h3 skips on 5 ff and 6 master routes (the footer's "QUICK LINKS" h3); nested `<main>` in `needs/page.tsx:21`, `get-involved/page.tsx:39`, master `account/notifications/page.tsx:14` | as listed | `/impeccable harden` |
| P2 | #121 reproduced on both: clicking a hover-opened menu closes it; a keyboard-opened menu stays open after Tab leaves; the two dropdown blocks are copy-pasted | `Navbar.tsx:92/101` ff, `:149/158` master | One disclosure component · `/impeccable harden` |
| P2 | Touch targets: EN/BM toggles 32×20 and 35×20, adjacent; theme toggle 52×28; menu 36×36; footer links 18px tall; up to 35 (ff `/pets`) and 48 (master `/pets`) targets under 44px. WCAG 2.5.8 | header, footer | `/impeccable adapt` |
| P2 | 10–11px functional text: `text-3xs` used 52× (ff) / 73× (master), `text-2xs` 60× / 75× | site-wide | `/impeccable typeset` |
| P2 | No `error.tsx` or `not-found.tsx` on either branch: master `/sponsors` without a database renders a bare "This page couldn't load" with no header; a shared link to an adopted animal lands on the unbranded Next 404 | `src/app` | Branded error and 404 pages that keep the nav · `/impeccable harden` |
| P2 | Page titles: generic on ff `/donate` (whole-page client component, cannot export metadata), `/impact`, `/applications/track`; empty on master `/sponsors`; brand suffix drifts ("UM" / "(Petaling Jaya)" / "Selangor"); never localised | per route | `/impeccable clarify` |
| P2 | `/pets/[id]` is orphaned: cards open `PetDetailDialog` (220 lines), which duplicates `PetDetailView` (680 lines); the profile route has JSON-LD and OG tags but only the track page links to it | `features/pets/` | Make "Details" the page · `/impeccable distill` |
| P3 | Reduced motion: 0 `motion-reduce` variants and 0 `prefers-reduced-motion` rules in app code; `animate-bounce` loader (the detector's one advisory), smooth-scroll carousel, master's FAQ animates `height`; `transition-all` ×27 / ×32 | site-wide | `/impeccable animate` |
| P3 | No skip link; no `aria-current`; deprecated `priority` prop (Next 16 uses `preload`); `dark-glow` on primary buttons in dark; "© 2024" | as listed | `/impeccable polish` |

### Where the two assessments agree, and where the detector is wrong

- **Agree:** card-in-card (A, critical) matches the detector's `nested-cards` true positives — GOAL
  PROGRESS (`rounded-2xl` inside a `rounded-3xl` panel) and the rehab boxes inside pet cards. Both
  found the overflow, the contrast failures, the `lang` defect, #121, the heading skips, the hero.
- **Only the detector caught:** the 1.40:1 focus halo, the `/transparency` `sr-only` escape, the
  touch-target counts, the absence of reduced-motion handling, the deprecated `priority` prop.
- **Only the design review caught:** the fabricated receipt and figures, the pre-ticked consent,
  the nav overload, the template rhythm, the orphaned profile route, the emotional journey.
- **False positives:** every `text-occlusion` finding (the overlay flagging its own labels); the
  `nested-cards` hits on full-bleed `Section` bands, which have radius 0; `overused-font` (Geist,
  71–88%) is taste, not a defect; `side-tab` sits in the HTML email template, not the site.
- **Detector counts** (browser overlay, light, 1280): ff 201 findings over 13 routes (15.5/route),
  master 292 over 15 (19.5/route); the CLI scan of `src/` found only `bounce-easing` (`RehabNeedsSection.tsx:155`)
  and the email `side-tab`, because on TSX it is regex-only.

## 4. Structure — the owner's priority

The verdict: **the chrome and composition could belong to any nonprofit; the content could not.**
Product character lives in the medical timeline, rehab stage and recovery %, the compatibility grid,
the landed/high-rise housing taxonomy, TNRM and ear-notching, campus feeders and BM. ff's home is
less templated than master's (editorial rows, bento, rule list) but keeps the full-viewport centred
hero, the five-link nav and the four-column footer. Master's home is the AI template end to end:
split hero + stat strip → 3 pillars → 4 icon tiles → 2 bulletins → 4 pets → 3 steps → footer.

**Per route, which branch is the better base**

| Route | Stronger | Why |
|---|---|---|
| `/` | ff | one frame (py80, content x128, H2 48) vs master's hero at x80 and sections at x128 |
| `/pets` | ff | ff has an H1 and a 1280 frame; master has no H1, full bleed at x49, 14 controls |
| `/pets/[id]` | ff (slightly) | fewer competing calls to action; master adds tier upsell panels |
| `/adoption` · `/adopt` | **master** | master's 4-step wizard page with unticked consent fits phones; ff's form is a modal clipped at 375 |
| `/applications/track` | ff | left-aligned H1 inside the frame vs master's centred H1 36 with eyebrow |
| `/bulletins` | **master** | heading order and trust (no public "Staff Admin Access"), translated |
| `/donate` | **master** | honesty: pledge, not receipt; labelled sample QR |
| `/faq` | **master** | search, 8 categories, 20 questions vs 9 flat items |
| `/get-involved` | ff | one frame vs master's three left edges (x208/180/153) |
| `/impact` · `/transparency` | **master** | data-driven with a "development sample data" banner, vs invented and undisclosed figures |
| `/needs`, `/privacy`, `/terms` | tie | same layout, same defects |

**Twelve rules the overhaul should standardise** (from the inventory at 1440 px)

1. One content edge, with the nav and footer on the same column.
2. Two widths only: the frame (1280) and a prose measure (≈68ch) — the style guide's full-width
   leads run 115–150 characters per line today.
3. One `PageHeader`: H1 = the page's nav label, left-aligned, one size ramp; never a slogan, never
   missing, never after an H2.
4. Fixed H2 and H3 sizes; no 12–14px "headings".
5. One panel radius plus one inner step (today 15/18/22/26/33/40 px).
6. One rhythm: py80 sections, page top 80, header-to-content 48.
7. One page background.
8. No heading-level skips.
9. One `<main>`.
10. No eyebrow labels.
11. A button shell that can wrap and is not forced uppercase.
12. The same destinations in the desktop and mobile nav.

## 5. People and the journey

- **"I want to adopt a cat":** the home H1 is a policy statement, not an invitation, and none of
  the hero's eight cut-outs is an adoptable animal → at 375, 662px (ff) / 764px (master) of controls
  sit above the first photo on `/pets` → the peak is the profile (vet-verified timeline,
  compatibility grid, "Free (RM 0)"), but it lives in a modal with no shareable URL → applying is
  one long clipped modal with consent pre-ticked (ff) or a reassuring wizard that explains the NRIC
  (master) → after submitting, ff gives a reference ID and a track link (good) → a shared link to
  an adopted animal ends on a bare 404.
- **First-timer:** TNRM unexplained in the H1; no nav state on `/pets`; "Apply to Foster" →
  `/pets?type=foster` → "No animals match your search filters".
- **Phone user:** 24 targets under 44px on the ff home; the adoption dialog clipped; `/donate`
  drags sideways; pages run to 10,148px (ff home) and 14,883px (master `/pets`).
- **Stress tester:** a failed donation still shows "Received"; Tuah (In Rehabilitation) is
  selectable; master `/sponsors` has no error boundary; two WhatsApp numbers.
- **Screen-reader user:** no skip link before a 10-target header; FAQ puts an `h3` inside a
  `button` with no `aria-controls` (`FaqSection.tsx:76-94`); quiz tiles lack radio semantics; Malay
  pages announced as English on ff.

## 6. Hallmark punch list (both branches)

- **Critical (5):** the structural template (master `HomeSections.tsx:183, 291, 390`); the
  full-viewport centred hero with unlinked stock cut-outs (`Hero.tsx:43`); invented metrics and
  fabricated official artefacts (`impact/page.tsx:6-35`, `donate/page.tsx:186-188`, the receipt at
  `DonationWidget.tsx:250-369`); card-in-card (`PetChooserCarousel.tsx:106, 113`); the AI nav
  (`Navbar.tsx:70-242`).
- **Major (8):** an eyebrow on every section; icon-tile cards; emoji as icons (`Navbar.tsx:300-347`,
  `AdoptionForm.tsx:85`); overflowing or two-line clickable text (`button.tsx:7`); `transition-all`
  on every button; centred-everything heads on master (`DonatePageView.tsx:140`,
  `TransparencyPageView.tsx:82`, `adopt/page.tsx:34`); re-drawn document chrome (the paper receipt,
  the drawn QR); the four-column footer.
- **Minor (5):** straight quotes ('Vacuum Effect'); three dots for an ellipsis; a pure-white panel
  (leave for the palette pass); identical padding on every section; the stale footer year.

## 7. What to keep

- ff's frame: `Section`/`SectionHeader` (`Section.tsx:18-44`) and `docs/page-style-guide.md` — the
  first coherent frame on either branch.
- The content model to build around: medical timeline, rehab progress, compatibility grid, housing
  taxonomy, needs with specs.
- Master's honesty and i18n: pledge-not-receipt (`DonationWidget.tsx:280-292`), the labelled sample
  QR, the "development sample data" banner, the read-only bulletin feed, full BM with `lang` set.
- Token discipline on both: 0 colour literals and 0 arbitrary colour classes in TSX; tone pairs at
  6.8–14:1 light and 8.7–13:1 dark; every image through `next/image` on ff; home CLS 0; base-ui
  dialogs trap and return focus correctly.

## 8. Issues and ledger, mapped to the overhaul

51 open GitHub issues and 50 ledger files (45 on master, 10 on `feature/frontend`, 5 on both) were
read. **34 bear on the UI.** Fix type: **Ovh** — the overhaul fixes it as a side effect of
rebuilding markup or copy · **Logic** — needs data or logic work alongside · **Indep** — independent.

### Must not be painted over (P0)

| Item | Visible symptom | Fix type |
|---|---|---|
| #97 | Applicant sees "success" and a reference while the record is lost on a database failure | Indep |
| #107 | Saving the admin pet form deletes that animal's medical timeline and progress updates | Logic — before any rework of the form |
| #91 | Sponsorship checkout takes pledges for archived animals | Logic + refusal copy |
| #90 | During an outage, `/pets/pet-001` shows the demo animal "Bella" and checkout bills against it (reasoned, not reproduced) | Logic + a degraded state |
| #124 | "100% Free Adoption" in 12 places while each pet's fee is free text | Ovh once the shelter states its policy |
| `shelter-not-registered-tax-receipts` (ff only) | Site claims ROS registration and s.44(6) deductibility the shelter probably lacks | Copy fixed on ff (`1e79254`); master's #109 extended receipts — the merge decides. Master `TransparencyPageView.tsx:235-236` still promises an "instant" LHDN e-Receipt (*verified*) |
| `/impact` figures (new) | Hard-coded money figures presented as published fact (§1) | **Owner to confirm** |
| Hero cut-outs | Untracked images; broken hero on deploy (§1) | Commit images with confirmed rights |

### By theme (P1–P2)

- **Navigation:** #121 (P1); #122 five of seven shared links labelled differently in nav and
  footer, `/pets` has five labels (P2).
- **Pets:** #54 every filter keystroke is a server navigation (P1); #98 an unknown status reads as
  Available (P1); #53, #55, #57 URL-state edge cases and tests (P2); #62 gender labels; #64
  structured-data price (P0 once a fee has a price); #105 estimated birth date never shown; #126
  legacy ages misparsed.
- **Adoption:** #99 (P1); #96 stale pet id on reopen (P2); the applicant's email in the tracking
  URL query string — new, P2 privacy (ff `AdoptionForm.tsx`; also `ApplicationDetailDialog.tsx`
  and `lib/email.ts` on both).
- **Donations and transparency:** #132 the instant-receipt promise (P1); #133 receipt dating across
  the tax year (P1 before December); #50 donor labels show "* *"; #70 sponsor portal gaps.
- **Bulletins:** #120 Malay text stored, never shown (P1) — ff's restyled feed is built on the
  client store master removed in #103; #115 bylines; #116 stale pinned notices.
- **Malay:** #125 seventeen missing keys, sixteen in the wizard (P1); #49 ages in English (P1); #123
  served HTML always `lang="en"` (P1, a routing decision); #122 home copy outside the dictionary.
- **Admin (not visually audited):** #130 every role lands on Pet Management (P1); #131 role dead
  ends (P1); #58 no control records the home visit (P1); #111 born-at-shelter animals cannot be
  entered (P1); #65 empty table vs outage (P2). ff has 6 admin pages, untouched by the restyle;
  master has 12, with `TransparencyEditor.tsx` at 1,226 lines.

### The branches disagree on the site map

| Concern | `feature/frontend` | master |
|---|---|---|
| Foster | Under "Adopt & Foster": `/adoption` + adopt/foster filter on `/pets` | `/get-involved#foster` |
| How adoption works | `/adoption` page | `/#how-it-works` + multi-step `/adopt` |
| Money reporting | `/impact` in the nav (hard-coded) | `/transparency` (data-driven) in the footer only |
| Sponsorship | "Donate & Sponsor" → `/donate` | `/sponsors` + portal (`/sponsor/login`, `/dashboard`, `/certificate`) |

### Rules the overhaul inherits until deliberately replaced

- `tests/unit/designSystemGuards.test.ts` fails `npm test` on raw palette classes, hex values,
  arbitrary type/radius/shadow values, undeclared classes, or a token missing from a theme.
- Seven meaning-based colour tones; status→tone mapping in `lib/presentation/`; colour never the
  only signal; WCAG AA in both themes.
- ff's `docs/page-style-guide.md`: full-bleed `Section` bands, `py-16 sm:py-20`, `max-w-7xl`,
  gutter `px-6 sm:px-8 lg:px-12`, one H1 per page, left-aligned except the home hero.
- Already in conflict inside the system: the guide's panel (`rounded-3xl border bg-work-panel`) vs
  `ui/card.tsx` (`rounded-card ring-1`); the two copies of `design-system.md` disagree on fonts and
  H1 size.

## 9. Decisions needed from the owner

**Decided 2026-10-20** (`tasks/decisions/2026-10-20-merged-site-map-and-impact-page.md`):
- **1:** structure now, visuals later.
- **2:** the figures are placeholders — drop `/impact` and keep master's `/transparency`.
- **3:** `feature/frontend`'s Adopt & Foster grouping, on master's `/adopt`, `/transparency` and
  `/sponsors`.

- **4:** admin is in scope.
- **5:** not a campus society — drop "UM" from the wordmark.
- **6:** no rights to the hero cut-outs — replace them.

1. **Refine or redesign?** Keep the current look and standardise the frame (§4), or replace the
   visual world. The critique's evidence: composition is generic, content is specific.
2. **Are the `/impact` figures real?** If not: label them as sample data or drop `/impact` for
   master's `/transparency`.
3. **Site map** for the merged site (§8 table): where foster, the adoption process, money reporting
   and sponsorship live.
4. **Scope:** public site only, or admin too. Admin has four P1 issues and was not part of the
   restyle plan.
5. **Brand:** a UM campus society or a Petaling Jaya sanctuary? The wordmark says "UM", the footer
   says "PJ since 2016"; brand names drift five ways.
6. **Hero cut-outs:** commit them (rights?) or replace them with named, linked shelter animals.

## 10. Recommended sequence

1. Land the merge with **master's logic and ff's layout**, aborting the stale paused rebase in the
   main checkout first (owner's call).
2. `/impeccable init` — no `PRODUCT.md` exists; it captures audience, brand and voice, and answers
   decision 5. Impeccable requires it before any redesign flow.
3. `/impeccable layout` — the one page frame and `PageHeader` (§4 rules 1–9).
4. `/impeccable distill` — the nav down to the core destinations plus Adopt; the profile page
   instead of the modal; eyebrows out.
5. `/impeccable harden` — focus ring, forms (consent, defaults, labels, live regions), `lang`,
   error and 404 pages, heading and `<main>` structure.
6. `/impeccable adapt` — overflow, wrapping buttons, touch targets.
7. `/impeccable clarify` — invented figures, jargon in the H1, page titles, brand-name drift.
8. Later, with the palette redo: extend the guard's pair list first, then `/impeccable colorize`,
   `/impeccable typeset` (the 10–11px text), and `/impeccable polish` last. Use hallmark's `audit`
   as a second-opinion anti-slop gate on the result.

## 11. Session record

- **Tools:** impeccable 4.2.1 → 4.6.0 at `~/.claude/skills/impeccable`, hook moved to this
  checkout's `.claude/settings.local.json` —
  `tasks/decisions/2026-10-19-impeccable-hook-is-project-local.md`. Hallmark 1.1.0 was already
  current.
- **Not done, deliberately:** no product code changed; nothing committed — the main checkout is
  paused mid-rebase, where a commit would join the rebase and an abort would discard edits to
  tracked files, so `tasks/todo.md` has no stream for this session; this document and the ledger
  files are untracked and need carrying onto the branch after the merge. `/admin` was not signed
  into; no screen reader, real touch device, 200% zoom or forced-colours run.
- **Shared with the merge session** (`Rebase and merge conflict resolution`): the coordination
  facts, the site-map decisions, and the master-logic rule for `DonationWidget`, `DonationQrPanel`,
  `BulletinFeed` and `useAdoptionFormController`.
