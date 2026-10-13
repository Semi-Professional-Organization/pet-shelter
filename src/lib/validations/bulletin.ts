import { z } from "zod";

import {
  isAllowedBulletinEmbedUrl,
  isAllowedBulletinImageUrl,
  BULLETIN_EMBED_HOSTS,
} from "@/lib/domain/bulletinMedia";

/**
 * The bulletin category vocabulary.
 *
 * One of four places this list appears, all held in step deliberately: the
 * `BulletinCategory` union in `@/types/bulletin`, the `BulletinCategory` enum in
 * `prisma/schema.prisma`, the `BULLETIN_CATEGORY_PRESENTATION` table in
 * `@/lib/presentation/bulletinPresentation`, and here. The first three are
 * checked against each other by a compile-time assertion in
 * `@/lib/server/bulletinRepository`; this schema is checked against the union by
 * `tests/unit/bulletins.test.ts`.
 */
export const BULLETIN_CATEGORIES = [
  "announcement",
  "urgent_need",
  "event",
  "happy_tail",
  "clinic",
] as const;

export const BULLETIN_TARGET_PAGES = ["all", "home", "pets", "bulletins"] as const;

export const BULLETIN_MEDIA_TYPES = ["none", "image", "video"] as const;

export const bulletinCategorySchema = z.enum(BULLETIN_CATEGORIES);
export const bulletinTargetPageSchema = z.enum(BULLETIN_TARGET_PAGES);
export const bulletinMediaTypeSchema = z.enum(BULLETIN_MEDIA_TYPES);

/** Empty textarea → `undefined`, so clearing a field removes it instead of storing "". */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (maximum ${max.toLocaleString()} characters)`)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

const optionalUrl = () =>
  z
    .string()
    .trim()
    .max(2048, "URL is too long (maximum 2,048 characters)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

/**
 * True only for a day that exists.
 *
 * `Date.parse("2026-02-31T00:00:00Z")` does **not** return NaN — it rolls the
 * surplus days forward and yields 3 March. So a "does this parse" check accepts
 * 31 February and the card then prints a different day from the one that was
 * typed, which for a notice is the whole content. Round-tripping the parsed
 * value back to its parts is what catches it.
 */
/**
 * How far ahead a notice date may be.
 *
 * Post-dating is intended — a clinic is announced before it happens — so this
 * is a sanity ceiling, not a "no future dates" rule. It exists because the feed
 * has no `publishedAt <= now` predicate and sorts `publishedAt` DESC, while `/`
 * and `/pets` show only two notices. So `2062-08-14`, one slipped digit from
 * `2026-08-14`, publishes immediately, sorts above every real notice, and holds
 * one of those two slots for thirty-six years with nothing on screen saying
 * why newer notices stopped appearing.
 */
const MAX_YEARS_AHEAD = 5;

function isRealCalendarDay(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  // Postgres has no year zero, so accepting it trades a clear "that date does
  // not exist" on the date field for `date/time field value out of range` from
  // the driver, surfaced as the action's generic failure with no field named.
  if (year < 1) return false;
  // `Date.UTC(99, ...)` means 1999, not year 99 — the two-digit-year mapping is
  // older than the API. Without setUTCFullYear the round-trip below would fail
  // for every year 0000-0099 and refuse a syntactically valid date with "that
  // date does not exist", which is untrue. Unreachable from an <input
  // type="date">, but a false refusal in new validation code all the same.
  const parsed = new Date(Date.UTC(2000, month - 1, day));
  parsed.setUTCFullYear(year);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const IMAGE_HOST_MESSAGE =
  "Image URL must be an https link on a host this site is configured to load " +
  "(see images.remotePatterns in next.config.ts). An image elsewhere will not render.";

const EMBED_HOST_MESSAGE =
  `Video embed URL must be an https embed link on one of: ${BULLETIN_EMBED_HOSTS.join(", ")}. ` +
  "Use the embed link, not the page link.";

/**
 * Payload accepted by the admin create/update actions.
 *
 * Note what is NOT here: `authorName`. The byline is taken from the verified
 * session by the action, never from the form — otherwise any CONTENT_EDITOR
 * could publish a notice under a colleague's name, or under "Veterinary Team"
 * without being on it. `id`, `createdAt` and `updatedAt` are likewise the
 * database's to set.
 *
 * Malay fields are optional: staff may publish an English notice and translate
 * it later. Nothing renders them yet — see the note on `Bulletin` in
 * `@/types/bulletin`.
 */
export const bulletinFormSchema = z
  .object({
    category: bulletinCategorySchema,
    targetPage: bulletinTargetPageSchema.default("all"),
    title: z
      .string()
      .trim()
      .min(8, "Title must be at least 8 characters")
      .max(200, "Title is too long (maximum 200 characters)"),
    content: z
      .string()
      .trim()
      .min(15, "Content must be at least 15 characters")
      .max(5000, "Content is too long (maximum 5,000 characters)"),
    titleMs: optionalText(200, "Malay title"),
    contentMs: optionalText(5000, "Malay content"),
    mediaType: bulletinMediaTypeSchema.default("none"),
    mediaUrl: optionalUrl(),
    videoEmbedUrl: optionalUrl(),
    isPinned: z.boolean().default(false),
    isPublished: z.boolean().default(true),
    /**
     * The notice date the card prints. Accepted as `YYYY-MM-DD` rather than a
     * datetime because that is what an editor is choosing — a day, not an
     * instant — and because a datetime would drag the browser's timezone into a
     * value the shelter means locally.
     */
    publishedAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD form")
      .refine(isRealCalendarDay, { message: "That date does not exist" })
      .refine(
        (v) => Number(v.slice(0, 4)) <= new Date().getUTCFullYear() + MAX_YEARS_AHEAD,
        {
          message:
            `That date is more than ${MAX_YEARS_AHEAD} years away — check the year. ` +
            "A far-future notice sorts above every real one and holds a slot on the " +
            "home page until it passes.",
        }
      ),
  })
  /**
   * A URL is required, and its host checked, only for the media type that will
   * actually render it.
   *
   * Both halves matter. A type without its URL is a notice whose picture
   * silently never appears — the editor saved what looked like a complete form
   * and got a plain card.
   *
   * And the checks are conditional rather than unconditional because the form
   * only *renders* the field belonging to the selected type. An editor who
   * pastes a link this site cannot load, is told so, and then gives up by
   * switching the type to None would otherwise still be unable to save: the
   * stale value keeps failing, and the input naming it is no longer on screen.
   * Ignoring it is safe because `editablePayload` in the repository nulls the
   * URL that does not belong to the stored type, so nothing unvalidated is
   * ever written or read back.
   */
  .superRefine((v, ctx) => {
    if (v.mediaType === "image") {
      if (!v.mediaUrl) {
        ctx.addIssue({
          code: "custom",
          message: "Choose an image URL, or set media type to None.",
          path: ["mediaUrl"],
        });
      } else if (!isAllowedBulletinImageUrl(v.mediaUrl)) {
        ctx.addIssue({ code: "custom", message: IMAGE_HOST_MESSAGE, path: ["mediaUrl"] });
      }
    }

    if (v.mediaType === "video") {
      if (!v.videoEmbedUrl) {
        ctx.addIssue({
          code: "custom",
          message: "Choose a video embed URL, or set media type to None.",
          path: ["videoEmbedUrl"],
        });
      } else if (!isAllowedBulletinEmbedUrl(v.videoEmbedUrl)) {
        ctx.addIssue({ code: "custom", message: EMBED_HOST_MESSAGE, path: ["videoEmbedUrl"] });
      }
    }
  })
  /**
   * Drop the URL that does not belong to the selected media type.
   *
   * The check above deliberately ignores it, so without this the parsed output
   * could still *carry* an unvalidated string — a `javascript:` URL among
   * them — and the only thing keeping it out of the database would be
   * `editablePayload` in the repository. That is a guarantee living in another
   * module, invisible to a future bulk import, patch route, or anything else
   * that takes `BulletinFormValues` and writes `values.videoEmbedUrl`, which
   * lands in an `<iframe src>` on three public pages.
   *
   * Stripping here means nothing that comes *out of this schema* carries one.
   * Note what that is not: `BulletinFormValues` is a flat object, not a union
   * discriminated on `mediaType`, so the compiler still permits someone to
   * hand-construct `{ mediaType: "none", videoEmbedUrl: "javascript:…" }`. A
   * `z.discriminatedUnion` would make it a type-level guarantee; this is a
   * runtime one. The repository's nulling therefore remains load-bearing rather
   * than redundant, and it also covers rows that never pass through this schema
   * at all — the seed and the hand-run migration.
   */
  .transform((v) => ({
    ...v,
    mediaUrl: v.mediaType === "image" ? v.mediaUrl : undefined,
    videoEmbedUrl: v.mediaType === "video" ? v.videoEmbedUrl : undefined,
  }));

export type BulletinFormInput = z.input<typeof bulletinFormSchema>;
export type BulletinFormValues = z.output<typeof bulletinFormSchema>;
