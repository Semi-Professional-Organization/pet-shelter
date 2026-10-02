# Design System & Component Reference

This document defines the visual identity, color palette, typography, and component shape language for the pet-shelter application.

> **These rules are enforced.** `tests/unit/designSystemGuards.test.ts` fails the build on a raw
> palette utility, a hardcoded hex, an arbitrary type/radius/shadow value, an undeclared design-system
> class, or a tone slot missing from either theme. It runs in `npm test`. If you are about to write
> something this document forbids, the suite will say so before review does — see
> [`docs/tasks/TARGET_DESIGN_SYSTEM_GUARDS.md`](tasks/TARGET_DESIGN_SYSTEM_GUARDS.md) for why.

---

## 1. Color

The palette is intentionally warm, approachable, and rescue-focused, derived from the primary paw
icon. Nothing in `src/` names a color directly. Every value is declared once as a token in
[`src/app/globals.css`](../src/app/globals.css) — in `:root` and again in `.dark` — and exposed to
Tailwind through the `@theme inline` map. Because the generated utility resolves to `var(--token)`
rather than a literal, `bg-success-surface` already adapts to the theme.

**That indirection is the point**: pairing a token utility with a `dark:` variant recreates the ~180
hand-written overrides that had drifted out of sync with their light counterparts. Write the token
utility alone.

### 1.1 Brand surface tokens

The frame every page sits in: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
`muted`, `accent`, `accent-subtle`, `destructive`, `border`, `input`, `ring`, plus the `frame-*`,
`brand-mark*` and `control-*` groups. `destructive` is not a colour of its own: it is
the same red as `--tone-danger-text` in both themes, because a destructive control and a rejected
application mean the same thing — `designSystemGuards` fails the build if the two part company. See
[`TARGET_DESTRUCTIVE_BRAND_SEPARATION.md`](tasks/TARGET_DESTRUCTIVE_BRAND_SEPARATION.md). Consume them as `bg-background`, `text-muted-foreground`,
`border-border`, and so on. Read the current values from `globals.css` — they are not duplicated here,
because a copy is a copy that goes stale.

### 1.2 Semantic tones — pick by meaning, never by hue

Seven tones, seven slots each. A component says what a thing *means* and the token layer decides what
color that is:

| Tone | Meaning |
|------|---------|
| **success** | verified · available · approved · payment received |
| **warning** | pending · needs attention · caution |
| **info** | informational · scheduled · submitted |
| **care** | under rehabilitation or veterinary care |
| **danger** | rejected · urgent · negative |
| **highlight** | the extra distinguishable color, with no fixed meaning — for legends that have run out of meaning tones. Reach for it last. |
| **neutral** | adopted · archived · inert |

| Slot | Use |
|------|-----|
| `surface` | tinted panel |
| `surface-strong` | emphasised panel |
| `border` | border on a tinted panel |
| `text` | readable on `surface` |
| `accent` | icon or rule on the page background |
| `solid` | filled badge |
| `on-solid` | text on that fill |

Used two ways. Directly, as a utility — `bg-care-surface`, `text-care-text`, `border-care-border` —
or, preferably, by composing a **tone class** with a **shell**: `class="tone-soft tone-care"`. The
tone class remaps a local `--tone-*` group and does nothing else, so every shell works with every
tone and a status surface can be restyled in one place.

The shells are declared in the `@layer components` block of `globals.css`: `tone-soft`,
`tone-panel-strong`, `tone-pill`, `tone-chip` (+ `tone-chip-pill`), `tone-ink`, `eyebrow`,
`receipt` (+ `receipt-panel`, `receipt-accent`) and `segmented` (+ `segmented-thumb`).

Two things that look reasonable and are not:

- **A variant on a shell** — `dark:tone-ink`, `hover:tone-soft` — compiles to nothing. Tailwind
  generates variants for utilities, not for classes in `@layer components`, so the element silently
  keeps its base styling.
- **A tone or slot that does not exist** — `tone-success-strong`, `bg-alert-surface` — also compiles
  to nothing, and renders unstyled rather than throwing.

Status → tone mapping lives in [`src/lib/presentation/`](../src/lib/presentation), not in components.

### 1.3 The two deliberate exceptions

- **HTML email** (`src/lib/email.ts`, `src/actions/settings.ts`) uses the hex token mirror in
  [`src/lib/presentation/emailTokens.ts`](../src/lib/presentation/emailTokens.ts). Mail clients
  support neither custom properties nor Tailwind, so a token would arrive colourless; the mirror is
  verified by `designSystemGuards.test.ts` to match computed `:root` tokens.
- **The printed tax receipt** (`--receipt-*`) is fixed, and deliberately absent from `.dark`. A
  Sec 44(6) receipt is black ink on white paper in every theme and has to survive a monochrome
  printer.

---

## 2. Shape Language & Border Radius

The design follows a **soft, semi-rounded** approach (the "squircle" direction) to convey warmth and approachability without becoming playful or unserious.

### Border Radius Guide

The scale derives from `--radius` (1.15rem), so changing that one value reshapes the whole app.
`rounded-3xl` and `rounded-4xl` are overridden too — Tailwind's defaults (1.5rem / 2rem) would
otherwise land *below* this project's `rounded-2xl` and invert the scale.

| Step | CSS Value | Use |
|------|-----------|-----|
| `rounded-sm` … `rounded-4xl` | `calc(--radius × 0.6)` … `× 2.6` | The general scale |
| `rounded-mark` | 1rem | The logo tile |
| `rounded-control` | 1.25rem | Buttons, navbar, segmented controls |
| `rounded-card` | 1.4rem | Card surfaces |
| `rounded-dialog` | 1.6rem | Modals |
| `rounded-md` / `rounded-lg` | from the scale | Badges, pills, small tags |

### Practical Application

- **Do**: Use the named shapes for the four shells that have one; the general scale otherwise.
- **Do**: Apply radius to both background shapes and border strokes for cohesion.
- **Don't**: Mix sharp corners with soft rounded corners in the same visual section.
- **Don't**: write `rounded-[1.4rem]`. An arbitrary radius is invisible to `--radius` and fails
  `designSystemGuards`. If a shape is genuinely missing, add the step to `globals.css`.

---

## 3. Shadows & Depth

Shadows are subtle and warm-toned to maintain the soft, approachable aesthetic.

### Shadow System

Warm-tinted, so shadows sit on cream without reading as grey. Five named steps, declared in
`globals.css`; an inline `shadow-[…]` fails `designSystemGuards`.

| Step | Use Case |
|------|----------|
| `shadow-brand-xs` | Borders and minimal elevation |
| `shadow-brand-sm` | Interactive hover states |
| `shadow-brand-md` | Lifted controls |
| `shadow-brand-lg` | Card surfaces, lifted content |
| `shadow-brand-xl` | Modal overlays, prominent surfaces |

---

## 4. Typography

### Font Family

- **Headings**: Playfair Display, as `font-heading` (`--font-heading`, loaded in `src/app/layout.tsx`)
- **Body**: Geist, as `font-sans` (the `<body>` default)
- **Mono**: Geist Mono, as `font-mono`

### Type Scale

Page-level headings and their responsive steps are owned by
[`page-style-guide.md` §3](page-style-guide.md#3-type-hierarchy); the H1/H2 rows below mirror it.

| Element | Size | Weight | Line Height | Tailwind Class |
|---------|------|--------|-------------|----------------|
| **H1 / Page Title** | 30 → 48 → 60px | 700 (bold) | 1.15 | `font-heading text-3xl sm:text-5xl lg:text-6xl font-bold` |
| **H2 / Section Title** | 30 → 36 → 48px | 700 (bold) | — | `SectionHeader` (`text-3xl sm:text-4xl lg:text-5xl`) |
| **H3 / Subsection** | 1.5rem / 24px | 600 (semibold) | 1.4 | `text-2xl font-semibold` |
| **Body / Paragraph** | 1rem / 16px | 400 (normal) | 1.6 | `text-base` |
| **Small / Caption** | 0.875rem / 14px | 400 (normal) | 1.5 | `text-sm` |
| **Tiny / Badge** | 0.75rem / 12px | 500 (medium) | 1.4 | `text-xs font-medium` |
| **Metadata label** | 0.6875rem / 11px | 700 (bold) | 1.15 | `text-2xs` |
| **Eyebrow / fine print** | 0.625rem / 10px | 700 (bold) | 1.0 | `text-3xs`, or the `eyebrow` shell |

The scale is extended below `xs` rather than reached around: `text-[10px]` and `text-[11px]` are what
`text-3xs` and `text-2xs` replaced, and `designSystemGuards` rejects them.

---

## 5. Component-Specific Guidance

Each entry below was read from the component on 2026-08-28. Where a shape or elevation is named, it
is the token, not a measured pixel value — resolve it in `globals.css` rather than restating it here.

### Buttons

[`src/components/ui/button.tsx`](../src/components/ui/button.tsx) — a `cva` shell over
`@base-ui/react/button`.

The base shell is the brand signature and applies to *every* variant: `rounded-control`,
`shadow-brand-xs`, and `text-xs font-semibold uppercase tracking-widest`. **Buttons in this app are
uppercase tracked labels**, not sentence-case text — a new button that does not look like that is
almost certainly bypassing the shell.

- **Variants** (6): `default` (primary coral, `shadow-brand-md`), `outline` (bordered, translucent
  card fill), `secondary` (blush), `ghost` (hover wash only), `destructive` (tinted, not solid — it
  is `bg-destructive/10` with destructive text), `link` (underlined, no box).
- **Sizes** (8): `default` `h-10`, `xs` `h-7`, `sm` `h-9`, `lg` `h-11`, plus the square
  `icon`, `icon-xs`, `icon-sm`, `icon-lg`. There is no `md`.
- **Disabled**: `opacity-50` and `pointer-events-none` — the fill is not swapped for a muted colour.
- **Focus**: `focus-visible:border-ring` plus `ring-2 ring-ring/30`.
- **Invalid**: `aria-invalid:` swaps the border and ring to `destructive`, so a form control wired to
  `aria-invalid` styles itself.

### Cards

[`src/components/ui/card.tsx`](../src/components/ui/card.tsx)

- **Surface**: `bg-card`, `rounded-card`, `shadow-brand-lg`.
- **Edge**: `ring-1 ring-border` — a **ring, not a border**. This matters when composing: adding
  `border` to a card gives it two concentric edges.
- **Padding**: driven by one custom property, `--card-spacing`, set to `--spacing(8)` (2rem) and
  dropped to `--spacing(5)` (1.25rem) by `data-size="sm"`. Header, content and footer all read the
  same variable, which is what keeps their horizontal padding aligned. Override the variable, not
  the individual paddings.

### Dialogs / Modals

[`src/components/ui/dialog.tsx`](../src/components/ui/dialog.tsx)

- **Surface**: `bg-popover`, `rounded-dialog`, `shadow-brand-xl`, `ring-1 ring-border`.
- **Overlay**: `bg-black/20` with `backdrop-blur-sm` — a light scrim over a blur, not a heavy dim.
- **Box**: `p-6`, `gap-6`, `sm:max-w-md`, centred by translate.

### Navbar

[`src/components/layout/Navbar.tsx`](../src/components/layout/Navbar.tsx)

- **Frame**: `sticky top-0`, `h-16` (4rem), `bg-card/95` with `backdrop-blur-md`, and
  `border-b border-border`. It is a **flat translucent bar — there is no gradient.**
- **Logo tile**: `size-9`, `rounded-mark`, `bg-brand-mark`, `ring-1 ring-brand-mark-ring`,
  `shadow-brand-sm`. This is what `--radius-mark` and the `brand-mark` tokens exist for.

### Form Inputs

[`src/components/ui/input.tsx`](../src/components/ui/input.tsx)

**Inputs in this app are underlines, not boxes.** Worth stating plainly, because it is the one place
the shape language deliberately departs from the rounded surfaces everywhere else:

- **Edge**: `border border-transparent` with only `border-b-input` visible — a single bottom rule.
- **Radius**: none. Do not add one.
- **Box**: `h-10`, `px-0`, `py-1`. The field is flush with its label, not inset.
- **Focus**: `focus-visible:border-b-ring` — the bottom rule changes colour. There is **no focus
  ring** on inputs, unlike buttons.
- **Invalid**: `aria-invalid:border-b-destructive`.
- **Placeholder**: `text-muted-foreground`, with the global `::placeholder` rule adding `/70`.

---

## 6. Brand Asset Reference

### Logo & Icon

Wired up in [`src/app/layout.tsx`](../src/app/layout.tsx):

- **Favicon**: `/favicon-32x32.png`, `/favicon-96x96.png`, with `/favicon.ico` as fallback
- **Apple**: `/apple-icon-180x180.png`, `/apple-icon-precomposed.png`
- **PWA / tiles**: `/manifest.json` and `/browserconfig.xml`

`public/` also carries the full `android-icon-*`, `apple-icon-*`, `ms-icon-*` and `favicon-16x16`
sets that these three files select from. `/public/uploads/` is runtime pet imagery, not brand assets.

All brand assets should be referenced from `public/` and should maintain the warm coral / cream
scheme.

---

## 7. Spacing & Layout

Follow Tailwind's default 4px grid for consistency:

- **XS**: 0.25rem (4px)
- **SM**: 0.5rem (8px)
- **MD**: 1rem (16px)
- **LG**: 1.5rem (24px)
- **XL**: 2rem (32px)
- **2XL**: 3rem (48px)

Use Tailwind's spacing utilities (`p-`, `m-`, `gap-`) rather than custom pixel values. Verified
2026-08-28: `--spacing` is not overridden, and no arbitrary `p-[…]` / `m-[…]` / `gap-[…]` exists in
`src/`.

**Arbitrary values are not banned outright** — only on the colour, type, radius and elevation scales
(§1–§4). A *layout dimension* is not a design token, so `min-h-[360px]`, `max-w-[200px]`,
`w-[95vw]`, `grid-cols-[1fr_auto]`, `leading-[1.15]` and the width senses of `stroke-[2.5]` /
`ring-[3px]` are all legitimate and are what every arbitrary value in `src/` currently is. Card and
dialog padding is the better pattern where it fits: one `--card-spacing` variable that the whole
shell reads (§5).

---

## 8. Accessibility & Contrast

- WCAG **AA** for body text (4.5:1) is **enforced**, not aspirational. `designSystemGuards.test.ts`
  measures every pairing the vocabulary promises — each tone's `text` on `surface` and on
  `surface-strong`, `on-solid` on `solid`, every `*-foreground` on its own surface, `--primary` and
  `--destructive` in both directions, and the receipt inks on paper — in **both** themes, and fails
  the build below 4.5:1. Translucent tokens are composited onto the page background first, because
  `.dark` declares all seven tone surfaces with alpha and skipping them would exempt half the
  palette while reporting green.
- This replaced a hedge, and the hedge was justified: when the sweep was first run, `:root`'s
  `--primary` was **2.90:1** as text on cream and **3.00:1** under white text — below AA in both
  directions, across 262 utility uses, with the default button rendering it at 12px. It was darkened
  to `#b2594f` (hue and chroma held, lightness down 11 points). Everything else already passed.
  See [`TARGET_LIGHT_PRIMARY_CONTRAST.md`](tasks/TARGET_LIGHT_PRIMARY_CONTRAST.md).
- **Non-text contrast is deliberately not asserted.** WCAG's 3:1 rule covers boundaries required to
  understand content; a tinted `border` on its own tinted `surface` is decorative, and the panel is
  distinguished by its fill. Asserting those would fail sixteen legitimate design choices. If you add
  a boundary that genuinely carries meaning on its own, measure it by hand.
- Focus states must always be visible. Note the two mechanisms differ by control: buttons use a
  `ring-2 ring-ring/30`, inputs use a bottom-border colour change (§5). Do not "fix" an input to
  match a button.
- Colour must never be the only carrier of meaning — pair a tone with an icon, a label or a border.
  The seven tones are meanings first (§1.2); the colour is how they are shown, not what they are.

---

## 9. When to Request Design Review

Several of the old review triggers are now enforced automatically and no longer need a human:
a raw palette utility, a hardcoded hex, an arbitrary radius/type/shadow, an undeclared class or a
missing tone slot all fail `npm test`. See the note at the top of this document.

What still needs a person, because no test can judge it:

1. Adding a component type not listed in §5
2. Adding an **eighth tone** — the taxonomy is meanings, and a new one is a claim that the app makes
   a distinction the existing seven cannot
3. Adding a step to the type, radius or elevation scale (the guard checks you used *a* step, not that
   the step was the right one)
4. Choosing *which* tone a new status maps to
5. Departing from the shape language the way inputs deliberately do (§5)

---

## Quick Reference

[`src/app/globals.css`](../src/app/globals.css) is the single source of truth, in four numbered
sections: **1. Tokens** (`:root`, `.dark`, `@theme inline`), **2. Base** (element defaults),
**3. Components** (the shells), **4. Print** (receipt isolation). Values are `oklch()` or hex; the
`@theme inline` map is what turns each one into a Tailwind utility.

Access in components via the generated utility — `bg-background`, `text-foreground`, `border-border`,
`bg-care-surface`, `rounded-card`, `shadow-brand-lg` — or by composing a tone class with a shell,
`class="tone-soft tone-care"`. Never `var()` at a call site, never a literal.

| Want to… | Do |
|---|---|
| add a color | declare `--x` in **both** `:root` and `.dark`, map it in `@theme inline`, then use `bg-x` |
| add a status color | reuse one of the seven tones; add a tone only if the *meaning* is new |
| add a recurring shell | declare it in `@layer components` and use it — an unused class fails the guard |
| use a one-off size | add the step to the scale rather than inlining `text-[13px]` |

**Enforced by**: [`tests/unit/designSystemGuards.test.ts`](../tests/unit/designSystemGuards.test.ts).

---

**Last Updated**: 2026-08-27
