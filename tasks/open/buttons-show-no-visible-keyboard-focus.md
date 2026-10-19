# Buttons show no visible keyboard focus

**Status:** open · opened 2026-10-20

Every `Button` sets `outline-none` and draws its focus state as
`focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring`
(`src/components/ui/button.tsx:7`, identical on `master` and `feature/frontend`). Measured in a
browser on 2026-10-20 with transitions disabled:

- **The ring:** at 30% opacity it is 1.40:1 against both the card and page grounds.
- **The border:** the 1px border-ring is 1.32:1 against a filled primary button.

Links, cards and pills get the global 2px focus outline from `globals.css`, at 3.3–3.5:1; the
button opts out of it. A keyboard user cannot see where focus is on Apply to Adopt, Details,
Match Quiz, Adopt or Sponsor. This fails WCAG 2.2 success criteria 1.4.11 (non-text contrast) and
2.4.7 (focus visible).

The design-system guard passes regardless, because the focus ring is not among the colour pairs
declared in its `colour contrast` block (`tests/unit/designSystemGuards.test.ts`). See
`contrast-failures-the-design-guard-cannot-see.md`.

**Settles when:** a focused button shows an indicator of at least 3:1 against both the button and
its ground, in light and dark, and the guard declares that pair.
