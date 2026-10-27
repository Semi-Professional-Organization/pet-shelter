# Admin pet edits and archives report success during an outage

**Status:** ASSERTED · opened 2026-10-27 · found while settling
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code

That decision took `src/data/pets.json` off the public write and payment paths. The staff side
has the same shape and was left alone, because the pet form is being reworked in another pull
request (`saving-the-pet-form-wipes-its-medical-timeline-and-updates.md`) and two branches
rewriting `updateServerPet` would conflict.

`updatePet` and `updatePetStatus` in `src/actions/pets.ts` read the existing animal with
`findServerPetById`, the mirror, and `updateServerPet` and `archiveServerPet` (behind
`toggleArchivePet`) in `src/lib/server/petRepository.ts` look in the mirror first as well. Both
then pass a failed `prisma.pet.update` to `handlePersistenceError(…, "write")`, which swallows it
outside strict mode, and update the mirror and the audit log anyway. So during an outage a staff edit or archive is reported as
saved, written to an audit row, and lost at the next restart. Archiving is the shelter's "take
this down" action, so a lost archive leaves the animal up while staff believe it is down.

**Settles when:** the admin pet edit and archive actions refuse during an outage instead of
reporting success, pinned by a test that fails the database update in non-strict mode with
`DATABASE_URL` set and asserts the action's result, the mirror and the audit log.
