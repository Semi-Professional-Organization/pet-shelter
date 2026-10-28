/**
 * The hex mirror of the light-theme design tokens, for HTML email.
 *
 * ## Why a mirror exists at all
 *
 * `src/app/globals.css` is the single source of truth for colour, and every surface in
 * `src/` reads it through a generated Tailwind utility that resolves to `var(--token)`.
 * Mail clients support neither custom properties nor `oklch()`, so an email that referenced
 * a token would arrive at the donor's inbox as colourless markup. This module is the one
 * place allowed to restate those values as literal hex — and
 * `tests/unit/designSystemGuards.test.ts` proves every entry below still equals the computed
 * value of the token it names. A drifted value fails the build; it does not quietly ship a
 * shelter-branded app with slate-and-sky email, which is the state this replaced.
 *
 * ## The naming rule is the mapping
 *
 * There is deliberately no `{ constant → token }` lookup table anywhere, here or in the
 * guard. A table would be the palette written a third time, and this repo's recurring defect
 * is exactly that: one value maintained in two places by hand until it isn't. Instead the
 * key *is* the token name, by a rule the guard recomputes:
 *
 * - `EMAIL_BRAND.mutedForeground` mirrors `--muted-foreground`
 * - `EMAIL_TONE.care.surface`     mirrors `--tone-care-surface`
 * - `EMAIL_RECEIPT.inkAccent`     mirrors `--receipt-ink-accent`
 *
 * camelCase → kebab-case, and nothing else. Adding an entry therefore adds its own parity
 * assertion; misspelling one fails loudly, because the guard treats a token it cannot find
 * as an error rather than skipping it.
 *
 * ## Light theme only, on purpose
 *
 * `.dark` is not mirrored and its absence is not an oversight. A mail client does not carry
 * the app's `.dark` class, and `prefers-color-scheme` support across clients is inconsistent
 * enough that a dark email palette is its own piece of work. Email renders the `:root`
 * values.
 *
 * Background: `docs/tasks/TARGET_EMAIL_COLOUR_PARITY.md`.
 */

/**
 * The seven meanings the design system recognises, in the order `globals.css` declares them.
 *
 * This module is the only one in `src/` that has to enumerate all seven — everywhere else a
 * component names the one tone it means — so the list lives here rather than in a module of
 * its own. `designSystemGuards.test.ts` asserts it matches the tone contract exactly, so it
 * cannot fall behind an eighth tone.
 */
export const DESIGN_TONES = [
  "success",
  "warning",
  "info",
  "care",
  "danger",
  "highlight",
  "neutral",
] as const;

export type DesignTone = (typeof DESIGN_TONES)[number];

/**
 * The three slots email uses, of the seven the token layer declares.
 *
 * `surface` + `text` is the soft badge (what `.tone-soft` and `.tone-chip` render in-app);
 * `accent` is the rule down the side of a callout card. The other four slots
 * (`surface-strong`, `border`, `solid`, `on-solid`) are deliberately not mirrored: nothing
 * in the email builders renders them, and an unused mirror entry is a value nobody checks
 * against a design nobody sees.
 */
export type ToneSlot = "surface" | "text" | "accent";

/** The frame every email sits in — the same brand surfaces the app's shell is built from. */
export const EMAIL_BRAND = {
  /** Page background behind the message card. */
  background: "#fff8f4",
  /** Body copy. */
  foreground: "#4a2c20",
  /** The message card itself. */
  card: "#fffdfb",
  /** Hairlines: the card edge, the footer rule. */
  border: "#ecd7d0",
  /** The footer band. */
  muted: "#f7efe9",
  /** Secondary copy — fine print, captions, footers. */
  mutedForeground: "#6b4c4a",
  /** Light blue. The header band and the call-to-action button — a fill, never text. */
  primary: "#9bcfe5",
  /** Text on `primary`. */
  primaryForeground: "#4a2c20",
  /** Blue at text strength, for a heading in the accent. */
  primaryInk: "#1f6a8f",
} as const satisfies Record<string, string>;

/**
 * Every tone, so a status cannot read one colour in the app and another in the inbox.
 *
 * All seven are present including `care`, `neutral` and `highlight`, which previously had no
 * email representation at all — a notification about an animal under veterinary care fell
 * back to the informational sky badge. `email.ts` generates one badge rule and one card rule
 * per entry, so a new tone gets an email presence by construction rather than by someone
 * remembering to add one.
 */
export const EMAIL_TONE = {
  success: { surface: "#ecfdf5", text: "#006045", accent: "#009966" },
  warning: { surface: "#fffbeb", text: "#973c00", accent: "#e17100" },
  info: { surface: "#f0f9ff", text: "#00598a", accent: "#0084d1" },
  care: { surface: "#eef2ff", text: "#372aac", accent: "#4f39f6" },
  danger: { surface: "#fef2f2", text: "#9f0712", accent: "#e7000b" },
  highlight: { surface: "#faf5ff", text: "#6e11b0", accent: "#9810fa" },
  neutral: { surface: "#fafafa", text: "#27272a", accent: "#71717b" },
} as const satisfies Record<DesignTone, Record<ToneSlot, string>>;

/**
 * The statutory receipt group — black ink on white paper, in every theme.
 *
 * These are the one token group already shaped for print and email: `--receipt-*` is
 * deliberately absent from `.dark` because a Sec 44(6) receipt has to survive a monochrome
 * printer. The emailed receipt mirrors them rather than the tone palette, so the printed and
 * the emailed receipt for the same donation finally match.
 */
export const EMAIL_RECEIPT = {
  /** The paper. */
  paper: "#ffffff",
  /** Headings and figures. */
  ink: "#18181b",
  /** Body copy on the receipt. */
  inkSoft: "#3f3f46",
  /** Field values. */
  inkMuted: "#52525c",
  /** Field labels and fine print. */
  inkFaint: "#71717b",
  /** Row separators and the header rule. */
  rule: "#e4e4e7",
  /** The inset panel behind the tax notice. */
  panel: "#fafafa",
  /** The total received. Fixed green, not `--tone-success-accent`: that one lightens in dark
   *  mode and would vanish against the receipt's permanently white paper. */
  inkAccent: "#007a55",
} as const satisfies Record<string, string>;
