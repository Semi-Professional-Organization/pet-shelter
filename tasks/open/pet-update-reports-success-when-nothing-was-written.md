# A pet edit or status change can report success when nothing was written

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`updatePet` and `updatePetStatus` in `src/actions/pets.ts` ignore the boolean `updateServerPet`
returns, and `updateServerPet` itself can return `true` without writing. The action finds the pet
with `findServerPetById`, which trims and lowercases the id. `updateServerPet` matches the mirror
with `p.id === id`; on a miss in database mode it looks the row up by the trimmed id, finds it, and
then calls `prisma.pet.update({ where: { id } })` with the raw id, which throws P2025. Outside
strict mode `handlePersistenceError` swallows that, the mirror map matches nothing, and the function
still returns `true`. So an id like ` pet-009` or `PET-009` writes nothing and the caller gets
`{ success: true }`; the admin table's optimistic update never rolls back.

Pre-existing, and outside #107's scope, which is why it was recorded rather than fixed there. It is
the same family as a write that fails during a database outage and still reports success.

**Settles when:** `updateServerPet` writes and matches with the stored id it found (or refuses an id
that is not stored verbatim), returns `false` when nothing was written, and both actions return
`success: false` on `false`, with a test for a padded and a differently-cased id.
