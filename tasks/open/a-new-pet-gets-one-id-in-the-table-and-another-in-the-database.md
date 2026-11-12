# A new pet gets one id in the admin table and another in the database

**Status:** ASSERTED · opened 2026-11-12 · found by `/code-review xhigh` on #212, reasoned from the code

`usePetTableController.handleFormSubmit` calls the store's `addPet` and the `createPet` action
separately, and each mints its own `pet-${Date.now()}` at a different moment. The table shows the
store's id, while the database holds the action's. An edit or archive of a just-created row before
a reload therefore sends an id the database has never seen, and the action answers "Pet not found".

The shared `buildNewPet` (`src/lib/domain/petEdit.ts`) takes the id as an argument, so one id
minted once and passed to both, or the row adopting the id in the action's result, would close
this. Recorded rather than fixed in #212, which changed how the record is built but not where its
id comes from. The collision half of the same id is `create-pet-uses-a-timestamp-id.md`.

**Settles when:** the table's row for a new pet carries the id the database stored, pinned by a
controller test that creates a pet and then edits it without a reload.
