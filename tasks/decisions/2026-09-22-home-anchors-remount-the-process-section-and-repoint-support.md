# The home page remounts its adoption-process section and sends /#support to /get-involved

**Decided:** 2026-09-22

Settles `tasks/open/nav-links-point-at-home-sections-the-page-no-longer-renders.md`.

## The choice, per dead export

`1137d3e` took three components out of `src/app/page.tsx` and left four links pointing into their
anchors. They are not one problem, and they do not get one answer.

| Export | Disposition | Why |
|---|---|---|
| `HomeProcessSection` (`#how-it-works`) | **Remounted on `/`** | Its two adoption-process links want it and the content exists nowhere else |
| `HomeCommunitySection` (`#support`) | **Deleted**; its one link repointed | `/get-involved` already holds the same content, better |
| `HomeGalleryHeader` | **Deleted** | It was `return null` |

`Footer.tsx:59` now points at `/get-involved#volunteer`. `Navbar.tsx:53`, `Footer.tsx:54` and
`HomeSections.tsx:161` keep `/#how-it-works`, which resolves again.

## Why `#how-it-works` was remounted rather than repointed

The open entry's own framing — and the brief that carried it — preferred pointing links at content
that exists over "remounting sections nobody has missed". That works for `#support` and is what was
done there. It is not available for `#how-it-works`, because **no adoption-process content with an
id exists anywhere else in `src`**. The candidates were checked:

- `/adopt` is the application wizard. It has no `id=` on any element, it is `max-w-3xl` centred
  around a form, and **nothing in `src` links to it** (`grep -rn '"/adopt"' src` is empty). Mounting
  a full-width marketing section there, or pointing "Adoption Process & Criteria" at a form, would
  trade a broken anchor for a misleading one.
- `/faq` renders `FaqBrowser`, whose only id is `faq-search`. `PetsFaqSection`'s `id="faq"` renders
  only on `/pets`.

`HomeProcessSection` holds the three-step journey in both languages, is styled as a home section
(`border-t`, `max-w-7xl`), and its id is the one the navbar's "Adoption Process & Criteria" and the
footer's "Adoption Process" already name. Restoring it costs an import and a line. It goes back in its original slot — between the `#adopt`
gallery and `HomeStandardsSection` — which is where `1137d3e` removed it from.

**Remounting it also had to repair it.** Its step copy was inline ternaries duplicating
`home.step1Title`…`step3Desc`, which no longer had any reader — and in three weeks unmounted the
two copies drifted: the dictionary says "Semak & Hantar Permohonan" where the component said "Pilih
Haiwan & Hantar Permohonan", and "no hidden fees" where the component said "zero adoption fees".
Mounting a section is publishing its copy, so the divergence had to be settled first. The copy
moved into the dictionary, because that is the copy a translator can reach — and the heading,
eyebrow and subtitle followed on 2026-10-14, so no half of the component is unreachable.

**But "the dictionary wins" picked the right home and, twice, the wrong words.** Step 3's
dictionary text said "no hidden fees", which implies visible ones; for three days the test pinned
that by asserting the alternative was absent. The first fix swapped in the replaced inline wording,
"zero adoption fees" — which over-promises, because fees are admin-configurable
(`adoptionFeeDog`, `adoptionFeeCat`, and a per-pet `adoptionFee` that a pet page shows whenever it
is not "Free"). The site's own careful copy says **"commercial** adoption fees": this section's
subtitle ("zero commercial adoption fees") and the standards section below ("We do not sell animals
or charge commercial adoption fees"). Step 3 now says "with no commercial adoption fees" / "tanpa
sebarang yuran adopsi komersial", and the test asserts that wording and the absence of both earlier
ones. Choosing where a string lives is not choosing what it says; each copy has to be read against
what the organisation actually states, and against what its admin screens allow.

**Left for the owner:** the navbar still promises a "100% free adoption guide" and the standards
section is headed "100% Free Adoption Policy", while the same configurable fees exist. Every seeded
fee is "Free" today, so nothing contradicts on screen. Whether the policy is "free" or "no
commercial fee" is the organisation's decision, not this change's.

Two more things the remount exposed, both invisible while the anchor went nowhere:

- `Navbar.tsx:55` advertised the destination as a "Panduan 4-langkah" in Malay, and the section
  renders three steps, `01`–`03`.
- **The TNRM pillar's "Learn More" pointed here too**, and it is not about adoption at all — TNRM is
  trap-neuter-return-manage. The first version of this entry counted it among "three links" that
  want the section without reading it, while rejecting `/adopt` on the grounds that a misleading
  destination is no better than a broken one. The same standard applies. It now points at `/faq`,
  which describes itself as "Answers on TNRM and community animals"; the FAQ's category is internal
  state with no URL parameter, so the page is as deep as a link can go.

That commit is titled "chore(ui): update home page" and left four links behind pointing into what it
removed. Leaving the links is the evidence that the removal was not a considered decision *about
those links*; it is not evidence that the section was wanted back. Anyone who does want the home
page shorter should delete the section and its two links together, which is now one guard failure
away from being obvious.

## A limit on hard-loading the anchor

A hard load of `/#how-it-works` — a shared link, a new tab, a refresh — lands on the static HTML,
where the featured-pets gallery above the section is still its loading fallback: `PetGallery`'s
controller reads `useSearchParams()`, which keeps that subtree out of the prerender. Hydration then
replaces the short fallback with the much taller grid, and the bulletin feed and post-hydration
Malay copy change height too. Browsers with CSS scroll anchoring compensate; one that does not
leaves the reader inside the gallery, undoing `scroll-mt-24`. Client-side navigation through
`<Link>` is unaffected.

This is not new — `#mission` sits below the same gallery and has the same exposure — so it is
recorded here rather than fixed. Closing it means reserving the gallery's height in its fallback,
which is a layout decision, not an anchor one.

## What `#support` gains by moving

`HomeCommunitySection` and `/get-involved` both covered volunteering and fostering.
`/get-involved` covers more (`#volunteer`, `#foster`, `#corporate`, `#partnerships`), is already
linked from `Navbar.tsx:76,82,88,94`, and each of its sections carries `scroll-mt-24`. `/` also
still routes there: `HomeQuickActionsSection`'s "Volunteer" card links `/get-involved`. So deleting
the duplicate removes a second copy rather than a capability.

## Two things fixed in passing, and one deliberately not

- **`Navbar.tsx:148` compared `pathname` to `"/#how-it-works"`.** `usePathname()` returns no
  fragment, so that clause could never be true. Dropped rather than reimplemented: making the
  Adoption dropdown highlight on a fragment needs a `hashchange` listener, which is a lot of
  machinery for a font weight. The remaining `pathname.startsWith("/applications")` is unchanged.
- **`#how-it-works` gained `scroll-mt-24`.** The header is `sticky top-0`, and no home section
  declares a scroll offset, so an anchor lands under it. After this change `#how-it-works` is the
  only id on `/` that anything links to, so it is the only one where the offset is observable.
- **`#adopt`, `#our-work` and `#mission` still have no `scroll-mt`.** Nothing links to them, so
  nothing scrolls to them. Left alone rather than swept up.

## The guard, and what it cannot see

`tests/unit/homeAnchors.test.ts` walks down from `page.tsx`'s render tree, attributing each id to
the *component* that declares it, and asserts every `/#id` in `src` resolves. Attribution by
component rather than by file is the point: `#how-it-works` and `#support` live in the same file as
three sections that were always mounted, so a file-level scan would have called both fine — which is
`tasks/lessons/2026-09-18-a-grep-for-an-anchor-id-proves-it-is-declared-not-rendered.md` happening
again.

Run against the tree before this change, it named all four links from the open entry, at the lines
the entry gives.

**Two holes were found by review and closed before merge**, both of which made the guard weaker
than it reads:

- It matched only `"/#id"`, so `/get-involved#volunteer` — the link *this decision created* — fell
  outside its own coverage, along with the four `/get-involved#…` links already in `Navbar.tsx`. It
  now matches any `"/<route>#<id>"` and resolves the id against that route's `page.tsx`. Verified by
  probe: pointing the footer at `/get-involved#ghost-section` fails the suite.
- It scanned raw file text, so commenting a mount out still counted it as rendered — the exact
  defect the guard exists to catch, passing silently. Block comments are now stripped first.
  Verified by probe: commenting out `<HomeProcessSection />` makes `#how-it-works` unresolved and
  names the links that break — three at the time, two since the TNRM pillar moved to `/faq`. Three commented-out JSX blocks already exist in this tree, so
  the stripping is load-bearing rather than theoretical. Comments are now found by TypeScript's
  parser rather than by pattern, after each of three regex versions was found to have a hole; see
  "The guard's comment handling" below.

Its remaining ceiling is in the file: it does not evaluate conditionals, so it over-accepts. It
also only counts ids on landmark elements, so an anchor added to a `<span>` is reported unresolved —
move it to a `<div>` or `<section>`, or widen the allowlist.

## The guard's comment handling

The guard must ignore commented-out code, or a mount someone commented out still counts as
rendered — the defect it exists to catch. Getting that right took five attempts, and the history is
the reason the current form looks as it does:

1. A regex deleting `/* … */` shifted every reported line number, by 33 in one case.
2. Blanking from any whitespace-preceded `//` cut the `href` out of `<a title="Tue // Sun">`.
3. Restricting `//` to line starts let a `/*` inside `accept="image/*"` open a fake comment that
   swallowed real code up to the next `*/`.
4. TypeScript's parser replaced the regex — a quote-skipping scanner would have broken on every
   apostrophe in JSX text. It found comments correctly, and showed that inside JSX children
   `// <X />` is text and renders. But walking into JSDoc tag nodes asked the context-free comment
   scanner about positions *inside* a doc block, where `@param x // note` read as a line comment
   running past the `*/` and blanked the code after a one-line doc.
5. JSDoc nodes are now skipped — the doc block is already collected whole as leading trivia of its
   declaration — and any range that starts inside another range is discarded as a backstop.

Each repair was probed red against the version it replaced. Imports are read from the same parsed
tree: `import A, { B }` keeps both, `{ A as B }` resolves to the exported name, and a default
export written as `export default Name` or `export default memo(Name)` resolves too. A default
that cannot be named is recorded as a parser gap in the failure message instead of silently
dropping its subtree. Each file is parsed once and cached.
