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

## 2026-11-11: the server half (round-3 review of #210/#211)

The server action's merge has the same class of defect. `petFormSchema` defaults `galleryImages`
to `[]`, `customQrUrl` to `""`, `featured` to `false`, the medical and compatibility booleans to
`true`, and `isArchived` to `false`. So in `updatePet` (`src/actions/pets.ts`) `{ ...existing,
...validated }`, `validated.galleryImages || existing.galleryImages` and `validated.isArchived ??
existing.isArchived` never fall back to the stored copy: an edit payload that omits them wipes a
newer gallery and QR (probed: the test form wrote `galleryImages: []` and `customQrUrl: null`),
and one that omits `isArchived` un-archives the animal while leaving `deletedAt` set. The admin
dialog submits all of them today, so this bites a caller that sends a partial form. It belongs to
the same shared merge function as the client half, and was declined from #210/#211, which fixed
only where the stored copy comes from.
