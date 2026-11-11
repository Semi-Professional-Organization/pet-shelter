import initialPetsData from "@/data/pets.json";
import { Pet } from "@/types/pet";
import { isKnownPetStatus, validatePetTransition } from "@/lib/domain/stateMachine";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { SessionUser } from "@/lib/security/session";
import { prisma } from "@/lib/server/prisma";
import {
  handlePersistenceError,
  isDatabasePersistent,
  isRecordNotFound,
  isStrictPersistence,
} from "@/lib/persistenceMode";
import { withDerivedAge } from "@/lib/domain/petAge";
import {
  DbPetRecord,
  buildPetCreatePayload,
  buildPetUpdatePayload,
  mapDbPetToPet,
  assertKnownPetStatus,
  toDbPetStatus,
  type PetHistoryReplacement,
} from "./petMappers";
import { registerStateReset } from "@/lib/stateResets";

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

/** Test-only. Registered below for the test harness. */
export function resetPets(): void {
  serverPets = freshPets();
}

registerStateReset("pets", resetPets);

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
 * The database could not be asked about an animal, on a path that must not
 * answer from the mirror. Carries the underlying error as `cause`.
 */
export class PetStoreUnavailableError extends Error {
  readonly cause?: unknown;
  constructor(id: string, cause?: unknown) {
    // JSON-quoted: the id is caller-supplied, so a newline in it cannot forge a log line.
    super(`Could not read pet ${JSON.stringify(id)} from the database`);
    this.name = "PetStoreUnavailableError";
    this.cause = cause;
  }
}

/**
 * The outage answer for a read on a write path: log, and refuse with
 * {@link PetStoreUnavailableError} rather than answer from the mirror. Strict
 * persistence rethrows the query's own error, as `handlePersistenceError` does.
 */
function refuseForWrite(id: string, err: unknown): never {
  if (isStrictPersistence()) throw err;
  console.error(
    `[Database Store] Pet read for a write path failed for ${JSON.stringify(id)}:`,
    err instanceof Error ? err.message : err
  );
  throw new PetStoreUnavailableError(id, err);
}

/**
 * Reads one animal with its history, falling back to the mirror when the
 * database cannot answer — unless the caller passes `onOutage: "refuse"`.
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
 * **`onOutage`.** With the default `"mirror"`, a non-strict outage is answered
 * from the mirror, which is seeded from `src/data/pets.json`, so for a fixture
 * id this returns the demo animal. A profile page may show that for the length
 * of an outage. A write may not: with `"refuse"` the `catch` logs and throws
 * {@link PetStoreUnavailableError} instead, as {@link findPetForWriteAsync}
 * does. The admin edit and status change read their starting copy that way,
 * because they need the history this read joins; the public adoption and
 * sponsorship paths use {@link findPetForWriteAsync}
 * (`tasks/decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`).
 * Strict persistence rethrows the query's own error under either option.
 *
 * It used to fall through to the mirror on both exits, which published demo
 * data: an id present in `src/data/pets.json` but absent from a populated
 * database was served at its exact URL. Pinned by
 * `tests/integration/petMissingRowIsAnAnswer.test.ts`;
 * `tasks/decisions/2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`
 * carries the reasoning.
 */
export async function findServerPetByIdAsync(
  id: string,
  { onOutage = "mirror" }: { onOutage?: "mirror" | "refuse" } = {}
): Promise<Pet | null> {
  const norm = id.trim().toLowerCase();
  if (isDatabasePersistent()) {
    let row;
    try {
      row = await prisma.pet.findUnique({
        where: { id: id.trim() },
        include: PET_INCLUDE,
      });
    } catch (err) {
      // The admin edits read their starting copy here and must not start from the mirror, which
      // on a cold instance is `src/data/pets.json`: they ask to be refused instead.
      if (onOutage === "refuse") refuseForWrite(id.trim(), err);
      handlePersistenceError("Prisma pet find by id", err, "read");
      return findServerPetById(id);
    }
    // Outside the `try`: only the query is an outage. A mapping fault surfaces as itself.
    if (!row) return null;
    const pet = mapDbPetToPet(row as unknown as DbPetRecord);
    serverPets = [pet, ...serverPets.filter((p) => p.id.toLowerCase() !== norm)];
    return pet;
  }
  return findServerPetById(id);
}

/**
 * Reads one animal for a path that **writes a record or takes a pledge**.
 *
 * The same row as {@link findServerPetByIdAsync} with `onOutage: "refuse"`, but
 * without the history joins: when a database is configured and the query
 * throws, this throws
 * {@link PetStoreUnavailableError} rather than answering from the mirror, so
 * the caller refuses instead of acknowledging an application or a pledge
 * against a `src/data/pets.json` demo animal. Under strict persistence the
 * query's own error is rethrown verbatim, as `handlePersistenceError` does
 * everywhere else, so a broken query is not mistaken for an outage in tests.
 *
 * **The `pets` row only, and the mirror is left alone.** The callers read the
 * id, name, breed, status and archive flag, so the returned pet carries no
 * `updates` or `medicalTimeline`. Without the joins, a fault in those tables
 * cannot refuse an adoption or a pledge, and an anonymous POST no longer
 * reorders the mirror that `markCachedPetAdopted` searches.
 *
 * With no database configured the mirror is the whole store, the ledgers it
 * would be written to are in memory as well, and it is answered from there.
 */
export async function findPetForWriteAsync(id: string): Promise<Pet | null> {
  if (!isDatabasePersistent()) return findServerPetById(id);
  let row;
  try {
    row = await prisma.pet.findUnique({ where: { id: id.trim() } });
  } catch (err) {
    refuseForWrite(id.trim(), err);
  }
  return row ? mapDbPetToPet(row as unknown as DbPetRecord) : null;
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
 * array, and that read sits behind an anonymous profile GET (and, until
 * 2026-10-27, an unauthenticated adoption POST, which now reads with
 * `findPetForWriteAsync` and leaves the array alone). So a visitor could choose which of two
 * same-named animals `atomicUpdateApplicationStatus` marks on approval — and,
 * with no database, the caller writes the returned id into the
 * `PET_STATUS_TRANSITION_ADOPTED` audit row (with one, the row comes from the
 * transaction's own update), making it a wrong permanent record rather than a
 * stale cache.
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
  // Before the `try`: `handlePersistenceError` would swallow the refusal outside strict mode and
  // the mirror would take the pet anyway.
  assertKnownPetStatus(newPet.status);
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

/**
 * Writes an edit and returns the pet as stored, or `null` when nothing was written.
 *
 * `baseline` is the copy the caller read and edited: the admin actions pass the database copy
 * `findServerPetByIdAsync` gave them. The transition check, the audit row's `before`, the status
 * condition and the stored id all come from it, never from this instance's mirror. `id` must be
 * that stored id verbatim.
 *
 * Both writes match only while the row still holds `baseline`'s status, and
 * `columns: "status"` writes the status column alone. That guards the window between the
 * caller's read and this write (an approval that set Adopted in between matches no row, and is
 * reported as `null`); it does not know what an older admin table showed —
 * `tasks/open/admin-pet-writes-send-no-expected-status.md`.
 */
export async function updateServerPet(
  id: string,
  updated: Pet,
  actor: SessionUser,
  replaceHistory: PetHistoryReplacement,
  { baseline: previous, columns = "all" }: { baseline: Pet; columns?: "all" | "status" }
): Promise<Pet | null> {
  if (columns === "status" && (replaceHistory.updates || replaceHistory.medicalTimeline)) {
    throw new Error("updateServerPet: a status-only write cannot replace history");
  }
  // Every write below uses the id as stored. A lookup that trims or lowercases used to resolve a
  // padded or miscased id, update nothing, and report success.
  const storedId = previous.id;
  if (id !== storedId) {
    throw new Error(`updateServerPet: ${JSON.stringify(id)} is not the stored id ${JSON.stringify(storedId)}`);
  }

  if (previous.status !== updated.status) {
    validatePetTransition(previous.status, updated.status);
  }

  assertKnownPetStatus(updated.status); // before the `try`, as in `insertServerPet`
  // Before the `try` as well, so a throw here is never swallowed as an outage. A stored status
  // the enum does not know (`fromDbPetStatus` passes it through, and staff may move it to a
  // canonical one) has no enum value to match on.
  // ceiling: such a write matches on the id alone, so it is unguarded against a concurrent
  // change; Prisma's enum read normally fails before such a row gets here —
  // tasks/open/a-drifted-pet-status-fails-the-whole-prisma-read.md.
  const expectedStatus = isKnownPetStatus(previous.status) ? toDbPetStatus(previous.status) : undefined;
  // Both writes match only while the row still holds the status the transition was checked
  // against, so an approval landing between the caller's read and this write is not overwritten.
  const where = { id: storedId, ...(expectedStatus ? { status: expectedStatus } : {}) };
  const data =
    columns === "status"
      ? { status: toDbPetStatus(updated.status) }
      : buildPetUpdatePayload(updated, replaceHistory);

  try {
    if (columns === "status") {
      // `updateMany` reports a miss as `count: 0` rather than an error, as
      // `atomicUpdateApplicationStatus` relies on. The row may well still exist with a newer
      // status, so the mirror is left alone.
      const { count } = await prisma.pet.updateMany({ where, data });
      if (count === 0) {
        console.warn(
          `[Database Store] Pet status write matched no row for ${JSON.stringify(storedId)}: deleted or changed since it was read`
        );
        return null;
      }
    } else {
      // A collection is cleared and rewritten only when the caller says it is replacing it. The
      // rows carry columns the domain model does not (`createdAt`, `updatedAt`), so a rewrite is
      // never a no-op. `update` with a non-unique filter raises P2025 when nothing matches, and
      // the batch rolls back, so the history deletes do not commit without the row write.
      await prisma.$transaction([
        ...(replaceHistory.updates
          ? [prisma.petUpdate.deleteMany({ where: { petId: storedId } })]
          : []),
        ...(replaceHistory.medicalTimeline
          ? [prisma.medicalTimelineEvent.deleteMany({ where: { petId: storedId } })]
          : []),
        prisma.pet.update({ where, data }),
      ]);
    }
  } catch (err) {
    // No row matched: deleted, or its status changed, since it was read. Nothing was written, and
    // the caller is told so rather than handed a pet as if it had been. The mirror is left alone,
    // since the row may well still exist. Any other failure is still swallowed outside strict
    // mode — tasks/open/admin-pet-writes-succeed-against-the-mirror-during-an-outage.md.
    if (isRecordNotFound(err)) {
      if (isStrictPersistence()) throw err;
      console.warn(
        `[Database Store] Pet update matched no row for ${JSON.stringify(storedId)}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
    handlePersistenceError("Prisma pet update", err, "write");
  }

  // The server-side home of the keep-when-not-replaced rule; callers pass whatever they hold and
  // get back the pet as stored. A collection this write did not replace keeps the copy the mirror
  // holds *now*: not the caller's copy, and not `previous`, which was read before the await above
  // and may predate a concurrent write on this instance. `findServerPetByIdAsync` put the
  // baseline in the mirror, so in database mode this is the stored history unless such a write
  // has replaced it since.
  const keptFrom = serverPets.find((p) => p.id === storedId) ?? previous;
  // A status write changed one column, so it reports the baseline with that column, not the
  // caller's whole object: nothing it did not write is reported as stored.
  const written: Pet = columns === "status" ? { ...previous, status: updated.status } : updated;
  const stored: Pet = {
    ...written,
    id: storedId,
    updates: replaceHistory.updates ? updated.updates : keptFrom.updates,
    medicalTimeline: replaceHistory.medicalTimeline
      ? updated.medicalTimeline
      : keptFrom.medicalTimeline,
  };
  serverPets = serverPets.map((p) => (p.id === storedId ? stored : p));

  const auditedHistory = (pet: Pet): Partial<Pet> => {
    const { updates, medicalTimeline, ...rest } = pet;
    return {
      ...rest,
      ...(replaceHistory.updates ? { updates } : {}),
      ...(replaceHistory.medicalTimeline ? { medicalTimeline } : {}),
    };
  };

  recordAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "PET_UPDATED",
    entity: "Pet",
    entityId: storedId,
    // History appears only when this write replaced it. A collection it did not touch is whatever
    // the mirror held, which can be older than the database, and the audit row is permanent.
    details: { before: auditedHistory(previous), after: auditedHistory(stored) },
  });

  return stored;
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
