# Pet form schema defaults turn an omitted key into a reset

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`petFormSchema` gives `galleryImages` `.optional().default([])` and `isArchived`
`.optional().default(false)` (`src/lib/validations/pet.ts`). Measured on zod 4.4.3, `parse({})`
yields both keys. So in `updatePet` the fallbacks `validated.galleryImages || existing.galleryImages`
and `validated.isArchived ?? existing.isArchived` never fire: a caller that omits `galleryImages`
wipes the gallery, and one that omits `isArchived` un-archives a soft-deleted animal while its
`deletedAt` stays set.

`featured` (`.default(false)`) and the medical and compatibility flags have the same shape with no
fallback at all, so the `...validated` spread writes the default over a stored value: omitting
`featured` drops a featured animal from the homepage.

So `updatePet` now applies three absent-key rules in one object: rehabilitation fields clear,
history is kept, and these fields reset to a default. The general fix is one update schema without
defaults and one merge rule, with explicit clears where wanted, rather than a fallback per field.

The admin dialog always sends all of these, so no screen hits this today. It is the same shape as #107 and
was left out of that fix's scope.

**Settles when:** the update path parses with a schema that has no defaults (the create path states
its own, as it already does for `birthDateIsEstimate`), with a test that omitting `galleryImages`,
`isArchived` or `featured` keeps the stored value.
