# A pet edit or status change can report success when nothing was written

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

The actions find the pet with `findServerPetById`, which trims and lowercases the id, but
`updateServerPet` (`src/lib/server/petRepository.ts`) matches the mirror with `p.id === id`. It
returns the stored pet, or `null` when it found nothing. Two paths remain:

- `updatePetStatus` (`src/actions/pets.ts`) ignores the result, so a miscased id (`PET-009`), which
  the case-sensitive database lookup does not find, writes nothing and still reports success.
  `updatePet` already refuses a `null` result since #196.
- A padded id (` pet-009`) is found by the lookup on the trimmed id, then
  `prisma.pet.update({ where: { id } })` with the raw id throws P2025. Outside strict mode
  `handlePersistenceError` swallows that and `updateServerPet` returns a pet as if it had written.

Either way the admin table's optimistic update never rolls back.

Pre-existing, and outside #107's scope, which is why it was recorded rather than fixed there. It is
the same family as a write that fails during a database outage and still reports success.

**Settles when:** `updateServerPet` matches and writes with the stored id it found (or refuses an id
that is not stored verbatim), returns `null` when nothing was written, and `updatePetStatus` refuses
a `null` result, with a test for a padded and a miscased id.
