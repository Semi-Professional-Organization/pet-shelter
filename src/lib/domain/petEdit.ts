import type { Pet } from "@/types/pet";
import type { PetFormInput } from "@/lib/validations/pet";
import { withDerivedAge } from "@/lib/domain/petAge";

/**
 * How an admin pet form becomes a stored `Pet`: one rule for an edit and one for a new record.
 *
 * Both the browser store (`usePetStore` in `src/lib/client/petStore.ts`) and the Server Actions
 * (`updatePet` / `createPet` in `src/actions/pets.ts`) build their pet here. Each used to hold its
 * own copy, and the copies drifted: the store never copied the gallery or the donation QR, and the
 * server wrote its schema's defaults over stored values for every key a caller left out (#212).
 *
 * The edit rule: **an absent key keeps what is stored, and an edit never invents a default.** A
 * key that is present but `undefined` counts as absent (zod keeps such a key, and any spread of a
 * form can produce one). A submitted value replaces the stored one, an empty one included. Two
 * groups are deliberately different, because the form is authoritative for them and always has
 * been in both copies: the rehabilitation fields and `specialNeeds` clear when absent.
 *
 * The edit states no defaults. On the server this only holds because the update path parses with
 * `petEditSchema`, which has none; `petFormSchema`'s defaults would otherwise reach this function
 * as if they had been submitted. A new record's defaults are stated twice, with the same values:
 * by `petFormSchema`, which `createPet` and the admin dialog's resolver parse with, and by
 * `buildNewPet`, whose fallbacks therefore only run for a caller that did not parse (the browser
 * store).
 *
 * One hazard follows. `PetFormDialog` resolves *edits* with `petFormSchema` too, so every key
 * the merge would keep arrives filled in. That is harmless only because the dialog's `reset()`
 * loads every such key from the row. A defaulted key dropped from that `reset()` would arrive as
 * its default, indistinguishable from a submitted value, and overwrite the stored one.
 */

/**
 * Ascending comparison on a `YYYY-MM-DD` string. Lexical order and calendar order coincide for
 * that format, so no `Date` parsing is needed.
 */
export function byDateAscending(a: { date: string }, b: { date: string }): number {
  return a.date.localeCompare(b.date);
}

/**
 * Orders a submitted history collection by date, leaving an absent collection absent.
 *
 * Ordering is applied here rather than only in the Prisma `orderBy` because the dual-layer store
 * also serves pets straight from memory, and a pet must read back the same way from either layer.
 */
export function sortHistoryByDate<T extends { date: string }>(
  events: T[] | undefined
): T[] | undefined {
  return events?.slice().sort(byDateAscending);
}

/** An empty QR location means "no QR", stored as `null` on every path. */
function qrOrNull(url: string | null | undefined): string | null {
  return url || null;
}

/** The fields every pet takes from the form as submitted, on an edit and on a new record. */
function submittedFields(input: PetFormInput) {
  return {
    name: input.name,
    species: input.species,
    breed: input.breed,
    birthDate: input.birthDate,
    gender: input.gender,
    size: input.size,
    weight: input.weight,
    status: input.status,
    // A no-op on the server, whose schema requires a non-empty fee. The browser store does not
    // parse, and has always stored an empty fee as "Free".
    adoptionFee: input.adoptionFee || "Free",
    description: input.description,
    rescueStory: input.rescueStory,
    image: input.image,
    tags: input.tags,
    intakeDate: input.intakeDate,
    // The form is authoritative for rehabilitation progress: absent clears it, so a cleared animal
    // cannot keep a stale progress bar. `petFormSchema` refuses these off a rehabilitation status.
    rehabStage: input.rehabStage,
    rehabStageMs: input.rehabStageMs,
    rehabProgressPercent: input.rehabProgressPercent,
  };
}

/**
 * The stored pet after an admin edit. Pure: the caller reads `existing` and writes the result.
 *
 * `age` and `ageCategory` are re-derived by `withDerivedAge`, since `existing` still carries the
 * previous read's prose and the edit may have changed the birthday.
 */
export function mergePetEdit(existing: Pet, input: PetFormInput): Pet {
  // ceiling: assumes a well-formed stored pet. `Pet` requires both objects and every database
  // read supplies them; only an unvalidated `localStorage` entry could lack one, and this throws
  // on it. Upgrade path: validate the saved list in `usePetStore`
  // (tasks/open/the-browser-pet-store-skips-a-database-only-pet.md).
  const { medical, compatibility } = existing;
  return withDerivedAge({
    ...existing,
    ...submittedFields(input),
    birthDateIsEstimate: input.birthDateIsEstimate ?? existing.birthDateIsEstimate ?? true,
    // `[]` is a submitted value and clears the gallery; only an absent key keeps it.
    galleryImages: input.galleryImages ?? existing.galleryImages ?? [],
    customQrUrl: input.customQrUrl === undefined ? existing.customQrUrl : qrOrNull(input.customQrUrl),
    featured: input.featured ?? existing.featured,
    // An absent collection keeps the stored rows; a submitted list, `[]` included, replaces them
    // (issue #107). The server's `updateServerPet` decides which collections it rewrites from its
    // own `replaceHistory` flags and fills the rest from its mirror, so carrying the stored lists
    // here changes nothing it writes.
    updates: sortHistoryByDate(input.updates) ?? existing.updates,
    medicalTimeline: sortHistoryByDate(input.medicalTimeline) ?? existing.medicalTimeline,
    // Each resolved on its own: an absent key keeps its stored value, so omitting both keeps the
    // pair consistent (an omitted `isArchived` used to un-archive and leave `deletedAt` set).
    // ceiling: a payload carrying only one of them can still make them disagree. Upgrade path:
    // derive `deletedAt` from the archive transition
    // (tasks/open/a-pet-edit-accepts-isarchived-and-deletedat-independently.md).
    isArchived: input.isArchived ?? existing.isArchived ?? false,
    deletedAt: input.deletedAt !== undefined ? input.deletedAt : existing.deletedAt,
    medical: {
      vaccinated: input.vaccinated ?? medical.vaccinated,
      microchipped: input.microchipped ?? medical.microchipped,
      spayedNeutered: input.spayedNeutered ?? medical.spayedNeutered,
      // As both copies have always done: the form's text box is the whole value.
      specialNeeds: input.specialNeeds,
    },
    compatibility: {
      goodWithDogs: input.goodWithDogs ?? compatibility.goodWithDogs,
      goodWithCats: input.goodWithCats ?? compatibility.goodWithCats,
      goodWithKids: input.goodWithKids ?? compatibility.goodWithKids,
      energyLevel: input.energyLevel ?? compatibility.energyLevel,
    },
  });
}

/**
 * A new pet from the admin form, with `id` chosen by the caller. The defaults a new record gets
 * are stated here and nowhere else in the merge: a rescue's birthday is an estimate until someone
 * knows otherwise, and the medical and compatibility flags start optimistic, as the form does.
 */
export function buildNewPet(id: string, input: PetFormInput): Pet {
  return withDerivedAge({
    id,
    ...submittedFields(input),
    birthDateIsEstimate: input.birthDateIsEstimate ?? true,
    galleryImages: input.galleryImages ?? [],
    customQrUrl: qrOrNull(input.customQrUrl),
    featured: input.featured ?? false,
    updates: sortHistoryByDate(input.updates),
    medicalTimeline: sortHistoryByDate(input.medicalTimeline),
    isArchived: input.isArchived ?? false,
    deletedAt: input.deletedAt || null,
    medical: {
      vaccinated: input.vaccinated ?? true,
      microchipped: input.microchipped ?? true,
      spayedNeutered: input.spayedNeutered ?? true,
      specialNeeds: input.specialNeeds,
    },
    compatibility: {
      goodWithDogs: input.goodWithDogs ?? true,
      goodWithCats: input.goodWithCats ?? true,
      goodWithKids: input.goodWithKids ?? true,
      energyLevel: input.energyLevel ?? "Moderate",
    },
  });
}
