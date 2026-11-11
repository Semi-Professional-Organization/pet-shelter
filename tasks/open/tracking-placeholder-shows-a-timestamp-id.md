# The tracking page's placeholder shows an id format applicants never receive

**Status:** open · opened 2026-11-11 · found by review while fixing #201

The `tracking.refPlaceholder` translations (English and Malay) read `e.g. app-1723738192000`,
overriding the page's correct `HFS-APP-…` fallback. Applicants are given a reference code, and
since #201 application ids are not timestamps. `e2e/pages/TrackingPage.ts` locates the field by
`/app-\d/`, so the copy and that locator change together.

**Settles when:** both translations show a reference-code example and the e2e locator no longer
depends on the placeholder text.
