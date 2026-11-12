# The admin pet table merges an edit a third time, by spreading the form

**Status:** open · opened 2026-11-12 · found while settling #212

`handleFormSubmit` in `src/hooks/usePetTableController.ts` builds its optimistic `localPets` row with
`withDerivedAge({ ...p, ...data })`. That is a third copy of the edit merge, beside the shared
`mergePetEdit` (`src/lib/domain/petEdit.ts`) that the store and the Server Action now both use. It
passes the gallery and QR through, because the dialog always sends both. But it:

- spreads the form's flat `vaccinated`, `goodWithDogs`, `energyLevel`, `specialNeeds`, ... keys
  onto the top level of the row and never updates the nested `medical` / `compatibility`. So for
  the rest of the session the table, and the CSV export that reads it, show the old medical and
  compatibility values;
- keeps `customQrUrl: ""` where every other path stores `null`.

There is also a quieter mismatch. The table shows `initialPets` from the server, but the store's
`updatePet` and rollback `replacePet` act on the store's own list (localStorage, or the fixture), so
for an animal that exists only in the database the store write returns `null` and nothing is said.

Left out of #212 to keep that change to the two copies it named.

**Settles when:** the optimistic row is built with `mergePetEdit(p, data)` (or taken from the
store's return value), with a controller test showing that an edit to a medical flag reaches the
table row's `medical`.
