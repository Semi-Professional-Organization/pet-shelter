# Creating a pet uses a timestamp id that can collide

**Status:** ASSERTED · opened 2026-11-11 · found by review while fixing #201, reasoned from the code

`createPet` in `src/actions/pets.ts` builds `pet-${Date.now()}` (and the client pet store does the
same). Two creates in the same millisecond collide, the insert raises P2002 on `id`, and the
action's catch returns Prisma's text to staff. It is the shape #201 fixed for applications, on a
staff-only path.

**Settles when:** pet ids cannot collide, or a collision is retried, pinned by a test that makes
the first insert raise P2002 on `id`.

## 2026-11-12: the optimistic row and the database row get different ids (review of #212)

`usePetTableController.handleFormSubmit` calls the store's `addPet` and the `createPet` action
separately, and each mints its own `pet-${Date.now()}` at a different moment. The table shows the
store's id, while the database holds the action's. An edit or archive of a just-created row before
a reload therefore sends an id the database has never seen, and the action answers "Pet not found".
The shared `buildNewPet` takes the id as an argument, so one id minted once and passed to both, or
taken from the action's result, would close this half. Recorded rather than fixed in #212, which
changed how the record is built but not where its id comes from.
