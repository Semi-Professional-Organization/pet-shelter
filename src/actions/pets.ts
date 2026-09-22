"use server";

import { revalidatePath } from "next/cache";
import {
  petFormSchema,
  PetFormInput,
  PetFilterInput,
  sortHistoryByDate,
} from "@/lib/validations/pet";
import { Pet } from "@/types/pet";
import { normalizePetStatus } from "@/lib/domain/stateMachine";
import { matchesPetSearch } from "@/lib/domain/petSearch";
import { getVerifiedSession } from "@/lib/security/dal";
import { AdminPrincipal, verifyAdminSession } from "@/lib/security/adminSession";
import { assertHasPermission, PERMISSIONS, UnauthorizedError } from "@/lib/security/rbac";
import {
  getServerPetsAsync,
  findServerPetById,
  findServerPetByIdAsync,
  insertServerPet,
  updateServerPet,
  archiveServerPet,
  getStoredGalleryImages,
} from "@/lib/server/petRepository";
import { scheduleAfterResponse } from "@/lib/scheduleAfterResponse";
import {
  diffNewGalleryImages,
  dispatchPetPhotoUpdate,
} from "@/lib/domain/photoUpdateDispatch";
import { photoNotificationSchema, PhotoNotificationInput } from "@/lib/validations/pet";
import { getServerApplicationsAsync } from "@/lib/server/applicationRepository";

/**
 * Public catalog query: only returns active, non-archived pets.
 */
export async function getPublicPets(filters?: PetFilterInput): Promise<Pet[]> {
  const allPets = await getServerPetsAsync();
  let filtered = allPets.filter((p) => !p.isArchived);

  if (filters?.species && filters.species !== "all") {
    filtered = filtered.filter((p) => p.species === filters.species);
  }

  if (filters?.gender && filters.gender !== "all") {
    filtered = filtered.filter((p) => p.gender === filters.gender);
  }

  if (filters?.status && filters.status !== "all") {
    // Compare canonically so "Rehabilitation" and "In Rehabilitation" match each other.
    const wantedStatus = normalizePetStatus(filters.status);
    filtered = filtered.filter((p) => normalizePetStatus(p.status) === wantedStatus);
  }

  if (filters?.ageCategory && filters.ageCategory !== "all") {
    filtered = filtered.filter((p) => p.ageCategory === filters.ageCategory);
  }

  if (filters?.size && filters.size !== "all") {
    filtered = filtered.filter((p) => p.size === filters.size);
  }

  if (filters?.search) {
    // The same rule the gallery filters with, not a copy of it — see `matchesPetSearch`.
    const query = filters.search;
    filtered = filtered.filter((p) => matchesPetSearch(p, query));
  }

  return filtered;
}

/**
 * Backward-compatible alias for getPublicPets
 */
export async function getPets(filters?: PetFilterInput): Promise<Pet[]> {
  return getPublicPets(filters);
}

/**
 * Admin catalog query: includes all pets (archived and active) with linked application counts.
 *
 * Guarded because /admin/pets is a Server Component that calls this directly.
 * The admin layout is a client component and hides the table until its session
 * effect resolves, but server-component output is serialised into the RSC
 * flight payload regardless of whether the layout mounts it — so without this
 * check an anonymous request to /admin/pets received the whole inventory,
 * archived animals and application counts included. Authorization belongs as
 * close to the data as possible; the route-level 403 is a separate concern.
 */
export async function getAdminPets(): Promise<(Pet & { applicationCount: number })[]> {
  const session = await getVerifiedSession();
  assertHasPermission(session, PERMISSIONS.MANAGE_PETS);

  const allPets = await getServerPetsAsync();
  const apps = await getServerApplicationsAsync();

  return allPets.map((pet) => {
    const petApps = apps.filter(
      (a) => a.petId === pet.id || a.petName.toLowerCase() === pet.name.toLowerCase()
    );
    return {
      ...pet,
      applicationCount: petApps.length,
    };
  });
}

/**
 * Public profile read: an archived animal is not found.
 *
 * `getPublicPets` has filtered archived rows since it was written, but this — the reader behind
 * `/pets/[id]`, its only production caller — did not, so a soft-deleted animal kept its public
 * page and stayed reachable by direct link and by anything holding the old URL. Archiving is the
 * shelter's "take this down" action, and it was only taking down the grid.
 *
 * The repository stays unfiltered on purpose: `findServerPetById` is what the update and archive
 * mutations read with, and they must see the row they are about to write.
 */
export async function getPetById(id: string): Promise<Pet | null> {
  // `findServerPetByIdAsync`, not `findServerPetById`. The synchronous reader only searches the
  // in-memory mirror, which a cold process initialises from `src/data/pets.json` — so an archive
  // performed in another instance was invisible here, and the guard below read `isArchived` off
  // a fixture. The same read also 404'd any animal that exists only in the database. The
  // catalogue beside it has always gone through the async path (`getServerPetsAsync`); this is
  // the single-animal read catching up with it.
  //
  // And an exact id match, not just a found one. The database lookup is case-sensitive; the
  // in-memory fallback it drops to when that lookup finds nothing is not. So `/pets/PET-001`
  // missed Postgres, fell through to the mirror, matched fixture `pet-001` — unarchived there —
  // and served an animal the database had archived. Refusing any result whose id is not exactly
  // the one requested makes both readers agree without assuming anything about id casing.
  //
  // The exact-id guard still earns its place, but it is no longer the only thing standing
  // between this page and the fixture. A database that answers "no such row" for an id that
  // *is* in `pets.json` used to fall through and publish the demo animal; the repository now
  // returns null for that, and reaches the mirror only from its `catch` or with no database
  // configured (`tasks/decisions/2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`).
  // Two routes to the mirror remain — no database configured, and a non-strict outage, whose
  // `catch` also returns `findServerPetById(id)` — and on both the mirror's lookup lowercases.
  // The guard below is what refuses `/pets/PET-001` there. Be precise about what that buys:
  // it refuses a *case-variant* of a fixture id, and nothing more. `/pets/pet-001`, spelled
  // exactly as `pets.json` spells it, satisfies `pet.id === requested` and is served from the
  // fixture on either route. That residual is deliberate and recorded in
  // `tasks/open/an-outage-serves-and-bills-fixture-animals.md`. So: do not delete this guard on
  // the grounds that the repository "returns null now" — it does not, on those two paths — and
  // do not read it as closing them.
  const requested = id.trim();
  const pet = await findServerPetByIdAsync(requested);
  if (!pet || pet.id !== requested || pet.isArchived) return null;
  return pet;
}

/**
 * The actor to attribute a privileged pet mutation to.
 *
 * `verifyAdminSession()` names the principal it authorized, so the second
 * session read this used to do is gone -- and with it the case where the legacy
 * token authorized the request but a lower-privileged session cookie was
 * present, and *that* user got written into the audit row.
 *
 * Asks for MANAGE_PETS specifically rather than "is an operator", so a
 * CONTENT_EDITOR cannot reach the pet mutations.
 */
async function getAdminActorOrThrow(): Promise<AdminPrincipal> {
  const principal = await verifyAdminSession(PERMISSIONS.MANAGE_PETS);
  if (principal) return principal;

  // Nothing authorized this, in any environment. There was a
  // `NODE_ENV === "production"` guard around this throw, which meant every
  // other build -- `next dev` on a LAN, a preview deployment, a container
  // that leaves NODE_ENV unset, CI -- handed an unauthenticated caller an
  // ADMIN principal and let all five mutations below proceed. The typed
  // error is what the rest of the RBAC layer raises; the message is kept
  // verbatim because it reaches the admin UI through each action's catch.
  // See docs/archives/tasks/URGENT_NONPRODUCTION_ADMIN_BYPASS.md.
  throw new UnauthorizedError("Unauthorized: Admin authorization required");
}

export async function createPet(
  data: PetFormInput
): Promise<{ success: boolean; data?: Pet; error?: string }> {
  try {
    const actor = await getAdminActorOrThrow();
    const validated = petFormSchema.parse(data);

    const newPet: Pet = {
      id: `pet-${Date.now()}`,
      name: validated.name,
      species: validated.species,
      breed: validated.breed,
      age: validated.age,
      ageCategory: validated.ageCategory,
      gender: validated.gender,
      size: validated.size,
      weight: validated.weight,
      status: validated.status,
      adoptionFee: validated.adoptionFee,
      description: validated.description,
      rescueStory: validated.rescueStory,
      image: validated.image,
      galleryImages: validated.galleryImages || [],
      tags: validated.tags,
      featured: validated.featured,
      intakeDate: validated.intakeDate,
      customQrUrl: validated.customQrUrl || null,
      rehabStage: validated.rehabStage,
      rehabStageMs: validated.rehabStageMs,
      rehabProgressPercent: validated.rehabProgressPercent,
      updates: sortHistoryByDate(validated.updates),
      medicalTimeline: sortHistoryByDate(validated.medicalTimeline),
      isArchived: validated.isArchived ?? false,
      deletedAt: validated.deletedAt ?? null,
      medical: {
        vaccinated: validated.vaccinated,
        microchipped: validated.microchipped,
        spayedNeutered: validated.spayedNeutered,
        specialNeeds: validated.specialNeeds,
      },
      compatibility: {
        goodWithDogs: validated.goodWithDogs,
        goodWithCats: validated.goodWithCats,
        goodWithKids: validated.goodWithKids,
        energyLevel: validated.energyLevel,
      },
    };

    await insertServerPet(newPet, actor);

    revalidatePath("/pets");
    revalidatePath("/admin/pets");
    revalidatePath("/");

    return { success: true, data: newPet };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create pet record";
    return { success: false, error: msg };
  }
}

/**
 * Whether to notify this animal's supporters about photos added by this save,
 * plus an optional caregiver note quoted in the email.
 *
 * Explicit opt-in at the API level: the admin form defaults the checkbox to
 * checked, but no other caller of `updatePet` can mail supporters by accident.
 * Validated with `photoNotificationSchema` — Server Action arguments are
 * untrusted input, and this one reaches both the email body and the audit
 * metadata column.
 */
export type PhotoNotificationOptions = PhotoNotificationInput;

export async function updatePet(
  id: string,
  data: PetFormInput,
  notification?: PhotoNotificationOptions
): Promise<{ success: boolean; data?: Pet; error?: string }> {
  try {
    const actor = await getAdminActorOrThrow();
    const validated = petFormSchema.parse(data);
    const existing = findServerPetById(id);

    if (!existing) {
      return { success: false, error: "Pet not found" };
    }

    const parsedNotification = notification
      ? photoNotificationSchema.safeParse(notification)
      : null;

    if (parsedNotification && !parsedNotification.success) {
      // Surfaced rather than silently dropped: the admin wrote a note that will
      // not be sent, and needs to know before walking away.
      return {
        success: false,
        error:
          parsedNotification.error.issues[0]?.message ||
          "Invalid sponsor notification options",
      };
    }

    const notify = parsedNotification?.data;
    const wantsNotification = notify?.notifySponsors === true;

    // Captured before the write: the dispatcher compares against the gallery as
    // it stood, not as it is about to stand. Prefer the database over the
    // in-memory record, which reflects only this instance's own writes and would
    // make another instance's photos look new again.
    const storedGallery = wantsNotification ? await getStoredGalleryImages(id) : null;
    const previousGallery = storedGallery ?? [...(existing.galleryImages || [])];

    const updated: Pet = {
      ...existing,
      ...validated,
      // The submitted form is authoritative for rehabilitation progress: omitting the
      // fields clears them, so a cleared animal cannot keep a stale progress bar.
      rehabStage: validated.rehabStage,
      rehabStageMs: validated.rehabStageMs,
      rehabProgressPercent: validated.rehabProgressPercent,
      // Same rule for nested history, and the same reason. Zod drops absent
      // optional keys, so `{...existing, ...validated}` would silently keep an
      // event the submitter deleted. Assigning unconditionally makes removal by
      // omission — not just by an explicit empty array — actually delete rows.
      updates: sortHistoryByDate(validated.updates),
      medicalTimeline: sortHistoryByDate(validated.medicalTimeline),
      galleryImages: validated.galleryImages || existing.galleryImages || [],
      isArchived: validated.isArchived ?? existing.isArchived ?? false,
      deletedAt: validated.deletedAt !== undefined ? validated.deletedAt : existing.deletedAt,
      medical: {
        vaccinated: validated.vaccinated,
        microchipped: validated.microchipped,
        spayedNeutered: validated.spayedNeutered,
        specialNeeds: validated.specialNeeds,
      },
      compatibility: {
        goodWithDogs: validated.goodWithDogs,
        goodWithCats: validated.goodWithCats,
        goodWithKids: validated.goodWithKids,
        energyLevel: validated.energyLevel,
      },
    };

    await updateServerPet(id, updated, actor);

    // Only *newly added* gallery photos trigger supporter mail. Saving the form
    // after editing a description, or reordering the existing gallery, notifies
    // nobody.
    const newPhotos = diffNewGalleryImages(previousGallery, updated.galleryImages);

    if (wantsNotification && newPhotos.length > 0) {
      // Deferred with `after()` so the admin save returns immediately while the
      // fan-out runs on an invocation the platform keeps alive.
      scheduleAfterResponse(() =>
        dispatchPetPhotoUpdate({
          petId: id,
          petName: updated.name,
          newImageUrls: newPhotos,
          caption: notify?.caption,
          notifySponsors: true,
          petIsArchived: updated.isArchived,
          actorEmail: actor.email,
        })
      );
    }

    revalidatePath("/pets");
    revalidatePath(`/pets/${id}`);
    revalidatePath("/admin/pets");
    revalidatePath("/");

    return { success: true, data: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update pet record";
    return { success: false, error: msg };
  }
}

/**
 * Soft delete or restore an animal record
 */
export async function toggleArchivePet(
  id: string,
  archive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await getAdminActorOrThrow();
    const ok = await archiveServerPet(id, archive, actor);
    if (!ok) {
      return { success: false, error: "Pet not found" };
    }

    revalidatePath("/pets");
    revalidatePath(`/pets/${id}`);
    revalidatePath("/admin/pets");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to archive pet";
    return { success: false, error: msg };
  }
}

/**
 * Soft delete (archive) pet
 */
export async function deletePet(id: string): Promise<{ success: boolean; error?: string }> {
  return toggleArchivePet(id, true);
}

export async function updatePetStatus(
  id: string,
  status: Pet["status"]
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await getAdminActorOrThrow();
    const existing = findServerPetById(id);
    if (!existing) {
      return { success: false, error: "Pet not found" };
    }

    const updated: Pet = { ...existing, status };
    await updateServerPet(id, updated, actor);

    revalidatePath("/pets");
    revalidatePath(`/pets/${id}`);
    revalidatePath("/admin/pets");
    revalidatePath("/");

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update pet status";
    return { success: false, error: msg };
  }
}
