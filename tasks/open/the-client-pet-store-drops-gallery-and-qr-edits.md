# The client pet store drops gallery and QR edits

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`usePetStore` in `src/lib/client/petStore.ts` never copies `input.galleryImages` or
`input.customQrUrl` in `updatePet` (nor in `addPet`), so the local store and `localStorage` keep the
old gallery and QR after a save. The admin table's `localPets` shadows this for the rest of the
session; after a reload without `initialPets` the added photos are gone from the store.

Pre-existing; outside #107's scope.

**Settles when:** both store paths carry both fields, with a store test that a saved gallery and QR
survive.
