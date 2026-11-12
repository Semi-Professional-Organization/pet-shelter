# The browser pet store skips an edit to a pet it does not hold

**Status:** open · opened 2026-11-12 · found while settling #212

The admin pet table (`src/hooks/usePetTableController.ts`) shows `initialPets` from the server, but
it also writes each edit to `usePetStore` (`src/lib/client/petStore.ts`). The store acts on its own
list, which comes from `localStorage` or the `src/data/pets.json` fixture. So for an animal that
exists only in the database, the store's `updatePet` finds no row and returns `null`, and nothing
reports it. The rollback's `replacePet(prevPet)` does nothing for the same reason. The table's
optimistic row is unaffected: since #212 it is built with the shared `mergePetEdit`.

A related hazard in the same store: `mergePetEdit` reads `existing.medical` and
`existing.compatibility` without a guard, so it throws on a stored pet that lacks either object.
Only an unvalidated `localStorage` entry could hold such a pet. The store parses the saved JSON
without validating it, and none is known to exist.

A third: the public profile prefers the store's copy over the server's
(`usePetDetailViewController`, `pets.find(...) || initialPet`), and nothing refreshes the store
from the server. Since #212 the store's copy carries the gallery and donation QR an admin saved in
that browser, so on that one browser a QR later replaced or cleared from another device keeps being
offered. Before #212 the store's copy carried the QR it was seeded with, which was stale the other
way.

**Settles when:** the store's edits apply to the pets the table shows, or the table stops writing to
the store, and a `localStorage` entry is validated (or the merge tolerates a missing nested object)
before it reaches `mergePetEdit`; and the public profile reads the gallery and QR from the server's
copy.
