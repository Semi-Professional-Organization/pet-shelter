import initialPetsData from "@/data/pets.json";
import { Pet } from "@/types/pet";
import { validatePetTransition } from "@/lib/domain/stateMachine";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError, isDatabasePersistent } from "@/lib/persistenceMode";
import { withDerivedAge } from "@/lib/domain/petAge";
import {
  DbPetRecord,
  buildPetCreatePayload,
  buildPetUpdatePayload,
  mapDbPetToPet,
} from "./petMappers";

/**
 * Pet reads and writes over the repository layer.
 *
 * Ordering invariant for every write path: **database first, mirror second.**
 * The in-memory fixture store is a fallback read source, never a source of
 * truth — it is only mutated *after* the database confirms the write (or when
 * no database is configured). A cache entry can therefore never describe a
 * state the database refused.
 *
 * Deterministic storage strategy:
 * - When DATABASE_URL is set / active: pure Prisma persistence with ACID guarantees.
 * - When offline / test mode: isolated in-memory fixture store for fast zero-dependency runs.
 */

const PET_INCLUDE = {
  updates: { orderBy: { date: "asc" as const } },
  medicalTimeline: {
    orderBy: { date: "asc" as const },
    include: { vet: true },
  },
} as const;

function freshPets(): Pet[] {
  // Ages are recomputed on load: the fixture's stored `age` strings are frozen prose and rot
  // against the calendar, so the fallback store would otherwise disagree with the DB path (PS-114).
  return (structuredClone(initialPetsData) as Pet[]).map((pet) => withDerivedAge(pet));
}

let serverPets: Pet[] = freshPets();

/** Test-only. Reached through `resetServerStore()` in `./fallbackState`. */
export function resetPets(): void {
  serverPets = freshPets();
}

export function getServerPets(): Pet[] {
  return serverPets;
}

/**
 * Lists all pets.
 *
 * An empty result is a *valid answer* — a freshly provisioned or fully archived
 * database genuinely has no pets — and is returned as `[]` rather than treated
 * as a failure. Only a thrown query error falls back, via the shared decision
 * point, to the in-memory store.
 */
export async function getServerPetsAsync(): Promise<Pet[]> {
  try {
    const dbPets = await prisma.pet.findMany({
      orderBy: { createdAt: "desc" },
      include: PET_INCLUDE,
    });
    const pets = dbPets.map((row) => mapDbPetToPet(row as unknown as DbPetRecord));
    serverPets = pets;
    return pets;
  } catch (err) {
    handlePersistenceError("Prisma pet query", err, "read");
    return serverPets;
  }
}

/**
 * Reads an animal's stored gallery straight from the database.
 *
 * The in-memory store is seeded from fixtures and mutated only by writes this
 * process handled — it cannot be the baseline for "which photos are new":
 * another instance's uploads are invisible to it, so those photos would look
 * new again and supporters are mailed them a second time. Only the database
 * can answer this question.
 *
 * Returns null when the row does not exist. Read failures are routed through
 * the shared persistence decision point (strict mode rethrows) before falling
 * back to null, so the caller's fallback is never reached silently.
 */
export async function getStoredGalleryImages(id: string): Promise<string[] | null> {
  try {
    const row = await prisma.pet.findUnique({
      where: { id },
      select: { galleryImages: true },
    });
    return row ? row.galleryImages : null;
  } catch (err) {
    handlePersistenceError("Prisma gallery read", err, "read");
    return null;
  }
}

/**
 * Reads one animal from PostgreSQL with full relations, syncing it to the
 * in-memory mirror cache on the way back.
 *
 * **"No such row" is an answer, not an outage.** A successful query that found
 * nothing returns `null`; the mirror is reached only when the query *threw*, or
 * when no database is configured at all.
 *
 * That is the same *policy* `getServerPetsAsync` above and `getServerFaqsAsync`
 * follow — an empty result is an answer — but not the same trigger, and the
 * difference is worth knowing before you copy one into the other. Those two
 * always issue their query and reach the fixture only from `catch`. This one is
 * additionally gated on `isDatabasePersistent()`, because a single-row read has
 * a third case they do not: no database configured at all, where there is
 * nothing to ask and the mirror is the whole store.
 *
 * **What this does not close: the `catch` path still serves fixtures.** A
 * transient read failure in non-strict mode — which is every deployed
 * environment; `STRICT_PERSISTENCE` is set only by `vitest.config.mts` and the
 * `test:integration` script — falls
 * back to the mirror, and for an id that really is in `pets.json` that means
 * the demo animal, at its exact URL, with `getPetById`'s exact-id guard
 * satisfied. Deliberate, because serving a stale read beats serving an error,
 * and recorded in `tasks/open/an-outage-serves-and-bills-fixture-animals.md`
 * because on this path it is also what a sponsorship pledge gets billed to.
 *
 * It used to fall through to the mirror on both exits, which published demo
 * data: an id present in `src/data/pets.json` but absent from a populated
 * database was served at its exact URL — `/pets` omitted it, because the
 * catalogue returns whatever the database returned, so the animal was
 * unreachable from the grid and reachable by direct link — and sponsorship
 * checkout recorded pledges against the fixture's name. A hard-deleted row, or
 * a fixture id production was never seeded with, was enough. Pinned by
 * `tests/integration/petMissingRowIsAnAnswer.test.ts`;
 * `tasks/decisions/2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`
 * carries the reasoning and the one case this deliberately stops serving.
 */
export async function findServerPetByIdAsync(id: string): Promise<Pet | null> {
  const norm = id.trim().toLowerCase();
  if (isDatabasePersistent()) {
    try {
      const row = await prisma.pet.findUnique({
        where: { id: id.trim() },
        include: PET_INCLUDE,
      });
      if (!row) return null;
      const pet = mapDbPetToPet(row as unknown as DbPetRecord);
      serverPets = [pet, ...serverPets.filter((p) => p.id.toLowerCase() !== norm)];
      return pet;
    } catch (err) {
      handlePersistenceError("Prisma pet find by id", err, "read");
      return findServerPetById(id);
    }
  }
  return findServerPetById(id);
}

export function findServerPetById(id: string): Pet | null {
  const norm = id.trim().toLowerCase();
  return serverPets.find((p) => p.id.toLowerCase() === norm) || null;
}

/**
 * Marks the cached pet adopted and returns it, or null when no pet matches.
 *
 * **The id is tried against the whole array before the name is tried at all.**
 * It used to be one predicate — `p.id === petId || p.name === petName` — and
 * `find` walks in order, so a *name* match on an earlier entry beat the exact
 * *id* match on a later one. Two shelter animals sharing a name was enough.
 *
 * That mattered because the order is publicly influenceable:
 * `findServerPetByIdAsync` moves every animal it reads to the head of this
 * array, and that read sits behind an anonymous profile GET and an
 * unauthenticated adoption POST. So a visitor could choose which of two
 * same-named animals `atomicUpdateApplicationStatus` marks on approval — and
 * the caller writes the returned id into the `PET_STATUS_TRANSITION_ADOPTED`
 * audit row, making it a wrong permanent record rather than a stale cache.
 * Pinned by `tests/integration/approvalMarksTheAnimalItAsksFor.test.ts`;
 * settled in `tasks/decisions/2026-09-22-an-approval-marks-the-id-it-asks-for.md`.
 *
 * The name fallback stays, but only for an application that carries **no id at
 * all** — the ones predating the `petId` column, where the name is the only
 * identifier there is. An id that was supplied and did not match resolves to
 * `null` rather than to a name match, because "the id you named does not exist,
 * so here is someone with the same name" is how the attack survives a fix that
 * only reorders the two lookups. PR #93 has since made `submitApplication`
 * refuse an unknown id, so that input no longer reaches here; the rule stays
 * next to the lookup that depends on it. See the body for what that costs.
 *
 * Replace-on-write: the mirror array is never mutated in place, so concurrent
 * readers never observe a partially-updated entry.
 */
export function markCachedPetAdopted(petId: string, petName: string): Pet | null {
  // An id that was given and does not match resolves to nothing, rather than falling through to
  // the name. This is **defence in depth, and was not when it was written**: at that point
  // `submitApplication` accepted any non-empty `petId` — `applicationFormSchema` asks only for
  // `z.string().min(1)` and the check read `pet && pet.isArchived`, which skipped entirely when
  // nothing matched — so a submission naming a pet that does not exist was resolved by name
  // against whatever the caller had floated to the head of the mirror, while the transaction's
  // `updateMany` matched 0 rows. PR #93 closed that caller: it trims, refuses `!pet || pet.id
  // !== requestedPetId`, and stores `petId: pet.id` from the verified row. So the hostile input
  // no longer arrives here — and this stays, because the guarantee belongs next to the lookup
  // that depends on it rather than one caller away.
  //
  // `findServerPetById` rather than a `===` comparison, for consistency: it is the lookup this
  // file already uses for an id, and re-implementing it with different matching is how two
  // readers of the same identifier drift. Note the asymmetry it leaves — it normalises
  // (`trim().toLowerCase()`) while the database update beside it is a Postgres `=` on the raw
  // value, so a padded or miscased id would mark the mirror while updating no rows. Not
  // reachable today: `AdoptionApplication.petId` carries an FK to `Pet.id`, so a stored id is an
  // exact one.
  const requestedId = petId.trim();
  const target = requestedId
    ? findServerPetById(requestedId)
    : // No id at all: applications predating the `petId` column, where the name is the only
      // identifier there is. Name comparison left exactly as it was — `toLowerCase`, no trim.
      serverPets.find((p) => p.name.toLowerCase() === petName.toLowerCase());
  if (!target) return null;
  const adopted = { ...target, status: "Adopted" as const };
  serverPets = serverPets.map((p) => (p.id === target.id ? adopted : p));
  return adopted;
}

export async function insertServerPet(newPet: Pet, actor: SessionUser): Promise<void> {
  // DB first: a refused write must not leave the mirror ahead of the database.
  try {
    await prisma.pet.create({
      data: buildPetCreatePayload(newPet),
    });
  } catch (err) {
    handlePersistenceError("Prisma pet creation", err, "write");
    // Unique violations rethrow (see persistenceMode) — never mirror a conflicted id.
  }

  serverPets = [newPet, ...serverPets.filter((p) => p.id !== newPet.id)];

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "PET_CREATED",
    entity: "Pet",
    entityId: newPet.id,
    details: { name: newPet.name, species: newPet.species, status: newPet.status },
  });
}

export async function updateServerPet(id: string, updated: Pet, actor: SessionUser): Promise<boolean> {
  let previous = serverPets.find((p) => p.id === id);
  if (!previous && isDatabasePersistent()) {
    const fromDb = await findServerPetByIdAsync(id);
    if (fromDb) previous = fromDb;
  }
  if (!previous) return false;

  if (previous.status !== updated.status) {
    validatePetTransition(previous.status, updated.status);
  }

  try {
    await prisma.$transaction([
      prisma.petUpdate.deleteMany({ where: { petId: id } }),
      prisma.medicalTimelineEvent.deleteMany({ where: { petId: id } }),
      prisma.pet.update({
        where: { id },
        data: buildPetUpdatePayload(updated),
      }),
    ]);
  } catch (err) {
    handlePersistenceError("Prisma pet update", err, "write");
  }

  serverPets = serverPets.map((p) => (p.id === id ? updated : p));

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "PET_UPDATED",
    entity: "Pet",
    entityId: id,
    details: { before: previous, after: updated },
  });

  return true;
}

export async function archiveServerPet(id: string, archive: boolean, actor: SessionUser): Promise<boolean> {
  let pet = serverPets.find((p) => p.id === id);
  if (!pet && isDatabasePersistent()) {
    const fromDb = await findServerPetByIdAsync(id);
    if (fromDb) pet = fromDb;
  }
  if (!pet) return false;

  // One timestamp for all three representations (column, mirror, audit log) —
  // calling `new Date()` per site can straddle a boundary and disagree.
  const deletedAt = archive ? new Date() : null;

  try {
    await prisma.pet.update({
      where: { id },
      data: { isArchived: archive, deletedAt },
    });
  } catch (err) {
    handlePersistenceError("Prisma pet archive", err, "write");
  }

  serverPets = serverPets.map((p) =>
    p.id === id ? { ...p, isArchived: archive, deletedAt: deletedAt?.toISOString() ?? null } : p
  );

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: archive ? "PET_ARCHIVED" : "PET_RESTORED",
    entity: "Pet",
    entityId: id,
    details: { petName: pet.name, isArchived: archive, deletedAt: deletedAt?.toISOString() ?? null },
  });

  return true;
}

export async function deleteServerPet(id: string, actor: SessionUser): Promise<boolean> {
  return archiveServerPet(id, true, actor);
}
