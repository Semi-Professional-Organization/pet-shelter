# A pet edit never invents a default: an absent key keeps the stored value

**Decided:** 2026-11-12

An admin pet edit is merged by one pure function, `mergePetEdit(existing, input)` in
`src/lib/domain/petEdit.ts`, which both the browser store (`usePetStore.updatePet`) and the
`updatePet` Server Action call. A new record is built by its sibling `buildNewPet(id, input)`, which
`usePetStore.addPet` and `createPet` share. Before this (#212) each side held its own copy. The
store never copied the gallery or the donation QR, and the server parsed with `petFormSchema`,
whose defaults meant an omitted `galleryImages`, `customQrUrl`, `featured`, `isArchived`, medical or
compatibility flag, or `energyLevel` was written as a reset over the stored value.

The rule: **a key that is absent (or present and `undefined`) keeps what is stored; a submitted
value replaces it, an empty one included** (`[]` clears the gallery, `""` clears the QR to `null`,
and a submitted history list replaces the stored one). Defaults belong to `buildNewPet` alone.
Two groups are deliberately authoritative instead, as both copies already treated them: the
rehabilitation fields and `specialNeeds` clear when absent.

On the server this only holds because the update path parses with `petEditSchema`: the same fields
and the same `superRefine`, with no defaults. `petBaseFormSchema` is derived from it by `.extend`,
adding only the defaults, so a validator is written once. `petFormSchema` keeps its defaults
for `createPet` and the admin dialog's resolver.

Someone could reasonably reverse part of this. The likely candidates are making
`specialNeeds` keep-on-absent like the other medical fields, or having the edit path require every
key, which would make a partial payload an error rather than a merge. The reason for the current
choice is that the admin dialog sends every key anyway, so keep-on-absent costs it nothing, and a
partial caller then loses nothing by accident. The full list of the places the two copies
disagreed, and which side won, is in #212's pull request body.

Tests: `tests/unit/petEdit.test.ts` (the rule, the builder, the schema),
`tests/components/petStoreKeepsGalleryAndQr.test.ts` (the store across a reload), and
`tests/integration/adminPetEditsReadTheDatabase.test.ts` (an action payload that omits the keys).
