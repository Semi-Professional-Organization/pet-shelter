# Seventeen translation keys the code calls do not exist, so they render English on the Malay site

**Status:** open · opened 2026-10-14 · measured at `c9a45e3`

`useLanguage().t(path, fallback)` looks a key up in the active dictionary, then in `en`, then
returns the `fallback` it was given, and finally the path itself. When a key exists in neither
dictionary, the caller's English fallback is what every visitor sees — including on the Malay site,
with nothing logged and nothing failing. Typing `t()` to accept only real keys surfaced eighteen;
one has since been resolved, and seventeen remain.

## How it was found

`t` takes `path: string`. A review of the home-page work asked for it to take the union of the
dictionary's leaf paths instead, and the change was probed rather than shipped: a `TranslationKey`
type was derived from `TranslationDictionary` and `t`'s parameter retyped. `tsc --noEmit` then
reported **38 errors in nine files**:

- **18 are keys that exist in no dictionary.** Each renders its English fallback in both languages.
- **20 are dynamic keys** — a `string` built at runtime or passed through a helper such as
  `genderLabelArgs` — which would need threading through as `TranslationKey` rather than `string`.
  They are plumbing, not defects; no evidence was collected that any of them is missing.

| Key | Where |
|---|---|
| `adoptionForm.referenceCodeLabel` | `AdoptionWizard.tsx:121` |
| `common.copy`, `common.copied` | `AdoptionWizard.tsx:138` |
| `adoptionForm.referenceCodeHint` | `AdoptionWizard.tsx:143` |
| `adoptionForm.nextStep3Prefix` | `AdoptionWizard.tsx:158` |
| `adoptionForm.nextStep3Suffix` | `AdoptionWizard.tsx:162` |
| `adoptionForm.trackNow` | `AdoptionWizard.tsx:178` |
| `adoptionForm.identificationLabel` | `AdoptionWizard.tsx:284` |
| `adoptionForm.identificationHint` | `AdoptionWizard.tsx:287` |
| `adoptionForm.landlordApprovalLabel` | `AdoptionWizard.tsx:345` |
| `adoptionForm.landlordApprovalHint` | `AdoptionWizard.tsx:348` |
| `adoptionForm.vetClinicLabel` | `AdoptionWizard.tsx:405` |
| `adoptionForm.vetClinicPlaceholder` | `AdoptionWizard.tsx:410` |
| `adoptionForm.dailyAloneHoursLabel` | `AdoptionWizard.tsx:418` |
| `adoptionForm.homeVisitAgreement` | `AdoptionWizard.tsx:485` |
| `common.next` | `AdoptionWizard.tsx:545` |
| `nav.sponsorPortal` | `Footer.tsx:86` |

**Resolved 2026-10-14:** `nav.sponsorWall`, the eighteenth. The navbar already carried "Dinding
Penaja Awam" inline for the same `/sponsors` link, so the key was added with that existing Malay
and both components read it — no translation was invented to close it.

Sixteen of the seventeen are in the adoption application wizard, so a Malay-speaking applicant gets
English labels for their identification, their landlord's approval and the home-visit agreement —
the fields with legal weight — and an English "Next" button.

## A trap this sets

The `Footer` keys are why the fallback argument cannot be treated as dead copy. Sixteen other
`Footer` calls carried fallbacks for keys that do exist, and those fallbacks had drifted from the
dictionary unobserved; they were removed on 2026-10-14. Two were kept, because for them the
fallback was the only text there was — removing it would have put the literal `nav.sponsorWall` in
the footer. (`nav.sponsorWall` has since become a real key; `nav.sponsorPortal` keeps its fallback.)
`tests/components/footer.test.tsx` pins both. **Check that a key exists before deleting its
fallback**; "the fallback is unreachable" is true per key, not per file.

## The path that was not taken, and the one that was

Fixing all 38 inside a home-page PR would have meant authoring Malay for most of an application
form. Instead the home-page branch added `useTypedTranslation()` to `LanguageProvider`, which
returns `{ t, isMs }` with `t` restricted to `TranslationKey` (and accepting interpolation
params), and moved the components it touched onto it — `Hero`, `HomeSections`, `BulletinsPageIntro`, `Navbar`
and `Footer`, and `BulletinFeed` through `Translated`, a client leaf that wraps it, since #103 made
the feed a Server Component. A probe confirmed the effect: renaming
`hero.tnrmHeadline` in the dictionary is now a compile error at `Hero.tsx`, where before it would
have rendered the literal path as the page's `<h1>`.

`Footer` is the instructive one. Its other keys are now compile-checked; the one Footer key in the
table above still goes through an untyped handle, named `untypedT` and commented as this defect,
and it is the only untyped call left in any file the branch touched.

The no-provider fallback inside `useLanguage` was also a second, diverged copy of `t`: it returned a
fallback string *ahead of* the dictionary and never interpolated, so `Footer` rendered outside a
provider printed "ROS Reg: {regNo}". Both paths now call one `translate()` function.

**Settles when:** the seventeen remaining keys are added to both dictionaries — with Malay a person has
reviewed, since several sit on legally meaningful form fields — or their call sites are changed to
keys that exist; the twenty dynamic call sites are typed as `TranslationKey`; and `t` itself then
takes `TranslationKey`, at which point `useTypedTranslation` is redundant and should be deleted.
