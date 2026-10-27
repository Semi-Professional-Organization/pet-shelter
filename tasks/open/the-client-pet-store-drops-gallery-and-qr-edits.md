# The client pet store drops gallery and QR edits

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`usePetStore` in `src/lib/client/petStore.ts` never copies `input.galleryImages` or
`input.customQrUrl` in `updatePet` (nor in `addPet`), so the local store and `localStorage` keep the
old gallery and QR after a save. The admin table's `localPets` shadows this for the rest of the
session; after a reload without `initialPets` the added photos are gone from the store.

The root is duplication: the store's `updatePet` and the server action's `updatePet` each hold their
own copy of the edit-merge rules, and the copies have diverged (gallery and QR here, `featured`,
the rehabilitation fields). #196 had to change the history rule in both by hand.

Pre-existing; outside #107's scope.

**Settles when:** both paths merge an edit through one shared pure function (for example
`mergePetEdit(existing, input)` in `src/lib/domain`), with a store test that a saved gallery and QR
survive.
