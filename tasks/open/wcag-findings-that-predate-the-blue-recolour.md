# WCAG findings that predate the blue recolour

**Status:** open · opened 2026-10-28

The `wcag-auditor` pass over the 2026-10-28 home recolour found these. None was caused by it, so
they were recorded rather than fixed (the three it did cause — dark-mode header text, dark-mode
focus on the bar and on filled buttons, the light scrollbar thumb — were fixed the same day).
Measured with Playwright against the dev server; details in that session's audit report.

- **Header overflows at 1024–1060px (EN) and up to 1180px (MS)** — WCAG 1.4.4 / 1.4.10. The
  desktop nav switches on at `lg` inside a fixed `h-16`; labels wrap to 3–4 lines and the top of
  "Hope for Strays" is cut off. Candidate fix: move `lg:flex` / `lg:hidden` in `Navbar.tsx` to `xl:`.
- **Hero cut-outs float forever** — WCAG 2.2.2 (Level A). Only `prefers-reduced-motion` stops
  them (`.hero-animal-float` in `globals.css`); there is no on-page pause.
- **Nav dropdowns drop focus on Escape** — WCAG 2.4.3. Focus goes to `<body>`; tabbing out leaves
  the panel open; `aria-haspopup="true"` promises a menu the panel is not. Disclosure pattern
  (`aria-expanded` + `aria-controls`, Escape returns focus to the trigger) is the fix.
- **Logo alt repeats the link text** — WCAG 1.1.1, low. `alt="Hope for Strays"` inside a link that
  already says it; use `alt=""`.
- **Carousel arrows and several header labels are English-only** — WCAG 3.1.2, low. (The home
  carousel region is named by its heading since 2026-10-29, `aria-labelledby` in `BulletinFeed`.) "Previous slide", "Next slide", "Open Navigation Menu", the theme and
  language toggles. The new notice dots are translated (`bulletins.goToNotice`).

**Settles when:** each item is fixed or consciously accepted by the owner.
