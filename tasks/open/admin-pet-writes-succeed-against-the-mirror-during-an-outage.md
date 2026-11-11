# Admin pet edits and archives report success during an outage

**Status:** ASSERTED · opened 2026-10-27 · found while settling
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code

That decision took `src/data/pets.json` off the public write and payment paths. The staff side
has the same shape and was left alone, because the pet form is being reworked in another pull
request (`saving-the-pet-form-wipes-its-medical-timeline-and-updates.md`) and two branches
rewriting `updateServerPet` would conflict.

Since #210/#211, `updatePet` and `updatePetStatus` in `src/actions/pets.ts` read the existing
animal from the database and refuse when it cannot be read (`readPetForEdit`), so only the write
side remains for them. `archiveServerPet` (behind `toggleArchivePet`) in
`src/lib/server/petRepository.ts` still looks in the mirror first. On the write side,
`updateServerPet` sends a status change through `prisma.pet.updateMany` (a `count: 0` miss is
reported as nothing written) and a full edit through a `$transaction` around `prisma.pet.update`
(a P2025 miss is reported as nothing written), and `archiveServerPet` through `prisma.pet.update`.
Any other failure on any of the three, an outage included, goes to
`handlePersistenceError(…, "write")`, which swallows it outside strict mode, and the mirror and
the audit log are updated anyway. So during an outage a staff edit or archive is reported as
saved, written to an audit row, and lost at the next restart. Archiving is the shelter's "take
this down" action, so a lost archive leaves the animal up while staff believe it is down.

**Settles when:** the admin pet edit and archive actions refuse during an outage instead of
reporting success, pinned by a test that fails the database update in non-strict mode with
`DATABASE_URL` set and asserts the action's result, the mirror and the audit log.
