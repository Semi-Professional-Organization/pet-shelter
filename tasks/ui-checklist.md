# UI checklist: bring every page in line with the home page

Branch `feature/frontend`. Work stream, not ledger. Tick items as they land; delete the file when done.

## Plan to 30 Sep (5 evenings, ~2h each)

Deadline 30 Sep, 8 days, 3 of them unavailable → **5 working evenings, ~10 hours total**.
Everything below §2 does not fit in 10 hours, so it is cut into MUST and LATER.

**MUST (the deadline):** every public page uses `Section` / `SectionHeader`, the home ground and
card style, one container width, one card radius. Style only.
**LATER (after 30 Sep):** copy trimming (§4), Malay for the new strings, skeleton loaders,
`applications/track`, admin pages.

| Evening | Scope | Why it fits |
|---|---|---|
| 1 — today | Commit what is already done; finish the home page leftovers | Small, and the tree is dirty with 7 files |
| 2 | `needs` + `get-involved` | Both only need hero ground, h1 and card radius |
| 3 | `donate` + `impact` | More cards and an inline `style` to remove |
| 4 | `bulletins` + `privacy`/`terms` + pets FAQ | Mostly wrapper swaps |
| 5 | `pets/[id]`, then §6 verification and commits | Leave the whole evening — the check always finds work |

If an evening runs out of time, stop and move the rest into the next one. Losing evening 5 costs
the verification pass, so do not let §6 slide past it.

## Today (evening 1, ~2h): land what exists, close the home page

- [ ] **First, commit** (30 min). 7 modified files are uncommitted. Use `atomic-commit`, keep
      `.codex/`, `.impeccable/` and `skills-lock.json` out. Nothing else starts until this lands.
- [ ] Run the app and look at the home page: light and dark, 400px and desktop (20 min).
      Nothing from 16 Sep has been seen in a browser yet.
- [ ] Featured animals grid: 1, 2 and 3 pets, and 400px width (20 min)
- [ ] Translate the home section title and subtitle into Malay (20 min)
- [ ] Spare 30 min — it will be needed by whatever the browser check turns up

Stop at 2h even if the last item is open; it carries to evening 2.

### Home page leftovers (carry forward if today runs out)
- [ ] Grid with `featuredOnly`: 4 columns at `xl` only, 2 at `md` → check 1–3 pets and 400px width
- [ ] Translate title, subtitle, loading text and CTA into Malay (all hardcoded English in `page.tsx`)
- [ ] Check `PetCard` `rounded-3xl`: image corners and badges
- [ ] LATER: loading fallback as skeleton cards instead of a spinner line

### Pages to convert (evenings 2–4; detail in §2 and §3)
- [ ] needs
- [ ] get-involved
- [x] donate (1 Oct)
- [x] impact (1 Oct)
- [ ] bulletins
- [ ] privacy / terms
- [ ] pets FAQ
- [ ] `pets/[id]`
- [ ] Shared: one container width, `ui/card.tsx` default radius

### Before calling it done (evening 5)
- [ ] §6 verification: tsc, `test:all`, `ui-critic`, visual check (light/dark, 400px, EN/MS)

## 0. Baseline: the home page style (the target)

Taken from the new sections in `HomeSections.tsx` ("Our work", the audience cards) and `app/page.tsx`.

| Token | Home standard |
|---|---|
| Section ground | `bg-work-ground` |
| Section rhythm | `py-16 sm:py-20` |
| Section header | `max-w-2xl space-y-3`, left-aligned |
| h1 (page hero) | `font-heading text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight` |
| h2 (section) | `font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight` |
| h3 (card) | `text-xl` / `text-2xl` |
| Cards / media | `rounded-3xl border border-border bg-work-panel shadow-xs` |
| Buttons | `rounded-xl` |
| Subtitle | one sentence, ≤ ~20 words, `text-muted-foreground` |

- [x] Confirm this baseline with the owner before restyling other pages
- [x] Put the repeated classes into one shared `SectionHeader` / `Section` component (they already appear 3+ times)
- [x] Check that `bg-work-ground`, `bg-work-panel` and `rounded-3xl` pass the guard suite (`ui-critic`)

	The focused token assertions pass. The full guard suite still reports unrelated existing violations in `impact/page.tsx`, `PetGallery.tsx`, email token parity, and primary contrast.

## 1. Home page: sections still on the old style

- [x] `HomeSections.tsx:310` **How it works**: `py-14 sm:py-18`, `bg-background`, `border-t`, h2 `2xl/3xl`, cards `rounded-2xl bg-card` → baseline
- [x] `HomeSections.tsx:390` **Mission**: h2 `2xl/3xl`, `rounded-md` pill badge → baseline h2; drop or restyle the pill
- [x] `HomeSections.tsx:441` **Support**: `py-14 sm:py-18`, `bg-background`, `border-t` → baseline
- [x] `Hero.tsx:141` stat tiles `rounded-2xl` → `rounded-3xl`
- [x] `Hero.tsx:131` delete the commented-out block
- [x] Mixed separators: some sections use `border-t`, others change ground colour. Pick one.

## 2. Structure

- [ ] Every page gets the same order: hero header → content sections → CTA
- [ ] Page containers differ (`max-w-4xl`, `5xl`, `6xl`, `7xl`, and `w-full` with no max). Standardise on one content width plus one prose width.
- [ ] Horizontal padding: `px-6 sm:px-8 lg:px-12` everywhere (privacy/terms use `lg:px-10`)
- [ ] `app/pets/page.tsx:63`: FAQ section sits under `border-t mt-10 pt-10` with no ground or rhythm → baseline section
- [ ] `app/needs/page.tsx:40`: content section has `pt-10` only, no bottom padding
- [ ] `app/get-involved/page.tsx:42`: sections are wrapped in a `div` with `space-y-16` instead of their own sections
- [ ] `app/bulletins`, `privacy`, `terms`: wrapper is a `div` with `min-h-screen bg-card` → `section` on `bg-work-ground`
- [ ] Every page has exactly one `h1`, with no skipped heading levels (check `pets/[id]`, `applications/track`)

## 3. Section style by page

| Page | Hero ground | h1 size | Cards | Fix |
|---|---|---|---|---|
| `needs` | `bg-muted/20 border-b` | 3xl/4xl/5xl | — | ground, h1 |
| `donate` | `bg-card border-b`, centred | 3xl/4xl/5xl | `rounded-2xl`, `rounded-lg` pills | ground, h1, radius, alignment |
| `get-involved` | `bg-muted/20 border-b` | matches | `rounded-2xl bg-card` | ground, radius |
| `impact` | none, centred | 3xl/4xl/5xl | `rounded-2xl bg-card`, inline `style` tint | ground, h1, radius, remove inline style |
| `bulletins` | `bg-card` | 3xl/4xl | — | ground, h1 |
| `privacy` / `terms` | `bg-card` | 3xl/4xl | h2 `text-xl` | ground; keep prose headings smaller |
| `pets` | — | — | `PetCard rounded-3xl` ✓ | FAQ section |

- [ ] needs
- [x] donate: also decide on centred or left-aligned hero → **left-aligned** (1 Oct; only the home hero is centred)
- [ ] get-involved: success-green button uses `text-white` → check it against the tone tokens
- [x] impact (1 Oct)
- [ ] bulletins
- [ ] privacy / terms
- [ ] pets + `PetsFaqSection`
- [ ] `pets/[id]` detail page (not surveyed yet)
- [x] `applications/track` (1 Oct)
- [ ] Shared `ui/card.tsx` default radius, so pages stop overriding it per use

## 4. Text length and copy

- [ ] Hero subtitles: one to two sentences, ≤ ~30 words. Measure the paragraphs on donate, needs, get-involved and impact against this.
- [ ] Section subtitles: one sentence, ≤ ~20 words (home is the reference)
- [ ] Headings: ≤ 6 words. Privacy/terms h2s like "Lifetime Shelter Safety Net & Return Clause" are allowed in legal prose; everywhere else, shorten.
- [ ] Card text: ≤ 3 lines at 400px wide. Clamp or trim.
- [ ] Button labels: verb first, ≤ 3 words, same casing everywhere (uppercase tracking on some pages, sentence case on others)
- [ ] Same tone of voice: warm and plain, no legal or marketing register outside legal pages
- [ ] **Translations:** every new or edited string exists in English and Malay. The new home strings ("From the shelter", both subtitles in `app/page.tsx`) are English only.
- [ ] Re-check lengths in Malay, which usually runs longer. Nothing should wrap badly at 400px.

## 5. Components touched by the home rebuild

- [ ] `BulletinFeed.tsx` carousel: 0, 1 and 4+ items; keyboard navigation; reduced motion; 400px width
- [ ] `PetGallery.tsx`: the new h2 scale also shows on `/pets` → confirm that is intended there
- [ ] `PetCard.tsx`: `rounded-3xl` → check the image corners and badges still fit

## 6. Verification (before ticking any section done)

- [ ] `npx tsc --noEmit`
- [ ] `npm run test:all`, including the design-token guard suite
- [ ] `ui-critic` review of the changed files
- [ ] Look at every page in the running app: light and dark mode, 400px and desktop, English and Malay
- [ ] Commit per concern with `atomic-commit` (structure / style / copy / translations). Leave `.codex/`, `.impeccable/` and `skills-lock.json` out.

## Out of scope (separate tasks)

- Birth-date field in `PetFormDialog`: `tasks/open/pet-form-has-no-birth-date-field.md`
- Pet ages in the visitor's language: `tasks/open/ages-render-in-english-on-malay-site.md`

## Blocker: the hero images are not in the repo

`Hero.tsx` was rebuilt around eight cut-outs in `public/cutouts/*.png`, but line 59 of
`.gitignore` is `*.png`, so none of them are committed. The hero is broken on a fresh clone and
on any deploy. The rewrite is held back uncommitted until this is settled.

- [ ] Decide: force-add the cut-outs (`git add -f`), or narrow the `*.png` rule so `public/`
      is tracked — the rule exists to keep screenshots out, and `public/` is not where they land
- [ ] Confirm the images are ours to ship (they are placeholder cut-outs right now)
- [ ] Commit the images and `Hero.tsx` together, and check the hero on a fresh clone
