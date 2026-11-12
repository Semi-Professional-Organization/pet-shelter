# A pet edit accepts `isArchived` and `deletedAt` independently

**Status:** ASSERTED · opened 2026-11-12 · found by review round 1 of #212, reasoned from the code

`mergePetEdit` and `buildNewPet` (`src/lib/domain/petEdit.ts`) resolve `isArchived` and `deletedAt`
separately: each absent key keeps its stored value, and each submitted one replaces it. A payload
that carries only one of them can therefore produce an archived animal with no timestamp, or an
active one with a timestamp. `updatePet` and `createPet` are Server Actions, so their argument is
untrusted input, and `petFormSchema` / `petEditSchema` do not tie the two keys together. The admin
dialog always sends both, as the row holds them, so no screen produces the mismatch today. The
archive action (`toggleArchivePet`) sets both together and is not affected.

The schema also accepts any string as `deletedAt` (`z.string().nullable().optional()`), so an
invalid date reaches `buildPetPersistencePayload`, which hands `new Date("not a date")` (an
Invalid Date) to Prisma. That neighbours
`tasks/open/a-pet-edit-round-trips-deletedat-through-date-tostring.md`, which is about the format
a valid timestamp takes on the way back.

Declined from #212, which was about absent keys and not about the archive pair's consistency.

**Settles when:** an edit cannot set one of the pair without the other (a schema refinement, or
`deletedAt` derived from `isArchived` on a full edit), and `deletedAt` is validated as a timestamp,
with tests for both mismatched payloads and an invalid date.
