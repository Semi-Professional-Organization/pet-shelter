# The pet edit module states its field list and its defaults more than once

**Status:** open · opened 2026-11-12 · found by `/code-review xhigh` round 3 on #212

Cleanup the review raised on `src/lib/domain/petEdit.ts` and declined as outside #212, which was
to make the two diverged merge copies one. None of it produces a wrong value today.

- **No exhaustiveness check.** `submittedFields`, `mergePetEdit` and `buildNewPet` pick every form
  key by hand. A field later added to `petEditBaseSchema` is validated and then dropped on every
  path with no compile error; the old `{ ...existing, ...validated }` spread carried a new scalar
  by itself. A typed rest or a `satisfies` check over `keyof PetFormInput` would make the omission
  a type error.
- **New-record defaults in four places**: `petBaseFormSchema.extend`, `buildNewPet`, and
  `PetFormDialog`'s `defaultValues` and create `reset()`. The builder's copies run only for an
  unparsed caller, which in production is nobody. One exported defaults record in the domain file
  could feed the schema and the builder, and `buildNewPet(id, input)` could then be
  `mergePetEdit({ id, ...defaults }, input)`, leaving one resolution list.
- **`adoptionFee || "Free"`** sits in the fields shared with edits, so an unparsed edit with an
  empty fee invents a default, against the module's rule. Dead in production (both schemas require
  a fee); kept because the store always did it.
- **History ordering lives in the edit module.** `petMappers.ts` imports `byDateAscending` from
  it, `sortHistoryByDate` is exported with no outside importer, and `medicalTimeline.ts` sorts the
  same collections with a third comparator.
- **Test fixtures**: the new tests re-type a `Pet` where `makePet` exists, add another copy of the
  minimal pet form, and clear `localStorage` that the harness already clears.
- `customQrUrl: editFields.customQrUrl.default("")` in `validations/pet.ts` rebuilds
  `optionalQrImageUrl`.

**Settles when:** a form key missing from the merge fails to compile, and a new record's defaults
are stated once.
