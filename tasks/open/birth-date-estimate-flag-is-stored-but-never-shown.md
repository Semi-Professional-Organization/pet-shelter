# The birth-date estimate flag is stored but never shown

**Status:** open · opened 2026-09-22 · found by review of the birth-date branch

`birthDateIsEstimate` is now a real, operator-settable field. The pet form offers it as
"Estimated — exact date unknown", it defaults to true, it survives validation, both write paths
carry it, and the production migration stamps `true` on every backfilled row — correctly, since a
date derived from `intakeDate − age` is an estimate by construction.

Nothing reads it. A grep across `src/` finds it only in `src/lib/validations/pet.ts`,
`src/lib/server/petMappers.ts`, `src/actions/pets.ts`, `src/lib/client/petStore.ts` and
`src/components/admin/PetFormDialog.tsx` — the schema, the mappers, the two writers and the form
itself. No card, no detail view, no table, no export consults it.

So an operator who unchecks the box to record a birthday they actually know sees no difference
anywhere on the site, and a visitor cannot tell "2 years" (measured from a vet's estimate at
intake) from "2 years" (measured from a date on a surrender form). The flag is honest in the
database and invisible everywhere it would matter.

This was a deliberate stopping point, not an oversight: displaying it touches `PetCard`,
`PetDetailDialog`, `PetDetailView`, `PetChooserCarousel`, `PetMatchQuiz`, `PetDataTable` and the
CSV export, and it needs a Malay string for every English one it adds — which runs straight into
`tasks/open/ages-render-in-english-on-malay-site.md`, where `formatAgeString` already returns
`{ en, ms }` and every caller takes `.en`. Adding a second locale-sensitive age string before that
one is resolved would double the defect rather than halve it.

The cheapest honest version is probably a prefix on the derived age — "~2 years" / "±2 tahun" —
resolved at render from the same `{ en, ms }` pair, so it lands as part of that fix rather than
beside it.

**Settles when:** the estimate flag changes what a visitor sees for at least the pet card and the
detail view, in both locales — or someone decides that an estimated age and a known one should
read identically in public, and writes that down here.
