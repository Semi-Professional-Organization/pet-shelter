# Nobody can enter a real birth date

**Status:** open · opened 2026-08-30 · from PS-114

`PetFormDialog` has no `birthDate` input, and `petBaseFormSchema` makes `age` (free text) and
`ageCategory` **required** while `birthDate` is optional. On save,
`buildPetPersistencePayload` back-derives a birth date as `intakeDate − age` and drops
`age`/`ageCategory` entirely — there are no such columns.

So an operator's typed "2 years" becomes a birthday relative to intake, and the site's displayed
age then walks away from what they typed, by one year per year.

**Belief, not observed:** that this is what a shelter worker would call wrong. It is the open item
most likely to match the original complaint.

**Settles when:** a `birthDate` field is added to the form (with the age text kept as a
display-only estimate), or a maintainer confirms intake-relative ageing is intended.

See `tasks/decisions/2026-08-30-pet-age-computation-authoritative.md` for what *was* fixed.
