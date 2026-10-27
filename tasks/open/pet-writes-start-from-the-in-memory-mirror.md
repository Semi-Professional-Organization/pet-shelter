# Pet edits and status changes write back scalar columns from the in-memory mirror

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`updatePetStatus` builds `{ ...existing, status }` and `updatePet` builds `{ ...existing, ...validated }`,
where `existing` comes from `findServerPetById`, the per-instance in-memory mirror. Then
`buildPetPersistencePayload` writes every scalar column back. On a cold instance in database mode
the mirror for a seeded id is the `src/data/pets.json` fixture, and on any instance it can be older
than another instance's writes. So a status change can overwrite a newer `description`,
`galleryImages`, `rehabStage*` or `customQrUrl` with the mirror's copy.

PR #196 stopped this for the two history collections only, by not writing them unless submitted.
The scalar case is pre-existing and was left out of that PR's scope.

**Settles when:** both actions read their baseline from the database (`findServerPetByIdAsync`, as
`getStoredGalleryImages` already does for the gallery), or `updatePetStatus` writes only `status`,
with a test where the mirror and the database disagree.
