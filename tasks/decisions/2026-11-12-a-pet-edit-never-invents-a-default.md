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
and a submitted history list replaces the stored one). The edit states no defaults. A new record's
defaults are stated twice, with the same values: by `petFormSchema`, which `createPet` and the
admin dialog's resolver parse with, and by `buildNewPet`, whose fallbacks only run for a caller
that did not parse, such as the browser store.
Two groups are deliberately authoritative instead, as both copies already treated them: the
rehabilitation fields and `specialNeeds` clear when absent.

On the server this only holds because the update path parses with `petEditSchema`: the same fields
and the same `superRefine`, with no defaults. `petBaseFormSchema` is derived from it by `.extend`,
adding only the defaults, so a validator is written once. `petFormSchema` keeps its defaults
for `createPet` and the admin dialog's resolver.

Someone could reasonably reverse part of this.

- **`specialNeeds` could keep on absent, like the other medical fields.** Review round 1 argued
  for it: a submitted `""` already clears the note, so clearing on absent buys nothing, and a
  partial payload silently loses the note. It was kept as it is because both copies already
  behaved this way, and #212 changed only where the copies disagreed. That argument is the
  reason to reverse it.
- **The rehabilitation fields could keep on absent while the animal stays under care.** Review
  round 2 argued for it: the reason to clear them is a stale progress bar on an animal that has
  left rehabilitation, which does not apply when the edited status is still a rehabilitation one,
  and a partial payload there loses the stage and percentage. Kept for the same reason as
  `specialNeeds`: both copies already agreed.
- **The edit path could require every key**, which would make a partial payload an error rather
  than a merge.

Keep-on-absent was chosen because the admin dialog sends every key anyway, so it costs the dialog
nothing, and a partial caller then loses nothing by accident. That holds only while the dialog
does send every key. It resolves edits with `petFormSchema`, so a defaulted key dropped from its
`reset()` would arrive filled with the default, as if it had been submitted. The full list of the places the two copies
disagreed, and which side won, is in #212's pull request body.

Tests: `tests/unit/petEdit.test.ts` (the rule, the builder, the schema),
`tests/components/petStoreKeepsGalleryAndQr.test.ts` (the store across a reload),
`tests/components/petTableControllerMergesEdits.test.ts` (the admin table's optimistic row), and
`tests/integration/adminPetEditsReadTheDatabase.test.ts` (an action payload that omits the keys).
