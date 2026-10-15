# The home page renders Malay everywhere except the bulletin admin chrome

**Decided:** 2026-09-22

**Changed by #103, 2026-10-15.** #103 replaced the per-browser bulletin store with a server-side
one and made `BulletinFeed` a read-only Server Component with no admin controls; editing moved to
`/admin/bulletins` behind `MANAGE_CONTENT`. Merging it into this branch removed the one exception
this decision is named for: there is no admin chrome on the public feed left to keep English. The
sections below are corrected where they described the old feed, and each correction says so.

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
| `page.tsx` `<BulletinFeed title="Latest news and updates">` | `titleKey="home.bulletinsTitle"` (see "The heading prop takes a key") |
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
key. *(Corrected 2026-10-15.)* Since #103 the feed is itself a Server Component, so it resolves the
key through `Translated` (`src/components/providers/Translated.tsx`), a client leaf that renders one
dictionary string — the boundary sits at the string, and the feed's markup and data stay on the
server. `/bulletins` passes
`bulletins.allNoticesTitle`, `/pets` passes `bulletins.petsFeedTitle`, and `/` passes
`home.bulletinsTitle`. It was optional at first, defaulting to `home.bulletinsTitle`, which meant a
shared feature component quietly owned a home-page string and a new caller that forgot the prop
would be headed "Latest Bulletins" anywhere; required since 2026-10-14.

This was not in the entry's inventory. It became necessary *because of* the rest of this change:
once the chips, byline and empty state around those two feeds rendered Malay, an English string
literal above them left `/bulletins` and `/pets` in a worse mixed-language state than before. A
change that improves one page by degrading two is not an improvement.

The same typing rule applies to the category chips. `labelKey` is a `TranslationKey` rather than
`string`, so renaming a key is a compile error instead of a chip silently falling back to English
on the Malay site. *(Corrected 2026-10-15.)* It now lives in #103's shared
`BULLETIN_CATEGORY_PRESENTATION` table beside the admin editor's English `label`, not in a second
map inside the feed: #103 lifted that table out precisely so two copies could not drift. (It began as a
per-namespace `BulletinKey` alias; the aliases were dropped for one dictionary-derived type —
`tasks/open/translation-keys-the-dictionary-does-not-have.md` explains why `t` itself is not yet
typed.) **No string in `BulletinFeed` carries an English fallback**:
`LanguageProvider` already falls through to the `en` dictionary when a key is missing from the
active one, so a literal argument could only ever be a second copy of the label — unreachable, and
free to drift from the one a translator edits.

## What stayed English: the bulletin admin chrome — removed by #103

Until 2026-10-15 everything gated on `isAdminMode` in `BulletinFeed.tsx` kept its English literal,
because `tasks/open/bulletins-are-a-per-browser-demo-anyone-can-edit.md` was due to delete that
editor, and translating it would have polished a control that was itself the defect: the toggle had
no session check, so every visitor got it and it worked. The line drawn was what a visitor sees
before clicking anything, so the toggle's own label, `Staff Admin Access`, was translated.

#103 settled that entry and deleted the editor. Its two keys, `bulletins.staffAccess` and
`bulletins.adminModeActive`, were left with no reader and are deleted. The Malay test that
translated the toggle now asserts the opposite, in both languages: the public feed renders no button
at all. Translating the control again would only mean it had come back.

`bulletins.noUpdates` took #103's empty-state wording, "No updates to show right now." /
"Tiada kemas kini untuk dipaparkan buat masa ini.". #103 changed it because the previous "No updates
or bulletins posted for this section." is false during a database outage, when the repository
serves no notices rather than stale ones; a translation of the old sentence would have reintroduced
that.

## Not in scope, and still true

- **`<html lang>` is hardcoded `"en"`** in `src/app/layout.tsx`, site-wide. Every page's served
  HTML is English until hydration, because the server cannot know the language — which is what a
  crawler reads, and what a screen reader announces the language of. Translating the `<h1>` makes
  this worse in one narrow sense: the document now declares English over Malay text. Fixing it is a
  different change from this one, and the entry recorded it as not owned by itself.
- **Notice and pet content renders in English.** *(Corrected 2026-10-15.)* Bulletins now store
  `titleMs` and `contentMs` (#103), but the public `Bulletin` does not carry them yet, by #103's
  own decision (`tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md`). Pet `breed`,
  `description` and `tags` are still single-column English. Both are data questions, not literals.
- **`/pets` and `/bulletins` still have untranslated chrome of their own**, outside this entry's
  inventory. Their `BulletinFeed` headings are no longer part of it — see "The heading prop takes a
  key" above — but the rest of each page is unchanged.

## Verification

`tests/components/homeMalay.test.tsx`, 25 cases as of 2026-10-15 (18 when first written). Every Malay case asserts the **English is absent**
rather than that the Malay is present, which is the gap the entry names: the existing
`home.test.tsx` asserted presence and passed for sixteen days beside a hardcoded English `<h1>`.
Two further cases pin the English side, because an inverted `isMs` would satisfy every Malay
assertion at once.

Run against the components before this change, 12 of the then-17 failed. The five that passed were
the two new components (which did not exist), the heading-prop guard, and the two English cases —
exactly the set that should not have moved.

The image `alt` is read from the attribute, not by text: `queryByText` cannot see an `alt` at all,
which is how that string stayed English while a Malay hero test passed next to it.
