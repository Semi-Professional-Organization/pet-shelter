import { BulletinCategory, BulletinTargetPage } from "@/types/bulletin";
import type { TranslationKey } from "@/lib/i18n/translations";

export interface BulletinCategoryPresentation {
  /** The admin editor's label. Staff tooling is English-only. */
  label: string;
  /**
   * The public feed's label, as a dictionary key so the Malay site reads Malay.
   * Kept in this one table beside `label` rather than in a second map in the
   * feed, for the reason this module exists: two tables of the same categories
   * drift the moment one gains a member.
   */
  labelKey: TranslationKey;
  /**
   * The design-system tone class (`tone-danger`, `tone-success`, …) declared in
   * `globals.css`. On its own it only remaps the local `--tone-*` group, so it
   * composes with any tone-aware shell — `tone-chip` here — without this module
   * having to know which one the call site picked. Same contract as
   * `petStatusPresentation`.
   */
  toneClass: string;
}

/**
 * Bulletin category → label and design tone.
 *
 * Lifted out of `BulletinFeed` when bulletins gained an admin editor: the
 * public feed and the admin table must badge a notice identically, and two
 * copies of this table would drift the moment a category was added. It is also
 * the `Record<BulletinCategory, …>` half of the vocabulary consistency check in
 * `@/lib/server/bulletinRepository` — the compiler fails this file if the union
 * grows a member, which is the point.
 *
 * `happy_tail` takes `highlight` rather than `success` because `clinic` already
 * owns green, and two categories sharing a colour makes the badge legend
 * unreadable. That reasoning arrived with the original mapping and is kept.
 */
export const BULLETIN_CATEGORY_PRESENTATION: Record<
  BulletinCategory,
  BulletinCategoryPresentation
> = {
  urgent_need: { label: "Urgent Foster / Need", labelKey: "bulletins.categoryUrgentNeed", toneClass: "tone-danger" },
  clinic: { label: "Clinic / Vaccine", labelKey: "bulletins.categoryClinic", toneClass: "tone-success" },
  event: { label: "Event", labelKey: "bulletins.categoryEvent", toneClass: "tone-info" },
  happy_tail: { label: "Adoption Update", labelKey: "bulletins.categoryHappyTail", toneClass: "tone-highlight" },
  announcement: { label: "Notice", labelKey: "bulletins.categoryAnnouncement", toneClass: "tone-neutral" },
};

/**
 * Falls back to `announcement` for a value the union does not carry.
 *
 * Reachable in one direction only: a row written by the hand-run migration or a
 * future enum member that the database accepts and this build does not know.
 * The database rejects anything outside the enum, so this cannot be reached
 * from the form.
 */
export function presentBulletinCategory(
  category: BulletinCategory
): BulletinCategoryPresentation {
  return BULLETIN_CATEGORY_PRESENTATION[category] ?? BULLETIN_CATEGORY_PRESENTATION.announcement;
}

/**
 * True when this build carries the category, i.e. when it can round-trip.
 *
 * A row can hold a value this bundle does not know: the hand-run migration
 * writes directly, and a rolling deploy can leave an older bundle reading rows
 * a newer one wrote. Callers that *render* such a row fall back
 * (`presentBulletinCategory`); callers that *edit* one must not — silently
 * rewriting it is worse than refusing.
 */
export function isKnownBulletinCategory(value: string): value is BulletinCategory {
  return Object.prototype.hasOwnProperty.call(BULLETIN_CATEGORY_PRESENTATION, value);
}

/**
 * The category this build will actually render a row as.
 *
 * Used by anything that filters or groups, so the answer agrees with the badge
 * `presentBulletinCategory` produces. A filter comparing the raw value would
 * hide the very row whose badge it just matched.
 */
export function normaliseBulletinCategory(value: string): BulletinCategory {
  return isKnownBulletinCategory(value) ? value : "announcement";
}

/**
 * Where a notice appears, for the admin editor's select and its table column.
 *
 * Every published notice appears on `/bulletins`, which is the full archive and
 * reads with no target filter. The target only decides which *scoped* feed also
 * carries it. The labels used to read "Home page" and "Adoption directory",
 * which promised exclusivity the archive does not honour — an editor posting a
 * home-page-only promotion then found it on `/bulletins` too.
 */
export const BULLETIN_TARGET_PAGE_LABELS: Record<BulletinTargetPage, string> = {
  all: "Every feed",
  home: "Home page + Bulletins page",
  pets: "Adoption directory + Bulletins page",
  bulletins: "Bulletins page only",
};
