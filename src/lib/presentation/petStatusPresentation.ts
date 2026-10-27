import { Pet, PetStatus } from "@/types/pet";
import { isKnownPetStatus, normalizePetStatus } from "@/lib/domain/stateMachine";

export type PetStatusTone = "available" | "rehabilitation" | "pending" | "adopted";

/**
 * Which catalogue track a status belongs to — the public split between animals you can apply
 * for, animals you can fund, and animals who have already gone home.
 *
 * A track is coarser than a status on purpose: `Available` and `Pending` are two stages of one
 * journey, and a supporter browsing for a dog does not think of them as different sections.
 * `alumni` is not a third thing to support; it is the absence of a support action, which is why
 * the card offers no CTA there.
 */
export type PetTrack = "adoptable" | "rehabilitation" | "alumni";

export interface PetStatusPresentation {
  tone: PetStatusTone;
  /** Dictionary key for the badge label. */
  labelKey: string;
  /** English text used until the key is looked up. */
  labelFallback: string;
  /**
   * The design-system tone class (`tone-success`, `tone-care`, …) declared in
   * `globals.css`. On its own it only remaps the local `--tone-*` group, so it composes
   * with any tone-aware shell — `tone-soft`, `tone-ink`, `tone-chip` — without this
   * module having to know which one the call site picked.
   */
   toneClass: string;
  /** Public solid pill badge. Self-contained: do not add padding or a text colour. */
  badgeClass: string;
  /** Admin-table variant — the same fill in a squarer chip. Also self-contained. */
  chipClass: string;
  /** Only adoptable animals accept an adoption application. */
  isAdoptable: boolean;
  /** Under veterinary or behavioural care: sponsorship is the supported action, not adoption. */
  isInRehabilitation: boolean;
  /**
   * The catalogue section this status files under. Declared here, beside the tone it sits with,
   * so a new status joins a track by gaining one field — not by being remembered in a tab list
   * in some component. That is the failure this file's own `buildPetStatusFilterOptions` comment
   * describes, and the public gallery was committing it: three statuses hand-listed, `Adopted`
   * forgotten.
   */
  track: PetTrack;
}

/**
 * Domain tone → design tone. The left side is what the shelter calls the state; the
 * right side is what the design system calls the colour group. Keeping the mapping
 * explicit is what lets `globals.css` restyle every status surface at once — and stops
 * a new status from reaching for a raw `bg-success-solid` because it "looks available".
 */
const TONE_CLASS: Record<PetStatusTone, string> = {
  available: "tone-success",
  rehabilitation: "tone-care",
  pending: "tone-warning",
  adopted: "tone-neutral",
};

const PRESENTATIONS: Record<PetStatusTone, PetStatusPresentation> = {
  available: {
    tone: "available",
    labelKey: "common.available",
    labelFallback: "Available",
    toneClass: TONE_CLASS.available,
    badgeClass: `tone-chip tone-chip-pill ${TONE_CLASS.available}`,
    chipClass: `tone-chip ${TONE_CLASS.available}`,
    isAdoptable: true,
    isInRehabilitation: false,
    track: "adoptable",
  },
  rehabilitation: {
    tone: "rehabilitation",
    labelKey: "common.inRehabilitation",
    labelFallback: "In Rehabilitation",
    toneClass: TONE_CLASS.rehabilitation,
    badgeClass: `tone-chip tone-chip-pill ${TONE_CLASS.rehabilitation}`,
    chipClass: `tone-chip ${TONE_CLASS.rehabilitation}`,
    isAdoptable: false,
    isInRehabilitation: true,
    track: "rehabilitation",
  },
  pending: {
    tone: "pending",
    labelKey: "common.pending",
    labelFallback: "Pending",
    toneClass: TONE_CLASS.pending,
    badgeClass: `tone-chip tone-chip-pill ${TONE_CLASS.pending}`,
    chipClass: `tone-chip ${TONE_CLASS.pending}`,
    isAdoptable: false,
    isInRehabilitation: false,
    // An application is under review, which is a stage of the adoption journey rather than a
    // section of its own. Filing it here is what makes the catalogue agree with the detail
    // page, whose adopt button already reads "Adoption Pending" instead of disappearing.
    track: "adoptable",
  },
  adopted: {
    tone: "adopted",
    labelKey: "common.adopted",
    labelFallback: "Adopted",
    toneClass: TONE_CLASS.adopted,
    badgeClass: `tone-chip tone-chip-pill ${TONE_CLASS.adopted}`,
    chipClass: `tone-chip ${TONE_CLASS.adopted}`,
    isAdoptable: false,
    isInRehabilitation: false,
    track: "alumni",
  },
};

const TONE_BY_STATUS: Record<PetStatus, PetStatusTone> = {
  Available: "available",
  "In Rehabilitation": "rehabilitation",
  Rehabilitation: "rehabilitation", // Alias entry — mirrors "In Rehabilitation"
  Pending: "pending",
  Adopted: "adopted",
};

/**
 * The canonical statuses, in the order surfaces should offer them — one per tone, so the
 * legacy alias never appears as a separate choice. Filter controls derive their options
 * from this rather than hand-listing them, which is how rehabilitation was omitted from
 * the admin table's status filter in the first place.
 */
export const PET_STATUS_SEQUENCE: PetStatus[] = [
  "Available",
  "In Rehabilitation",
  "Pending",
  "Adopted",
];

export interface PetStatusFilterOption {
  /** Canonical status, used as the `<option value>` and fed back to `matchesStatusFilter`. */
  value: PetStatus;
  tone: PetStatusTone;
  labelKey: string;
  labelFallback: string;
  /** How many of the supplied animals carry this status, either spelling. */
  count: number;
}

/**
 * Resolve how a pet's status should be presented. Statuses are normalized first, so the
 * legacy `Rehabilitation` alias and the canonical `In Rehabilitation` render identically.
 */
export function getPetStatusPresentation(status: PetStatus): PetStatusPresentation {
  if (isKnownPetStatus(status)) return PRESENTATIONS[TONE_BY_STATUS[normalizePetStatus(status)]];
  // A stored status the domain does not know (`fromDbPetStatus` passes it through). It fails
  // closed with the pending tone, but is labelled "Status unknown": calling it "Pending" made the
  // admin status control show two Pendings and hid the row staff need to correct, and the raw
  // stored text is not for the public catalogue. `isKnownPetStatus` is an own-key check, so
  // `constructor` cannot pass for a known tone.
  return { ...PRESENTATIONS.pending, labelKey: "common.statusUnknown", labelFallback: "Status unknown" };
}

/** Whether an animal accepts adoption applications, as the adoption form and gallery ask it.
 * `submitApplication` reads the same `isAdoptable` flag for its label alongside. */
export function isPetAdoptable(pet: Pick<Pet, "status">): boolean {
  return getPetStatusPresentation(pet.status).isAdoptable;
}

/**
 * Build the status filter's options and their counts over a supplied population.
 *
 * Every animal lands in exactly one bucket — statuses are grouped by tone, so both rehab
 * spellings share a count and an unrecognised value still falls somewhere. The counts
 * therefore sum to `pets.length` by construction, which is the invariant staff notice
 * when it breaks: animals present in the header total but absent from every option.
 */
export function buildPetStatusFilterOptions(
  pets: readonly Pick<Pet, "status">[]
): PetStatusFilterOption[] {
  const counts = new Map<PetStatusTone, number>();
  for (const pet of pets) {
    const { tone } = getPetStatusPresentation(pet.status);
    counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }

  return PET_STATUS_SEQUENCE.map((value) => {
    const { tone, labelKey, labelFallback } = getPetStatusPresentation(value);
    return { value, tone, labelKey, labelFallback, count: counts.get(tone) ?? 0 };
  });
}

/**
 * Compare a pet's status against a gallery filter value, which arrives as a raw string
 * from the URL. Both sides are normalized, so selecting "In Rehabilitation" also matches
 * animals stored under the legacy `Rehabilitation` alias, and vice versa.
 */
export function matchesStatusFilter(status: PetStatus, selectedStatus: string): boolean {
  if (selectedStatus === "all") return true;
  if (!isKnownPetStatus(selectedStatus)) return false;
  // By tone, the way `buildPetStatusFilterOptions` counts. The same as comparing normalized
  // statuses for every known one, and it files an unrecognised stored status under Pending, where
  // it is counted and badged, instead of under no filter at all.
  return getPetStatusPresentation(status).tone === getPetStatusPresentation(selectedStatus).tone;
}

/**
 * Public-catalogue policy: never offer a filter that matches nothing.
 *
 * The admin table wants the opposite, and `buildPetStatusFilterOptions` serves that — it lists
 * every canonical status even at zero so staff can see a bucket is empty rather than wonder
 * where it went, which `tests/unit/petStatusPresentation.test.ts` pins. A supporter browsing
 * `/pets` has no such need. The two policies differ, so they are two named functions over one
 * count rather than a `.filter()` remembered at one of the call sites.
 */
export function buildPopulatedStatusFilterOptions(
  pets: readonly Pick<Pet, "status">[]
): PetStatusFilterOption[] {
  return buildPetStatusFilterOptions(pets).filter((option) => option.count > 0);
}

/**
 * The populated options, plus whichever status is currently selected even when nothing matches
 * it any more.
 *
 * Dropping empty buckets is right until the visitor is standing in one. Narrowing a *different*
 * filter — picking Dogs while filtered to Pending, say — can empty the selected status's bucket,
 * and a `<select>` whose value matches no `<option>` renders blank: the grid empties with the
 * responsible control showing nothing. Keeping the selected option visible at `(0)` says what
 * happened and leaves somewhere to click.
 */
export function buildVisibleStatusFilterOptions(
  pets: readonly Pick<Pet, "status">[],
  selectedStatus: string
): PetStatusFilterOption[] {
  const populated = buildPopulatedStatusFilterOptions(pets);
  if (selectedStatus === "all") return populated;
  if (populated.some((option) => matchesStatusFilter(option.value, selectedStatus))) {
    return populated;
  }

  // An all-zero set to lift the selected status's label and tone from, so this does not
  // reconstruct an option shape that `buildPetStatusFilterOptions` already knows how to build.
  const orphan = buildPetStatusFilterOptions([]).find((option) =>
    matchesStatusFilter(option.value, selectedStatus)
  );
  return orphan ? [...populated, orphan] : populated;
}

/** The tracks in the order the catalogue offers them: adoption first, alumni last. */
export const PET_TRACK_SEQUENCE: PetTrack[] = ["adoptable", "rehabilitation", "alumni"];

/**
 * Track labels are their own vocabulary, not the status labels reused. "Adoptable" covers both
 * `Available` and `Pending`, so it cannot borrow either one's key — and if a second status ever
 * joins the rehabilitation track, that tab's label must not start following whichever status
 * happens to be listed first.
 */
const TRACK_LABELS: Record<PetTrack, { labelKey: string; labelFallback: string }> = {
  adoptable: { labelKey: "pets.trackAdoptable", labelFallback: "Adoptable" },
  rehabilitation: { labelKey: "pets.trackRehabilitation", labelFallback: "In Rehabilitation" },
  alumni: { labelKey: "pets.trackAlumni", labelFallback: "Adopted" },
};

export interface PetTrackOption {
  /** Canonical track, used as the tab value and fed back to `matchesTrackFilter`. */
  value: PetTrack;
  labelKey: string;
  labelFallback: string;
  /** How many of the supplied animals file under this track. */
  count: number;
}

/**
 * The track a status files under. Resolved through the presentation record, so the legacy
 * `Rehabilitation` alias lands on the same track as `In Rehabilitation` without this function
 * knowing the alias exists.
 */
export function getPetTrack(status: PetStatus): PetTrack {
  return getPetStatusPresentation(status).track;
}

/**
 * The populated tracks over a supplied population, omitting tracks nobody is in — so the
 * catalogue cannot show an "Adopted" tab at a shelter that has not rehomed anyone yet.
 *
 * The no-selection form of `buildVisibleTrackOptions`, which is what the gallery actually calls:
 * the strip must also keep a selected track that other filters have emptied. Kept as the name for
 * "which tracks exist here", which the counting-invariant tests in
 * `tests/unit/pets/petCatalog.test.ts` are written against. It has no production caller.
 *
 * Counts sum to `pets.length` by construction, for the same reason the status counts do: every
 * status resolves to exactly one presentation, and every presentation names exactly one track.
 */
export function buildPetTrackOptions(pets: readonly Pick<Pet, "status">[]): PetTrackOption[] {
  // "all" names no track, so nothing is kept beyond the populated ones.
  return buildVisibleTrackOptions(pets, "all");
}

/**
 * The populated tracks, plus the selected one even when nothing is left in it.
 *
 * The track half of `buildVisibleStatusFilterOptions`, for the same reason. Narrowing a
 * *different* filter — picking Cats while on the Adopted track, say — can empty the selected
 * track, and `buildPetTrackOptions` drops empty tracks, so the selected tab vanished: no tab
 * marked active, an empty grid, and nothing on screen admitting that a track was still applied.
 * Order follows `PET_TRACK_SEQUENCE`, so the kept tab sits where it always does.
 */
export function buildVisibleTrackOptions(
  pets: readonly Pick<Pet, "status">[],
  selectedTrack: string
): PetTrackOption[] {
  const counts = new Map<PetTrack, number>();
  for (const pet of pets) {
    const track = getPetTrack(pet.status);
    counts.set(track, (counts.get(track) ?? 0) + 1);
  }

  // One pass over the fixed sequence, so order comes free and there is no second option to build
  // or sort. `track === selectedTrack` can only hold for a real track, so an unrecognised selection
  // keeps nothing extra.
  return PET_TRACK_SEQUENCE.filter(
    (track) => (counts.get(track) ?? 0) > 0 || track === selectedTrack
  ).map((value) => ({ value, ...TRACK_LABELS[value], count: counts.get(value) ?? 0 }));
}

/**
 * Compare a pet's status against a track filter value, which arrives as a raw string from the
 * URL. `"all"` is the default rather than `"adoptable"`: `PetGallery` also mounts on the home
 * page without filter controls, and a default that hid every animal under care there would be a
 * regression nobody could see the cause of.
 */
export function matchesTrackFilter(status: PetStatus, selectedTrack: string): boolean {
  // An unrecognised value means "all", not "nothing". `?track=Adoptable` with the wrong case,
  // or a stale link to a track that no longer exists, would otherwise match no animal and empty
  // the grid with no tab marked active — a filter with nothing on screen admitting to it.
  // `getPetStatusPresentation` already falls back rather than failing closed for the same reason.
  if (!isPetTrack(selectedTrack)) return true;
  return getPetTrack(status) === selectedTrack;
}

/** Whether a raw string — from the URL, always — names a track this build knows. */
export function isPetTrack(value: string): value is PetTrack {
  return (PET_TRACK_SEQUENCE as string[]).includes(value);
}

type RehabStageFields = Pick<Pet, "rehabStage" | "rehabStageMs">;

/**
 * Rehabilitation stages are bilingual free text held on the pet, not dictionary keys, so
 * they follow the same `*Ms`-with-English-fallback shape as the rest of the fixture copy.
 */
export function getRehabStageLabel(pet: RehabStageFields, isMs: boolean): string | undefined {
  const preferred = isMs ? pet.rehabStageMs : pet.rehabStage;
  return preferred?.trim() || pet.rehabStage?.trim() || undefined;
}

/**
 * Clamped so a malformed value cannot blow out the progress bar's width — the store
 * accepts any integer for this column.
 */
export function getRehabProgressPercent(pet: Pick<Pet, "rehabProgressPercent">): number | undefined {
  const percent = pet.rehabProgressPercent;
  if (typeof percent !== "number" || Number.isNaN(percent)) return undefined;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
