import { MedicalTimelineEvent, Pet, PetUpdate } from "@/types/pet";
import { PetStatus as PrismaPetStatus } from "@prisma/client";
import {
  DomainValidationError,
  isKnownPetStatus,
  normalizePetStatus,
} from "@/lib/domain/stateMachine";
import {
  computeAgeCategory,
  formatAgeString,
  deriveBirthDate,
} from "@/lib/domain/petAge";

/**
 * Converts a domain PetStatus into the Prisma database enum.
 * Normalizes legacy aliases (e.g. "Rehabilitation" -> In_Rehabilitation).
 */
export function toDbPetStatus(status: Pet["status"]): PrismaPetStatus {
  // Refused rather than defaulted. The default used to be Available, so saving an animal that was
  // read with an unrecognised status wrote it back as adoptable.
  if (!isKnownPetStatus(status)) {
    throw new DomainValidationError(
      `'${status}' is not a recognised pet status. Choose Available, Pending, Adopted or In Rehabilitation.`
    );
  }
  const norm = normalizePetStatus(status);
  if (norm === "In Rehabilitation") return PrismaPetStatus.In_Rehabilitation;
  if (norm === "Pending") return PrismaPetStatus.Pending;
  if (norm === "Adopted") return PrismaPetStatus.Adopted;
  return PrismaPetStatus.Available;
}

/** Known spellings, keyed case-, space- and underscore-insensitively. */
const DB_STATUS_SPELLINGS: Record<string, Pet["status"]> = {
  available: "Available",
  pending: "Pending",
  adopted: "Adopted",
  "in rehabilitation": "In Rehabilitation",
  rehabilitation: "In Rehabilitation",
};

/**
 * Maps a persisted PetStatus database enum or legacy string to domain PetStatus.
 *
 * The production column has held text rather than the enum, so drift in case or separator
 * (`adopted`, `IN_REHABILITATION`) is matched to the status it spells. Anything else is passed
 * through unchanged instead of becoming Available, which used to make an adopted animal with a
 * miscased status adoptable again. `isKnownPetStatus` is false for it, `getPetStatusPresentation`
 * presents it as not adoptable, and `submitApplication` refuses it by name.
 * `tasks/decisions/2026-10-27-an-unrecognised-pet-status-is-refused-not-available.md`.
 */
export function fromDbPetStatus(status: PrismaPetStatus | string): Pet["status"] {
  const key = status.trim().toLowerCase().replace(/[\s_]+/g, " ");
  // The cast is the honest gap: the domain type has no member for a value nobody anticipated.
  return DB_STATUS_SPELLINGS[key] ?? (status as Pet["status"]);
}

/**
 * Translation between persisted `pets` rows and the domain `Pet` shape.
 *
 * Deliberately free of Prisma and of cache state: this module is a pure
 * projection in both directions, which is what lets `petRepository` be read as
 * "DB-first with a fallback mirror" without 380 lines of column mapping in the way.
 */

export interface DbPetRecord {
  id: string;
  name: string;
  species: string;
  breed: string;
  birthDate?: string;
  birthDateIsEstimate?: boolean;
  age?: string;
  ageCategory?: string;
  gender: string;
  size: string;
  weight: string;
  status: PrismaPetStatus | string;
  adoptionFee: string;
  description: string;
  rescueStory: string;
  image: string;
  galleryImages: string[];
  tags: string[];
  featured: boolean;
  intakeDate: string;
  customQrUrl?: string | null;
  rehabStage: string | null;
  rehabStageMs: string | null;
  rehabProgressPercent: number | null;
  vaccinated: boolean;
  microchipped: boolean;
  spayedNeutered: boolean;
  specialNeeds: string | null;
  goodWithDogs: boolean;
  goodWithCats: boolean;
  goodWithKids: boolean;
  energyLevel: string;
  isArchived: boolean;
  deletedAt: Date | string | null;
  // Nested history. Absent unless the read asked for it via `include`.
  updates?: DbPetUpdateRecord[];
  medicalTimeline?: DbMedicalTimelineEventRecord[];
}

/** A persisted `pet_updates` row. */
export interface DbPetUpdateRecord {
  id: string;
  petId: string;
  date: string;
  title: string;
  titleMs: string | null;
  content: string;
  contentMs: string | null;
  image: string | null;
  category: string | null;
}

/** A persisted `medical_timeline_events` row. */
export interface DbMedicalTimelineEventRecord {
  id: string;
  petId: string;
  date: string;
  title: string;
  titleMs: string | null;
  category: string;
  description: string;
  descriptionMs: string | null;
  veterinarian: string | null;
  vetId?: string | null;
  vet?: { name: string; licenseNumber: string; clinicName?: string | null } | null;
  verified: boolean;
  badge: string | null;
  badgeMs: string | null;
}

/**
 * Columns written to the `pets` table. Kept as a named shape so the insert and
 * update paths cannot drift apart when a new column is added.
 */
export interface PetPersistencePayload {
  name: string;
  species: string;
  breed: string;
  birthDate: string;
  birthDateIsEstimate: boolean;
  gender: string;
  size: string;
  weight: string;
  status: PrismaPetStatus;
  adoptionFee: string;
  description: string;
  rescueStory: string;
  image: string;
  galleryImages: string[];
  tags: string[];
  featured: boolean;
  intakeDate: string;
  customQrUrl?: string | null;
  rehabStage: string | null;
  rehabStageMs: string | null;
  rehabProgressPercent: number | null;
  isArchived: boolean;
  deletedAt: Date | null;
  vaccinated: boolean;
  microchipped: boolean;
  spayedNeutered: boolean;
  specialNeeds: string | null;
  goodWithDogs: boolean;
  goodWithCats: boolean;
  goodWithKids: boolean;
  energyLevel: string;
}

/**
 * Ascending comparison on a `YYYY-MM-DD` string. Lexical order and calendar
 * order coincide for that format, so no `Date` parsing is needed.
 */
function byDateAscending(a: { date: string }, b: { date: string }): number {
  return a.date.localeCompare(b.date);
}

/**
 * Maps a history relation onto its domain shape, ordered by date.
 *
 * Returns `undefined` rather than `[]` for a pet with no rows, so a pet without
 * stored history is indistinguishable from a fixture that never had any — which
 * is what keeps `getPetMedicalTimeline`'s synthetic fallback firing.
 */
function mapHistoryRows<TRow extends { date: string }, TEvent>(
  rows: TRow[] | undefined,
  map: (row: TRow) => TEvent
): TEvent[] | undefined {
  if (!rows || rows.length === 0) return undefined;
  return [...rows].sort(byDateAscending).map(map);
}

function mapDbPetUpdate(row: DbPetUpdateRecord): PetUpdate {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    titleMs: row.titleMs ?? undefined,
    content: row.content,
    contentMs: row.contentMs ?? undefined,
    image: row.image ?? undefined,
    category: (row.category ?? undefined) as PetUpdate["category"],
  };
}

function mapDbMedicalTimelineEvent(row: DbMedicalTimelineEventRecord): MedicalTimelineEvent {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    titleMs: row.titleMs ?? undefined,
    category: row.category as MedicalTimelineEvent["category"],
    description: row.description,
    descriptionMs: row.descriptionMs ?? undefined,
    veterinarian: row.veterinarian || row.vet?.name || undefined,
    vetId: row.vetId ?? undefined,
    verified: row.verified,
    badge: row.badge ?? undefined,
    badgeMs: row.badgeMs ?? undefined,
  };
}

/**
 * Maps a persisted `pets` row onto the domain `Pet` shape. Nullable columns
 * become `undefined` so optional domain fields stay absent rather than null.
 */
export function mapDbPetToPet(p: DbPetRecord): Pet {
  const birthDate = deriveBirthDate(p);
  const birthDateIsEstimate = p.birthDateIsEstimate !== undefined ? p.birthDateIsEstimate : true;
  // Always derived, never read back from the row. `age`/`ageCategory` have not been columns
  // since 6108d82; preferring a stored value here only ever served stale fixture data (PS-114).
  const age = formatAgeString(birthDate).en;
  const ageCategory = computeAgeCategory(birthDate);

  return {
    id: p.id,
    name: p.name,
    species: p.species as Pet["species"],
    breed: p.breed,
    birthDate,
    birthDateIsEstimate,
    age,
    ageCategory,
    gender: p.gender as Pet["gender"],
    size: p.size as Pet["size"],
    weight: p.weight,
    status: fromDbPetStatus(p.status),
    adoptionFee: p.adoptionFee,
    description: p.description,
    rescueStory: p.rescueStory,
    image: p.image,
    galleryImages: p.galleryImages,
    tags: p.tags,
    featured: p.featured,
    intakeDate: p.intakeDate,
    customQrUrl: p.customQrUrl ?? null,
    rehabStage: p.rehabStage ?? undefined,
    rehabStageMs: p.rehabStageMs ?? undefined,
    rehabProgressPercent: p.rehabProgressPercent ?? undefined,
    isArchived: p.isArchived ?? false,
    deletedAt: p.deletedAt ? p.deletedAt.toString() : null,
    updates: mapHistoryRows(p.updates, mapDbPetUpdate),
    medicalTimeline: mapHistoryRows(p.medicalTimeline, mapDbMedicalTimelineEvent),
    medical: {
      vaccinated: p.vaccinated,
      microchipped: p.microchipped,
      spayedNeutered: p.spayedNeutered,
      specialNeeds: p.specialNeeds || undefined,
    },
    compatibility: {
      goodWithDogs: p.goodWithDogs,
      goodWithCats: p.goodWithCats,
      goodWithKids: p.goodWithKids,
      energyLevel: p.energyLevel as Pet["compatibility"]["energyLevel"],
    },
  };
}

/**
 * Flattens a domain `Pet` into the column set written by both create and update.
 * Normalizes status to Prisma enum and derives birth date.
 */
export function buildPetPersistencePayload(pet: Pet): PetPersistencePayload {
  const birthDate = deriveBirthDate(pet);
  // Guarded on `pet.birthDate`, unlike the read mapper above. `Pet.birthDate` is optional, so a
  // record can arrive with no birthday and `birthDateIsEstimate: false` — and `deriveBirthDate`
  // will then approximate one from the age prose. Persisting `false` beside an approximated date
  // claims the shelter knows a birthday it guessed. The read mapper needs no such guard: its
  // `birthDate` is a non-nullable column, so it is never absent on a row that exists.
  const birthDateIsEstimate = pet.birthDate
    ? (pet.birthDateIsEstimate !== undefined ? pet.birthDateIsEstimate : true)
    : true;

  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    birthDate,
    birthDateIsEstimate,
    gender: pet.gender,
    size: pet.size,
    weight: pet.weight,
    status: toDbPetStatus(pet.status),
    adoptionFee: pet.adoptionFee,
    description: pet.description,
    rescueStory: pet.rescueStory,
    image: pet.image,
    galleryImages: pet.galleryImages || [],
    tags: pet.tags || [],
    featured: pet.featured || false,
    intakeDate: pet.intakeDate,
    customQrUrl: pet.customQrUrl || null,
    rehabStage: pet.rehabStage ?? null,
    rehabStageMs: pet.rehabStageMs ?? null,
    rehabProgressPercent: pet.rehabProgressPercent ?? null,
    isArchived: pet.isArchived ?? false,
    deletedAt: pet.deletedAt ? new Date(pet.deletedAt) : null,
    vaccinated: pet.medical?.vaccinated ?? true,
    microchipped: pet.medical?.microchipped ?? true,
    spayedNeutered: pet.medical?.spayedNeutered ?? true,
    specialNeeds: pet.medical?.specialNeeds || null,
    goodWithDogs: pet.compatibility?.goodWithDogs ?? true,
    goodWithCats: pet.compatibility?.goodWithCats ?? true,
    goodWithKids: pet.compatibility?.goodWithKids ?? true,
    energyLevel: pet.compatibility?.energyLevel || "Moderate",
  };
}

/** A row written to `pet_updates`. `petId` comes from the nesting parent. */
export interface PetUpdatePersistenceRow {
  id: string;
  date: string;
  title: string;
  titleMs: string | null;
  content: string;
  contentMs: string | null;
  image: string | null;
  category: string | null;
}

/** A row written to `medical_timeline_events`. `petId` comes from the nesting parent. */
export interface MedicalTimelineEventPersistenceRow {
  id: string;
  date: string;
  title: string;
  titleMs: string | null;
  category: string;
  description: string;
  descriptionMs: string | null;
  veterinarian: string | null;
  vetId: string | null;
  verified: boolean;
  badge: string | null;
  badgeMs: string | null;
}

/** The nested-relation half of a pet write. */
export interface PetHistoryNestedCreate {
  updates: { create: PetUpdatePersistenceRow[] };
  medicalTimeline: { create: MedicalTimelineEventPersistenceRow[] };
}

export type PetCreatePayload = PetPersistencePayload & PetHistoryNestedCreate & { id: string };
export type PetUpdatePayload = PetPersistencePayload & PetHistoryNestedCreate;

/**
 * Flattens the two nested history collections into Prisma nested `create`s.
 *
 * Shared by both write paths so the column mapping cannot drift between them,
 * exactly as `buildPetPersistencePayload` does for the scalars. What the two
 * paths genuinely differ on is *clearing*: create starts from nothing, update
 * must delete the previous rows first — see `updateServerPet`.
 */
export function buildPetHistoryNestedCreate(pet: Pet): PetHistoryNestedCreate {
  return {
    updates: {
      create: (pet.updates ?? []).map((u) => ({
        id: u.id,
        date: u.date,
        title: u.title,
        titleMs: u.titleMs ?? null,
        content: u.content,
        contentMs: u.contentMs ?? null,
        image: u.image ?? null,
        category: u.category ?? null,
      })),
    },
    medicalTimeline: {
      create: (pet.medicalTimeline ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        title: e.title,
        titleMs: e.titleMs ?? null,
        category: e.category,
        description: e.description,
        descriptionMs: e.descriptionMs ?? null,
        veterinarian: e.veterinarian ?? null,
        vetId: e.vetId ?? null,
        verified: e.verified,
        badge: e.badge ?? null,
        badgeMs: e.badgeMs ?? null,
      })),
    },
  };
}

/** Everything `prisma.pet.create` needs: the id, the scalars, and nested history. */
export function buildPetCreatePayload(pet: Pet): PetCreatePayload {
  return {
    id: pet.id,
    ...buildPetPersistencePayload(pet),
    ...buildPetHistoryNestedCreate(pet),
  };
}

/**
 * Everything `prisma.pet.update` needs. The id is not written — it addresses
 * the row — and the previous history rows are removed by the surrounding
 * transaction rather than here, so this stays a pure projection of the pet.
 */
export function buildPetUpdatePayload(pet: Pet): PetUpdatePayload {
  return {
    ...buildPetPersistencePayload(pet),
    ...buildPetHistoryNestedCreate(pet),
  };
}

