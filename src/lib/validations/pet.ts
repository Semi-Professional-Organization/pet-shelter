import * as z from "zod";
import {
  optionalQrImageUrl,
  optionalUploadedImageUrl,
  uploadedImageUrl,
} from "@/lib/validations/qrImage";

/**
 * Notification options passed alongside a pet update.
 *
 * Server Action arguments are untrusted input. `data` goes through
 * `petFormSchema`; this parameter must not skip validation, because an
 * arbitrarily long caption would be embedded in every supporter email and
 * serialised into the audit metadata column. The 280 limit matches the
 * textarea's `maxLength`.
 */
export const photoNotificationSchema = z.object({
  notifySponsors: z.boolean().optional(),
  caption: z
    .string()
    .trim()
    .max(280, "Caregiver note must be under 280 characters")
    .optional(),
});

export type PhotoNotificationInput = z.infer<typeof photoNotificationSchema>;

import {
  Gender,
  MedicalTimelineCategory,
  PetSize,
  PetStatus,
  PetUpdate,
  Species,
} from "@/types/pet";
import { normalizePetStatus } from "@/lib/domain/stateMachine";
import { AGE_BANDS } from "@/lib/domain/petAge";

/**
 * Canonical pet lifecycle statuses. "Rehabilitation" is a legacy alias of
 * "In Rehabilitation" and is accepted on input for stored records.
 */
export const PET_STATUS_VALUES = [
  "Available",
  "Pending",
  "Adopted",
  "In Rehabilitation",
  "Rehabilitation",
] as const;

export const PET_STATUS_FILTER_VALUES = ["all", ...PET_STATUS_VALUES] as const;

/**
 * The recorded sexes, in the order surfaces should offer them. Shared for the same reason the
 * statuses above are: the form schema, the filter schema and the gallery's `<select>` were
 * about to hold a fourth hand-written copy of this two-item list between them.
 */
export const GENDER_VALUES = ["Male", "Female"] as const satisfies readonly Gender[];

export const GENDER_FILTER_VALUES = ["all", ...GENDER_VALUES] as const;

/**
 * The species a pet can be filed under. Shared by the form and filter schemas — **not** yet by the
 * gallery, whose species toggle still hand-lists dog and cat. Adding a species here reaches both
 * schemas; it does not add a button.
 */
export const SPECIES_VALUES = ["dog", "cat", "other"] as const satisfies readonly Species[];

/**
 * Size bands. Shared by the form and filter schemas — **not** yet by the gallery's size select,
 * whose options carry hand-written bilingual weight ranges. Adding a band here reaches both
 * schemas; it does not add an option.
 */
export const SIZE_VALUES = ["Small", "Medium", "Large"] as const satisfies readonly PetSize[];

// On both lists above, `satisfies readonly Species[]` / `PetSize[]` proves only that each value
// listed is a real one. It does not prove every real one is listed: add "rabbit" to `Species` and
// this still compiles, while both schemas reject it and `resolveFilters` silently resets
// `?species=rabbit` to "all". Keep them in step by hand until something checks exhaustiveness.

/** Statuses that denote an animal still under clinical or behavioural care. */
export const REHABILITATION_STATUSES: readonly PetStatus[] = ["In Rehabilitation", "Rehabilitation"];

/** True when the status denotes an animal under care, in either spelling. */
export function isRehabilitationStatus(status: PetStatus): boolean {
  return normalizePetStatus(status) === "In Rehabilitation";
}

/** Rehabilitation progress fields — only meaningful while a pet is under care. */
const REHAB_FIELDS = ["rehabStage", "rehabStageMs", "rehabProgressPercent"] as const;

/**
 * Clinical event categories. Deliberately a different closed set from
 * `PET_UPDATE_CATEGORY_VALUES` — the two histories are not interchangeable,
 * which is why they are stored in two tables rather than one discriminated one.
 */
export const MEDICAL_TIMELINE_CATEGORY_VALUES = [
  "intake",
  "diagnostic",
  "treatment",
  "vaccination",
  "surgery",
  "clearance",
] as const satisfies readonly MedicalTimelineCategory[];

/** Narrative update categories. */
export const PET_UPDATE_CATEGORY_VALUES = [
  "medical",
  "rehabilitation",
  "milestone",
  "socialization",
] as const satisfies readonly NonNullable<PetUpdate["category"]>[];

/**
 * A calendar day with no time component, stored as `YYYY-MM-DD`. The regex pins the shape; the
 * round-trip rejects impossible days such as `2026-02-30`, which the regex alone lets through.
 *
 * This used to test `!Number.isNaN(Date.parse(value))` and claimed, in this comment, to reject
 * exactly that case. It does not: `Date.parse("2026-02-30")` returns a number on V8, silently
 * rolling the day forward to 2026-03-02, so the only thing it caught was an out-of-range *month*.
 * Measured on Node 26.4.0, 2026-09-22. Reading the parsed date back and comparing all three
 * components is what actually refuses a day that does not exist — a rolled-over date differs from
 * the input in at least one of them.
 *
 * UTC throughout, because `YYYY-MM-DD` is parsed as UTC midnight; `getFullYear()` here would
 * compare against a local-time reading of that instant and disagree west of Greenwich.
 */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Date is not a real calendar day");

/** One clinical event on a pet's medical history. */
export const medicalTimelineEventSchema = z.object({
  id: z.string().min(1, "Timeline event id is required"),
  date: isoDateSchema,
  title: z.string().min(1, "Timeline event title is required"),
  titleMs: z.string().min(1, "Timeline event title (BM) cannot be blank").optional(),
  category: z.enum(MEDICAL_TIMELINE_CATEGORY_VALUES),
  description: z.string().min(1, "Timeline event description is required"),
  descriptionMs: z.string().min(1, "Timeline event description (BM) cannot be blank").optional(),
  veterinarian: z.string().min(1, "Attending veterinarian cannot be blank").optional(),
  // Required, mirroring MedicalTimelineEvent. A Zod default here would make the
  // schema's *input* type diverge from the domain type, so every client holding
  // a raw PetFormInput would need to re-derive it — and clinical sign-off is not
  // something to infer from an absent key.
  verified: z.boolean(),
  badge: z.string().min(1, "Timeline badge cannot be blank").optional(),
  badgeMs: z.string().min(1, "Timeline badge (BM) cannot be blank").optional(),
});

/** One narrative progress note on a pet's public profile. */
export const petUpdateSchema = z.object({
  id: z.string().min(1, "Update id is required"),
  date: isoDateSchema,
  title: z.string().min(1, "Update title is required"),
  titleMs: z.string().min(1, "Update title (BM) cannot be blank").optional(),
  content: z.string().min(1, "Update content is required"),
  contentMs: z.string().min(1, "Update content (BM) cannot be blank").optional(),
  image: optionalUploadedImageUrl,
  category: z.enum(PET_UPDATE_CATEGORY_VALUES).optional(),
});

export type MedicalTimelineEventInput = z.input<typeof medicalTimelineEventSchema>;
export type PetUpdateInput = z.input<typeof petUpdateSchema>;

/**
 * Ascending comparison on a `YYYY-MM-DD` string. Lexical order and calendar
 * order coincide for that format, so no `Date` parsing is needed.
 */
function byDateAscending(a: { date: string }, b: { date: string }): number {
  return a.date.localeCompare(b.date);
}

/**
 * Orders a submitted history collection by date, leaving an absent collection
 * absent.
 *
 * Ordering is applied here rather than only in the Prisma `orderBy` because the
 * dual-layer store also serves pets straight from memory, and a pet must read
 * back the same way from either layer.
 */
export function sortHistoryByDate<T extends { date: string }>(
  events: T[] | undefined
): T[] | undefined {
  return events?.slice().sort(byDateAscending);
}

/** Reports the ids appearing more than once in a history collection. */
function duplicateIds(events: readonly { id: string }[] | undefined): string[] {
  if (!events) return [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of events) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

export const petBaseFormSchema = z.object({
  name: z.string().min(1, "Pet name is required").max(60, "Name is too long"),
  species: z.enum(SPECIES_VALUES),
  breed: z.string().min(1, "Breed is required"),

  /**
   * The animal's birthday, and the only age input there is.
   *
   * `age` prose and an `ageCategory` band used to be collected here and were then thrown away:
   * `buildPetPersistencePayload` stored `intakeDate − age` and `mapDbPetToPet` recomputed both
   * from that date, so a typed "2 years" drifted a year further from the truth every year and the
   * chosen band was never read back at all (`tasks/open/pet-form-has-no-birth-date-field.md`).
   * Collecting the birthday instead makes the stored value the one the operator actually saw, and
   * leaves age and band derived everywhere, once, in `src/lib/domain/petAge.ts`.
   *
   * `birthDateIsEstimate` is the honesty flag: false only when someone knows the real date, which
   * for a rescue is the exception. It defaults to true for that reason.
   */
  // Piped rather than plain `isoDateSchema` so that leaving the field blank says "Birth date is
  // required" instead of "Date must be in YYYY-MM-DD format", which is what an empty string earns
  // from the regex and is not what the operator did wrong.
  birthDate: z.string().min(1, "Birth date is required").pipe(isoDateSchema),

  /**
   * Optional with NO `.default(true)`, deliberately.
   *
   * A default here is applied on every parse, so the key is always present in the output — and
   * `updatePet` merges `{ ...existing, ...validated }`. A caller that simply did not mention the
   * flag would therefore overwrite a stored `false` with `true`, silently demoting a birthday
   * someone actually knew to a guess, which is the one thing this field exists to prevent.
   * Measured, not theorised. Leaving it absent lets `existing` survive the spread; the two create
   * paths apply `?? true` themselves, where defaulting to "estimated" is the honest choice.
   */
  birthDateIsEstimate: z.boolean().optional(),

  gender: z.enum(GENDER_VALUES),
  size: z.enum(SIZE_VALUES),
  weight: z.string().min(1, "Weight is required (e.g. '18 kg')"),
  status: z.enum(PET_STATUS_VALUES),
  adoptionFee: z.string().min(1, "Adoption fee is required (e.g. 'Free')"),
  description: z.string().min(10, "Please provide at least a brief description (10+ characters)"),
  rescueStory: z.string().min(10, "Please provide the rescue background story"),
  image: uploadedImageUrl,
  galleryImages: z.array(uploadedImageUrl).optional().default([]),
  tags: z.array(z.string()).min(1, "Please provide at least 1 characteristic tag"),
  featured: z.boolean().default(false),
  intakeDate: z.string().min(4, "Intake date is required"),

  /// Dedicated donation QR for this animal's medical fund drive.
  customQrUrl: optionalQrImageUrl,

  // Medical
  vaccinated: z.boolean().default(true),
  microchipped: z.boolean().default(true),
  spayedNeutered: z.boolean().default(true),
  specialNeeds: z.string().optional(),

  // Compatibility
  goodWithDogs: z.boolean().default(true),
  goodWithCats: z.boolean().default(true),
  goodWithKids: z.boolean().default(true),
  energyLevel: z.enum(["Low", "Moderate", "High"]).default("Moderate"),

  // Rehabilitation progress (only valid while the pet is under care)
  rehabStage: z.string().min(1, "Rehabilitation stage cannot be blank").optional(),
  rehabStageMs: z.string().min(1, "Rehabilitation stage (BM) cannot be blank").optional(),
  rehabProgressPercent: z
    .number()
    .int("Rehabilitation progress must be a whole percentage")
    .min(0, "Rehabilitation progress cannot be below 0%")
    .max(100, "Rehabilitation progress cannot exceed 100%")
    .optional(),

  // Nested history. Left without a default on purpose: an absent key must stay
  // absent so the action layer can tell "not supplied" from "supplied empty".
  // Absent leaves the stored rows untouched; `[]` clears them — see updatePet in src/actions/pets.ts.
  updates: z.array(petUpdateSchema).optional(),
  medicalTimeline: z.array(medicalTimelineEventSchema).optional(),

  // Soft Delete
  isArchived: z.boolean().optional().default(false),
  deletedAt: z.string().nullable().optional(),
});

/**
 * Full pet form contract. Rehabilitation details are rejected on pets that are
 * not under care, so a cleared animal cannot keep a stale progress bar.
 */
export const petFormSchema = petBaseFormSchema.superRefine((data, ctx) => {
  // History ids become primary keys verbatim, so a repeat within one payload
  // would collide on insert — which the fallback store would then swallow.
  for (const field of ["updates", "medicalTimeline"] as const) {
    for (const id of duplicateIds(data[field])) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `Duplicate '${field}' id '${id}' — history event ids must be unique`,
      });
    }
  }

  // An animal cannot have been born after it arrived. Worth pinning because the derivation this
  // field replaced could not produce such a date — `intakeDate − age` is always on or before
  // intake — so a typed birthday is the first way one can enter the system, and a future date
  // renders as a plausible "1 month" rather than as an error.
  if (/^\d{4}-\d{2}-\d{2}$/.test(data.intakeDate) && data.birthDate > data.intakeDate) {
    ctx.addIssue({
      code: "custom",
      path: ["birthDate"],
      message: `Birth date ${data.birthDate} is after the intake date ${data.intakeDate}`,
    });
  }

  // An absolute bound as well, because the relative one above is skipped whenever `intakeDate` is
  // malformed — it is only `z.string().min(4)`, so `"2026"` passes it and disables the check. On
  // the action path a Server Action argument is untrusted input, and a birthday in 2099 would
  // otherwise validate and render as a plausible "1 month", since `computeAgeInMonths` clamps a
  // negative age to zero. That is the failure this rule exists to stop, so it must not depend on
  // another field being well formed.
  //
  // `intakeDate` is deliberately NOT tightened to `isoDateSchema` here. Its stored values in
  // production are unknown, and every edit to a pet re-validates the whole form, so a stricter
  // rule would strand any record whose intake date is not already ISO — the same trap that made a
  // pet uneditable when the birth-date `max` was bound flat to it.
  //
  // Compared against tomorrow in UTC, not today: no timezone on earth is more than 14 hours ahead
  // of UTC, so a day of slack is what stops an animal born this morning in Kuala Lumpur being
  // refused because UTC is still on yesterday's date.
  const tomorrowUtc = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (data.birthDate > tomorrowUtc) {
    ctx.addIssue({
      code: "custom",
      path: ["birthDate"],
      message: `Birth date ${data.birthDate} is in the future`,
    });
  }

  // And a lower bound, because only half of the above was implemented at first. A mistyped year
  // passed every other rule: `1899-07-04` satisfies the regex, the UTC round-trip, "not after
  // intake" and "not in the future", and then renders as "127 years" on the public card and files
  // the animal under `senior`. Measured: `0202-05-18` gives "1824 years". The data half of this
  // same conversion already refuses exactly this — the expand migration rejects an age over 60
  // years as "a typo or junk, not an animal" — so the form was the lenient end of a rule the SQL
  // was enforcing. 60 years is well past any animal a shelter rehomes; the point is to catch a
  // slipped digit, not to adjudicate longevity.
  const earliestPlausible = new Date(Date.now() - 60 * 365.25 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (data.birthDate < earliestPlausible) {
    ctx.addIssue({
      code: "custom",
      path: ["birthDate"],
      message: `Birth date ${data.birthDate} is more than 60 years ago`,
    });
  }

  if (isRehabilitationStatus(data.status)) return;

  for (const field of REHAB_FIELDS) {
    if (data[field] === undefined) continue;
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `'${field}' is only allowed while the pet status is 'In Rehabilitation' (received '${data.status}')`,
    });
  }
});

export type PetFormInput = z.input<typeof petBaseFormSchema>;
export type PetFormOutput = z.output<typeof petBaseFormSchema>;

/**
 * Every enum here is built from a shared list rather than re-typed: `AGE_BANDS` (which the age
 * select also renders from), `SPECIES_VALUES`, `SIZE_VALUES`, `GENDER_VALUES`. The species toggle
 * and size select in the gallery still hand-list their options — see those constants.
 *
 * That stopped being cosmetic when the gallery began resolving URL values against this schema
 * (`resolveFilters` in `usePetGalleryController`): a value missing from here is now silently
 * reset to "all". So a band added to `AGE_BANDS` but not re-typed here would have rendered in the
 * age select, and choosing it would have snapped the select back with the grid unchanged and no
 * error anywhere.
 */
export const petFilterSchema = z.object({
  species: z.enum(["all", ...SPECIES_VALUES]).optional().default("all"),
  gender: z.enum(GENDER_FILTER_VALUES).optional().default("all"),
  status: z.enum(PET_STATUS_FILTER_VALUES).optional().default("all"),
  ageCategory: z.enum(["all", ...AGE_BANDS]).optional().default("all"),
  size: z.enum(["all", ...SIZE_VALUES]).optional().default("all"),
  search: z.string().optional().default(""),
  isArchived: z.boolean().optional(),
});

export type PetFilterInput = {
  species?: "all" | (typeof SPECIES_VALUES)[number];
  gender?: "all" | Gender;
  status?: PetStatus | "all";
  ageCategory?: "all" | (typeof AGE_BANDS)[number];
  size?: "all" | (typeof SIZE_VALUES)[number];
  search?: string;
  isArchived?: boolean;
};
