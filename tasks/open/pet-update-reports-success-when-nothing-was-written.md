# A pet edit or status change can report success when nothing was written

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`updatePet` and `updatePetStatus` in `src/actions/pets.ts` ignore the boolean `updateServerPet`
returns. The action finds the pet with `findServerPetById`, which trims and lowercases the id, but
`updateServerPet` matches the mirror with `p.id === id` and queries the database with the raw id.
So an id like `PET-009` or ` pet-009` passes the action's lookup, matches nothing in the repository,
writes nothing, and the caller still gets `{ success: true }`; the admin table's optimistic update
never rolls back.

Pre-existing, and outside #107's scope, which is why it was recorded rather than fixed there. It is
the same family as a write that fails during a database outage and still reports success.

**Settles when:** both actions return `success: false` when `updateServerPet` returns false, and the
repository uses the same id normalisation as the action's lookup (or the action passes the stored
id it found), with a test for a differently-cased id.
