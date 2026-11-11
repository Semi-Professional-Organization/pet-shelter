# A pet archive or restore can report success for an id it did not write

**Status:** ASSERTED · opened 2026-11-11 · found while fixing #210/#211, reasoned from the code

`archiveServerPet` (`src/lib/server/petRepository.ts`, behind `toggleArchivePet` and `deletePet`)
has the shape #210 had in `updateServerPet`: it looks in the mirror with `p.id === id`, falls back
to `findServerPetByIdAsync`, which trims, and then writes `prisma.pet.update({ where: { id } })`
with the caller's raw id. So ` pet-009` is found, the update throws P2025, `handlePersistenceError`
swallows it outside strict mode, and the action reports the animal archived. #210/#211 fixed the
edit and status change only; the archive path was out of that brief's scope.

**Settles when:** `archiveServerPet` writes with the stored id it found and returns `false` on
P2025 (`isRecordNotFound` in `src/lib/persistenceMode.ts`), or `toggleArchivePet` refuses an id
that is not stored verbatim, with a test for a padded and a miscased id.
