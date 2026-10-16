# The served HTML is English whatever language the reader chose, and declares itself so

**Status:** open · opened 2026-09-22 · observed at `b90304d`

Every page on this site is server-rendered in English and switches to Malay only after hydration.
`src/components/providers/LanguageProvider.tsx:38-40` defines `getServerSnapshot()` returning
`null`, so `useSyncExternalStore` resolves to the `defaultLanguage` that `src/app/layout.tsx`
passes, which is `"en"`. The reader's real choice lives in `localStorage["hope_for_strays_lang"]`,
which a server render cannot see. The provider also writes a cookie of that name
(`LanguageProvider.tsx:67`) that nothing reads.

`src/app/layout.tsx` serves `<html lang="en">` to match. That attribute is corrected client-side by
the effect at `LanguageProvider.tsx:57-61`, so a hydrated browser is fine.

**What is not fine is every reader that does not hydrate.** A crawler indexing the Malay site reads
English content inside `lang="en"`. A screen reader announcing the document before hydration is
told English. Neither is a rendering bug a visitor would report, which is why this has survived.

**This got worse, on purpose, on 2026-09-22.** Before that date the home page's `<h1>` was a
hardcoded English literal, so `lang="en"` was at least *true* of the served markup.
`tasks/decisions/2026-09-22-home-page-malay-stops-at-the-bulletin-admin-chrome.md` translated it and
the rest of the home page's copy, which is the right fix for the defect it settles and makes this
one sharper: the served document now declares English over copy that is about to become Malay.

**Why it was not fixed there.** Reading the language cookie in a page makes that page render per
request and gives up ISR — `/` is `○ (Static)` with `revalidate = 300`, verified in
`npm run build`. That is the trade `src/app/api/sponsor/pet-media/[petId]/route.ts:11-13` already
declined once. Doing it properly is a routing decision (a `/ms` segment, middleware negotiation, or
accepting dynamic rendering on the pages that matter), not a literal to move.

Recorded here because it was previously "tracked separately" in a component docblock and in fact
tracked nowhere — `ls tasks/open/` had no entry for it. A live defect that exists only in a code
comment is lost at the next context boundary.

**Settles when:** either the served HTML carries the reader's language and `<html lang>` agrees
with it, or the trade is written to `tasks/decisions/` — naming which pages give up ISR, and what
the crawler is expected to see for the ones that do not.
