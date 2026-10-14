# The home page renders Malay everywhere except the bulletin admin chrome

**Decided:** 2026-09-22

Settles `tasks/open/home-page-text-stays-english-on-the-malay-site.md`. That entry allowed each row
of its inventory to be either translated or "accepted as intentionally English and that acceptance
written to `tasks/decisions/`". Every row is translated except one group, which is accepted here.

## Where the strings went

`src/app/page.tsx` is a Server Component under `revalidate = 300`, and the reader's language is
client state: `LanguageProvider` reads `localStorage`, and its `getServerSnapshot` returns `null`.
Reading the language cookie in the page would make it render per request and give up ISR — the
trade `src/app/api/sponsor/pet-media/[petId]/route.ts` already declined. So the three literals the
page rendered itself moved across the client boundary instead:

| Was | Now |
|---|---|
| `page.tsx` `<BulletinFeed title="Latest news and updates">` | prop dropped; `BulletinFeed` falls back to `t("home.bulletinsTitle")` |
| `page.tsx` Suspense fallback, "Loading rescue animals…" | `HomeGalleryLoading` in `HomeSections.tsx` |
| `page.tsx` "View All Animals" link | `HomeViewAllPetsLink` in `HomeSections.tsx` |

`Hero`'s `<h1>` and its image `alt` read `hero.tnrmHeadline` and `hero.imageAlt`. They first
shipped as inline `isMs` ternaries, on the grounds that the whole `hero.*` namespace was unused and
adding to it would grow a dead namespace — and a review pointed out that this left the page's most
prominent string unreachable by a translator, the exact split-source defect the same branch was
fixing in `HomeProcessSection`. **Superseded 2026-10-14**: both are dictionary keys now. `hero.title`
was still not repurposed — it holds different copy ("Adopt a dog or cat from your local shelter.")
and `tests/unit/i18n.test.ts` asserts on it.

## Which wording was kept, and why

Both unused keys the entry named are now used, rather than the literals the page held. For
`home.viewAllPets` the dictionary's wording stands — "View All Adoptable Pets" /
"Lihat Semua Haiwan Sedia Diadopsi", where the page said "View All Animals" — because it already
carried human-authored Malay and is the more accurate label for a link to `/pets`.

`home.bulletinsTitle` was first kept at the dictionary's "Shelter Bulletins & Updates", on the
same reasoning. **That was superseded on 2026-10-14 by a copy-uniformity pass** (see below), and it
is now "Latest Bulletins" / "Buletin Terkini".

## One noun for the bulletin feature (2026-10-14)

Translating `BulletinFeed` surfaced that this one feature answered to **seven** English names, four
of them built from the same shuffled words — Shelter, Bulletins, Updates, News, Community, Notices:

| Where | Was | Now |
|---|---|---|
| nav + footer link (`nav.bulletins`) | "Updates & News" | "Shelter Bulletins" |
| `/bulletins` `<h1>` (`bulletins.title`) | "Shelter Bulletins & News" | "Shelter Bulletins" |
| `/bulletins` feed `<h2>` (`bulletins.allNoticesTitle`) | "All Community Notices" | "All Bulletins" |
| `/` feed `<h2>` (`home.bulletinsTitle`) | "Shelter Bulletins & Updates" | "Latest Bulletins" |
| `/pets` feed `<h2>` (`bulletins.petsFeedTitle`) | "Adoption Notices & Clinic Updates" | "Adoption & Clinic Bulletins" |

**The rule, derived from the site rather than invented:** one noun for the feature, the scope in the
qualifier, Title Case. Title Case is what four of the five `<h2>`s on `/` already use
("Our Work", "Our Animal Welfare & Sanctuary Standards", "Our Transparent Adoption Journey"); the
eyebrow above each heading is `uppercase` in CSS, so its source casing is not a visible choice.
There is no copy convention written down anywhere in `docs/` — this is the first time one has been
stated, and it is stated as what the markup already did.

Two true duplicates went with it. `Navbar`'s mobile link hardcoded "Updates & News" inline, the
same string `nav.bulletins` holds for the footer; it reads the key now. And `Footer` passed
"Shelter Updates & Bulletins" as an unreachable `t()` fallback — an eighth variant that could never
render, and could drift from the key forever without anyone noticing.

`bulletins.badge` ("Community & Rescue Bulletins") is a ninth variant and is deliberately left: it
has no reader at all, so it is an orphan-key problem rather than a copy problem, and it belongs to
`tasks/open/home-page-copy-is-duplicated-outside-the-dictionary.md`.

**These are visible English copy changes**, and they remain the easiest thing here to reverse: the
five values above live in `src/lib/i18n/translations.ts`, and the Malay follows each one. The same
pass also reached the browser-tab title of `/bulletins` ("Bulletins & Updates" → "Shelter
Bulletins") and the admin sidebar's link to it ("Community Bulletins" → "Shelter Bulletins"), both
of which the first version of this table missed — the tab title being the most widely seen name of
all. The empty-feed message `bulletins.noUpdates`, added for this page, sat beside an unread
`bulletins.noBulletins` that said nearly the same; the unread one was deleted.

One string deliberately did **not** reuse its nearest key. The entry suggested `common.loading`
("Loading…" / "Memuatkan…") for the gallery's "Loading rescue animals…". Using it would have
narrowed the English from a specific label to a generic one — a visible regression on the English
site in order to fix a Malay bug. A new `home.galleryLoading` carries the specific wording in both
languages instead, and `common.loading` remains unused.

## The heading prop takes a key, not a string

`BulletinFeed`'s `title?: string` became a **required** `titleKey: TranslationKey`. Every caller is
a Server Component that cannot resolve its own heading without giving up ISR, so each hands over a
key and the feed — already a client component — resolves it. `/bulletins` passes
`bulletins.allNoticesTitle`, `/pets` passes `bulletins.petsFeedTitle`, and `/` passes
`home.bulletinsTitle`. It was optional at first, defaulting to `home.bulletinsTitle`, which meant a
shared feature component quietly owned a home-page string and a new caller that forgot the prop
would be headed "Latest Bulletins" anywhere; required since 2026-10-14.

This was not in the entry's inventory. It became necessary *because of* the rest of this change:
once the chips, byline and empty state around those two feeds rendered Malay, an English string
literal above them left `/bulletins` and `/pets` in a worse mixed-language state than before. A
change that improves one page by degrading two is not an improvement.

The same typing rule applies to the category chips. `labelKey` is a `TranslationKey` rather than
`string`, and the component reads it through `useTypedTranslation()`, so renaming a key is a
compile error instead of a chip silently falling back to English on the Malay site. (It began as a
per-namespace `BulletinKey` alias; the aliases were dropped for one dictionary-derived type —
`tasks/open/translation-keys-the-dictionary-does-not-have.md` explains why `t` itself is not yet
typed.) **No `t()` call in `BulletinFeed` passes an English fallback**:
`LanguageProvider` already falls through to the `en` dictionary when a key is missing from the
active one, so a literal argument could only ever be a second copy of the label — unreachable, and
free to drift from the one a translator edits.

## What stays English: the bulletin admin chrome

Everything gated on `isAdminMode` in `BulletinFeed.tsx` keeps its English literal:

`Post Update / Media` · `title="Reset to sample announcements"` · the "Admin Editing Mode…" banner ·
`title="Unpin notice"` / `"Pin notice to top"` · `title="Edit bulletin"` · `title="Delete bulletin"` ·
`Post First Update`

Because `tasks/open/bulletins-are-a-per-browser-demo-anyone-can-edit.md` settles by deleting it.
Its settle condition is a server-side store behind a `MANAGE_CONTENT`-guarded action "with the
public toggle gone — or the feeds come off the public pages until they do". Either branch removes
this editor. Translating it now would commission Malay for copy that entry deletes, and would
polish a control that is itself the defect: that toggle has no session check, so every visitor gets
it and it works.

The line drawn is **what a visitor sees before clicking anything**. That includes the toggle's own
label, so `Staff Admin Access` *is* translated, along with the category chips, `Pinned`,
`Posted by:` and the empty state. `Admin Mode Active` is translated only because it is the other
branch of the same ternary; splitting a ternary across two policies would be worse than either.

A comment at the `isAdminMode` block in `BulletinFeed.tsx` points here, so the next reader does not
"finish the job" by hand.

## Not in scope, and still true

- **`<html lang>` is hardcoded `"en"`** in `src/app/layout.tsx`, site-wide. Every page's served
  HTML is English until hydration, because the server cannot know the language — which is what a
  crawler reads, and what a screen reader announces the language of. Translating the `<h1>` makes
  this worse in one narrow sense: the document now declares English over Malay text. Fixing it is a
  different change from this one, and the entry recorded it as not owned by itself.
- **Bulletin and Pet content columns have no Malay field.** `title`, `content`, `breed`,
  `description` and `tags` are single-column English. That is a schema question, not a literal.
- **`/pets` and `/bulletins` still have untranslated chrome of their own**, outside this entry's
  inventory. Their `BulletinFeed` headings are no longer part of it — see "The heading prop takes a
  key" above — but the rest of each page is unchanged.

## Verification

`tests/components/homeMalay.test.tsx`, 23 cases as of 2026-10-14 (18 when first written). Every Malay case asserts the **English is absent**
rather than that the Malay is present, which is the gap the entry names: the existing
`home.test.tsx` asserted presence and passed for sixteen days beside a hardcoded English `<h1>`.
Two further cases pin the English side, because an inverted `isMs` would satisfy every Malay
assertion at once.

Run against the components before this change, 12 of the then-17 failed. The five that passed were
the two new components (which did not exist), the heading-prop guard, and the two English cases —
exactly the set that should not have moved.

The image `alt` is read from the attribute, not by text: `queryByText` cannot see an `alt` at all,
which is how that string stayed English while a Malay hero test passed next to it.
