# The donate, transparency and get-involved pages scroll sideways on phones

**Status:** open · opened 2026-10-20

Measured on 2026-10-20 in a browser with emulated phone widths:

- **`/donate`, both branches:**
  - The submit label "COMPLETE DONATION PLEDGE & GENERATE E-RECEIPT — RM 50" is 354px of
    unwrappable text in a 218px button.
  - The page's `scrollWidth` is 405, 432 and 452 px at 320, 375 and 414 px wide, so a phone zooms
    the whole page out and the label is clipped at both ends.
  - "COPY BANK ACCOUNT" also overflows at 320 px.
- **`/transparency`, master:** the page lays out at a 513px viewport between 320 and 414 px.
  - The `overflow-x-auto` wrapper around the 560px reports table is not `relative`
    (`src/components/features/transparency/FinancialReportsTable.tsx:37`).
  - So the absolutely positioned `sr-only` spans inside it (around line 97) escape its clip.
- **`/get-involved`, master:** the page is 399px wide at 320 and 375 px, from WhatsApp links that
  cannot wrap.

`/donate` and `/get-involved` share one cause: the button shell's
`whitespace-nowrap uppercase tracking-widest` in `src/components/ui/button.tsx:7`.

**Settles when:** each of these pages has `document.documentElement.scrollWidth` equal to the
viewport width at 320, 375 and 414 px, checked in a browser, and the donate call to action reads in
full at each width.
