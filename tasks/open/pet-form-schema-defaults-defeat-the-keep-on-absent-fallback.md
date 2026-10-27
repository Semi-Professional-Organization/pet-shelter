# Two pet form defaults turn an omitted key into a clear

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`petFormSchema` gives `galleryImages` `.optional().default([])` and `isArchived`
`.optional().default(false)` (`src/lib/validations/pet.ts`). Measured on zod 4.4.3, `parse({})`
yields both keys. So in `updatePet` the fallbacks `validated.galleryImages || existing.galleryImages`
and `validated.isArchived ?? existing.isArchived` never fire: a caller that omits `galleryImages`
wipes the gallery, and one that omits `isArchived` un-archives a soft-deleted animal while its
`deletedAt` stays set.

The admin dialog always sends both, so no screen hits this today. It is the same shape as #107 and
was left out of that fix's scope.

**Settles when:** both keys lose their schema default (the create path states its own default, as
it already does for `birthDateIsEstimate`), with a test that omitting either keeps the stored value.
