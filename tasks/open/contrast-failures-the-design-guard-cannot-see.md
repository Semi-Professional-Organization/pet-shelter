# Text-contrast failures the design guard cannot see

**Status:** open · opened 2026-10-20

`tests/unit/designSystemGuards.test.ts` passed 99/99 on master and 105/105 on `feature/frontend`
on 2026-10-20. The same day, these pairs measured below WCAG AA for text (4.5:1) in a browser.

**Both branches**
- White on `--brand-whatsapp`: 1.98:1 (the WhatsApp buttons).
- `text-success-accent` used as text on a card: 3.6:1 (prices on `/needs`, "Adoption Fee" on profiles).
- `text-primary` on tinted primary washes: 3.42–4.45:1 (eyebrow chips on `/donate`, `/needs`,
  `/applications/track`).

**`feature/frontend` only**
- `text-primary` on `--work-ground`: 4.3:1. Every eyebrow inside a `Section` band lands on this
  pair, because `Section` bakes in that ground.
- Dark mode, the primary text colour on `--work-panel`: 4.48:1.

**master only**
- The "100% Free Adoption" badge on `bg-primary/95`: 4.3:1.
- Muted counters with an opacity modifier: 3.53–3.58:1.
- `/transparency` chart labels: 2.82–4.42:1 in light, 3.41–3.88:1 in dark.
- Dark-mode warning text on the white receipt panel (`DonationQrPanel.tsx:232`): 1.45:1.

**Why the guard misses them.** Its `colour contrast` block checks a `BRAND_PAIRS` list (foreground,
muted, primary, secondary, accent and destructive against their grounds) plus the tone text/surface
pairs. None of the pairs above is on it, so the suite is green while the pages fail. Colours are
due to be redone; this list is the measurement that redo needs.

**Settles when:** every text-colour/ground pair the UI renders is either declared in the guard or
shown to be unused, and the guard fails on each pair above until that pair is fixed.
