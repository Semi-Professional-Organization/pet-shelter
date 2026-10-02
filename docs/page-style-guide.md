# Page Style Guide

How a public page is put together: its frame, gutters, vertical rhythm, heading scale, cards and
calls to action. Every rule here was read from the home page — [`Hero.tsx`](../src/components/layout/Hero.tsx),
[`Section.tsx`](../src/components/layout/Section.tsx) and
[`HomeSections.tsx`](../src/components/layout/HomeSections.tsx) — on 2026-10-01. The home page is
the reference; a new page should be indistinguishable from it in rhythm and shape.

This document owns **composition**. Token values — colours, the radius scale, shadows, the button
and card shells — live in [`design-system.md`](design-system.md) and are not repeated here. Where
the two disagree, see §8.

---

## 1. The page frame

A page is a stack of full-bleed bands on `bg-work-ground`, each holding one centred content column.
Do not hand-roll the band — use the primitives:

```tsx
import { Section, SectionHeader } from "@/components/layout/Section";

<Section id="how-it-works">
  <div className="space-y-10">
    <SectionHeader title="…" subtitle="…" />
    {/* content */}
  </div>
</Section>
```

`Section` gives you, in one place:

| Property | Value | px |
|---|---|---|
| Background | `bg-work-ground` | — |
| Vertical padding | `py-16 sm:py-20` | 64 → 80 |
| Content width | `mx-auto w-full max-w-7xl` | 1280 max |
| Side gutter | `px-6 sm:px-8 lg:px-12` | 24 → 32 → 48 |

The gutter is the one number every band on the site shares. A page that needs a band `Section`
cannot express should still use exactly `px-6 sm:px-8 lg:px-12` — `FaqSection` does.

Consecutive sections sit flush; there is no margin between bands. Separation comes from the
section padding, not from gaps or dividers.

## 2. Vertical rhythm inside a section

| Between | Spacing |
|---|---|
| Section header → content | `space-y-10` to `space-y-14` on an inner `<div>` inside `Section` (`space-y-12` is the default) — never on `Section` itself, see §8.3 |
| Editorial rows (image + copy) | `space-y-14` |
| Card grid gutters | `gap-6` |
| Two-column split (image/copy) | `gap-8 lg:gap-14` |
| Wide 12-column split | `gap-8` to `gap-10 lg:gap-16` |
| Stacked items inside a card | `gap-3` (card body) or `space-y-4` |
| Hero stack | `space-y-6` |

Everything sits on Tailwind's 4px grid ([`design-system.md` §7](design-system.md#7-spacing--layout)).

## 3. Type hierarchy

Two families: **Playfair Display** (`font-heading`) for headings, **Geist** (`font-sans`, the body
default) for everything else. Headings are always `font-heading font-bold tracking-tight
text-foreground`; the only thing that changes between levels is size.

| Role | Size classes | px (mobile → desktop) | Notes |
|---|---|---|---|
| **Page H1** (hero) | `text-3xl sm:text-5xl lg:text-6xl` | 30 → 48 → 60 | add `leading-[1.15]`; one per page |
| **Section H2** | `text-3xl sm:text-4xl lg:text-5xl` | 30 → 36 → 48 | via `SectionHeader`, never by hand |
| **Editorial H3** | `text-2xl sm:text-3xl` | 24 → 30 | image/copy rows |
| **Card title** | `text-2xl` (wide card) or `text-xl` (narrow card) | 24 / 20 | |
| **Lead paragraph** | `text-base sm:text-lg leading-relaxed text-muted-foreground` | 16 → 18 | under H1/H2 |
| **Body** | `text-base leading-relaxed text-muted-foreground` | 16 | editorial copy |
| **Card body** | `text-sm leading-relaxed text-muted-foreground` | 14 | |
| **Bullet / highlight** | `text-sm font-medium text-foreground/90` | 14 | with a `size-4 text-primary` icon |
| **Eyebrow** | `text-2xs font-bold uppercase tracking-wider text-primary` | 11 | category label above an H3 or a panel title — **never above the page H1**, which stands alone |
| **Inline CTA link** | `text-xs font-bold uppercase tracking-wider text-primary` | 12 | with a `size-3.5` arrow |
| **Step number** | `font-mono text-2xl font-bold text-foreground` | 24 | numbered process cards |

Naming: the page H1 **is the page name** — the same words as the nav or footer link that leads
there (a fuller form is fine: FAQ → Frequently Asked Questions). A visitor checks the H1 to confirm
they landed where they clicked. Any slogan or pitch goes in the lead paragraph, not the H1. The
home hero is the exception: it has no page name to confirm.

Alignment: every title and its lead paragraph are **left-aligned** — `SectionHeader` is. The
hero (§4) is the single centred exception.

Width: titles and their lead paragraphs span the **full container width** (`max-w-7xl` minus the
gutter), the same as the cards below them — no `max-w-*` on a title block, and `SectionHeader`
does not cap. The home hero is the one exception: centred at `max-w-2xl` (§4).

## 4. The hero

One per page, first band, directly under the navbar.

```tsx
<section className="relative flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden bg-work-ground">
  <div className="relative w-full px-6 py-12 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-2xl space-y-6 text-center">
      <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.15]">…</h1>
      <p className="mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">…</p>
      <div className="flex justify-center pt-1">{/* one primary CTA */}</div>
    </div>
  </div>
</section>
```

- **Height**: fills the viewport minus the 4rem navbar. Use `100dvh`, not `100vh`, so mobile
  browser chrome does not push the CTA off-screen.
- **Padding**: `py-12`, not the section's `py-16 sm:py-20` — the min-height already supplies the
  air. Same side gutter as every section.
- **Alignment**: centred, single column, `max-w-2xl`. The hero is the **only** centred text on the site.
- **One CTA.** The primary button (§6), with a leading and trailing `size-4` icon.
- **Imagery**: transparent cut-outs, not framed photos — no border, no radius, `object-contain`,
  `drop-shadow-xl` so the shadow follows the silhouette. Scattered absolutely at `lg` and up;
  below `lg` they collapse to a `grid grid-cols-4 gap-3 pt-8` row. Position them with inline
  `style`, not arbitrary-percentage classes — see the comment in `Hero.tsx` for why.

Interior pages that do not need a full-viewport hero should still open with an H1 at the hero's
size scale and a full-width lead paragraph, inside a normal `Section` — **left-aligned**, like
every title below the hero. No `mx-auto` and no `text-center` on the block.

## 5. Cards

The home page card — the "panel" — is one recipe, used for action cards, process steps and
side panels:

```tsx
const panel =
  "rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7";
```

| Property | Value |
|---|---|
| Radius | `rounded-3xl` (≈2.53rem, from the `--radius` scale) |
| Surface | `bg-work-panel` — white in light, `#1f2937` in dark — on the `work-ground` band |
| Edge | `border border-border` |
| Elevation | `shadow-xs` |
| Padding | `p-6 sm:p-7` (24 → 28px) |
| Body layout | `flex flex-col gap-3` |

Variants of the same recipe:

- **Linked card** — add `group overflow-hidden transition-colors hover:border-primary/40`. The
  hover is a border tint only; no lift, no scale on the card itself. A trailing arrow may nudge
  `group-hover:translate-x-0.5`.
- **Image card** — move padding off the shell onto the body; image on top at `aspect-4/3` (cards)
  or `aspect-16/10` (editorial rows), `object-cover`, background `bg-work-ground` while loading.
  The card's `overflow-hidden` rounds the image; do not round it separately.
- **Standalone editorial image** — the same `rounded-3xl border border-border bg-work-panel` with
  no padding.

Nested elements step **down** the radius scale so corners stay concentric:

| Element | Recipe |
|---|---|
| Inner tile inside a panel | `rounded-xl border border-border bg-background p-4` |
| Muted inset block | `rounded-2xl border border-border bg-muted/30 p-5` |
| Icon tile | `flex size-10 items-center justify-center rounded-xl bg-muted text-foreground`, icon `size-5` |
| Small icon tile | `size-8 rounded-lg bg-foreground text-background` |
| Panel header rule | `pb-3 border-b border-border` |

Grids: `grid grid-cols-1 gap-6`, widening to `md:grid-cols-3` for equal cards or `lg:grid-cols-3`
when one column stacks two smaller cards.

## 6. Calls to action

- **Primary button** — `buttonVariants({ size: "lg", className: "gap-2" })` from
  [`button.tsx`](../src/components/ui/button.tsx). Use a `Link` with that class for navigation.
  The shell already supplies the radius, uppercase tracked label and shadow; do not restyle them
  (see §8 for why).
- **Inline text CTA** — inside a card, the uppercase `text-primary` label from §3 with an arrow.
  Not a button.
- **One primary button per band.** Secondary actions use `variant="outline"` or the inline CTA.

## 7. Responsive rules

- Breakpoints used: `sm` (640), `md` (768), `lg` (1024). Layouts are single-column until `md` or
  `lg`; nothing goes multi-column below `sm`.
- Everything scales at the same breakpoints as the gutter: type, padding and gutters step at
  `sm`, layout steps at `lg`.
- Decorative absolute positioning is `lg`-only. Below it, turn the same assets into an honest
  grid row rather than squeezing the scatter.

## 8. Known divergences

Recorded so a new page copies the intent, not the drift.

1. **Hero CTA overrides are partly dead.** `Hero.tsx` passes `px-6 text-sm font-bold tracking-wide
   rounded-xl shadow-xs` into `buttonVariants`, which concatenates without merging. Checked in the
   compiled dev CSS (built 2026-09-28): the later rule wins at equal specificity, so `rounded-xl`
   and `shadow-xs` take effect while `text-sm`, `font-bold`, `tracking-wide` and `px-6` lose to the
   shell's `text-xs`, `font-semibold`, `tracking-widest` and `px-8`. Use the plain shell (§6).
2. **Home panels are not the `Card` component.** `ui/card.tsx` is `rounded-card` (1.4rem) +
   `ring-1` + `shadow-brand-lg`; every home-page panel is `rounded-3xl` + `border` + `shadow-xs` on
   `bg-work-panel`. Public pages follow the home panel (§5). Until the two are reconciled, do not
   mix them in one view.
3. **`<Section className="space-y-…">` spaces nothing.** `Section` puts `className` on the outer
   `<section>`, but renders children inside its own inner `<div>`, so a `space-y-*` there applies
   to one child. Home's `our-work` and "Join us" sections pass spacing that way; `how-it-works`
   wraps its children in a `<div className="space-y-10">`, which is the pattern that works (§1).
