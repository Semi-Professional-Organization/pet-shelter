# An unrecognised pet status is refused, not read as Available

**Decided:** 2026-10-27

Closes #98, #99, #96 and #101, the four `tasks/open/` entries under "Adoption and pet status
guards" (#184).

## The status mapper (#98)

`fromDbPetStatus` returned `Available` for every value it did not match exactly, so a text column
holding `adopted` made an animal who had gone home adoptable again. Of the three repairs the entry
listed, none was taken whole:

- **Drift is read as what it spells.** Matching is case-, space- and underscore-insensitive, so
  `adopted`, `ADOPTED` and `IN_REHABILITATION` resolve to their status. This is the likely shape of
  real drift in a text column, and reading it correctly beats refusing it.
- **Anything else passes through unchanged**, the way `normalizePetStatus` already treats unknown
  input. `isKnownPetStatus` is false for it, `getPetStatusPresentation` falls back to the
  non-adoptable `pending` presentation, and `submitApplication` refuses it with its own message.
- **Not a fifth `Unknown` status:** it would touch every surface that switches on status, for a
  value nobody has observed in production. **Not a throw on read:** one bad row would fail a whole
  catalogue render. **Not mapped to `Pending`:** that writes a guess into the domain value.

The cost: `Pet["status"]` can now hold a string outside its union, behind one cast in the mapper.
Display surfaces show such an animal with the Pending tone, labelled with its raw value so the
admin status control does not show it as a second "Pending". Lookups on the free-text value are
own-key checks (`isKnownPetStatus`), so `constructor` or `__proto__` cannot pass for a status. Two consequences were closed with it:
`toDbPetStatus` refuses an unknown status instead of writing it back as `Available` (the
repository checks it before the persistence `try`, which would otherwise swallow the
refusal), and an unknown status may move to any canonical one, so staff can correct the row. The status filter matches by
tone, so an unrecognised status is found under the Pending bucket that counts it.

Whether a drifted value can reach the mapper through Prisma's typed reads is open: the schema
declares the enum, and Prisma may fail the whole query instead.
`tasks/open/a-drifted-pet-status-fails-the-whole-prisma-read.md`.

## The adoption audit row (#101)

`PET_STATUS_TRANSITION_ADOPTED` is written when the approval's `tx.pet.updateMany` reported a row,
and names that row. With a database the mirror is marked by that id only, never by the name
fallback. Without a database the mirror is the store, so what it marks is still the transition.
Backfilling `petId` for legacy applications was not done: it needs the production database.

## The adoption form (#96, #99)

- The pet `<select>` offers adoptable animals only, with an empty first option, so the field and the
  control agree when the form opens on nobody.
- A non-adoptable `selectedPet` still names the dialog title, as `resolveDefaultPet`'s tests
  require, but the field starts empty and the wizard says the animal is not accepting applications.
- Every opening sets the pet field from the animal the title names, including nobody. Only the pet
  fields are touched, so other answers survive a reopen, and a refresh of the animal list while
  the form is open does not overwrite the applicant's pick.
- On success the local list and the confirmation use the animal the server recorded.
