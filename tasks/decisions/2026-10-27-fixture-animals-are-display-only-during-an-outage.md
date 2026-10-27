# Fixture animals are display-only during an outage

**Decided:** 2026-10-27, by the owner ("pets.json must not be used on write or payment paths;
display only at most"), implemented in the pull request that adds this file.

When a database is configured and a pet read fails outside strict mode,
`findServerPetByIdAsync` answers from the in-memory mirror, which is seeded from
`src/data/pets.json`. Four open entries asked what that may be used for. The answer:

- **A page may show it.** `/pets/pet-001` still renders the demo animal for the length of an
  outage. A page is stale for a minute and recovers; nothing is recorded against it.
- **Nothing may be written or billed against it.** `submitApplication` and
  `createPetSponsorshipAction` read with `findPetForWriteAsync`, which throws
  `PetStoreUnavailableError` instead of answering from the mirror. The applicant or supporter is
  told nothing was recorded and to try again.
- **An application insert that a configured database refused fails the submission.**
  `insertServerApplication` throws `ApplicationWriteError` instead of mirroring the record, so no
  reference code is handed out for a row that no database holds. The applicant is told the save
  could not be confirmed, not that nothing was saved: a connection lost after the commit lands
  here too, and a retry may then leave two rows for staff to merge. A foreign-key miss (P2003) is
  refused too, not retried with `petId: null`: the animal was read from the database a moment
  earlier, so it needs a hard delete inside that window, and a clear refusal beats an application
  quietly detached from its animal.
- **Checkout refuses an archived animal** with its own message, and a missing one with "could not
  find that animal", instead of the "could not confirm that a pledge was recorded" copy, which is
  about a write that may have happened.
- **Two list readers keep their answers.** An empty `adoptionApplication` table returns `[]`; a
  missing settings row returns the shipped defaults, because the row is created by the first
  admin save. Both written down at the reader.

This narrows `tasks/lessons/2026-09-04-a-dual-layer-fallback-must-never-let-a-swallowed-database-error-fail.md`
for one write. That lesson is about the fallback mode, where no database is configured and a
Prisma call is expected to throw; the application insert only runs when a database *is*
configured, and there a swallowed failure is a lost application. Do not "restore" the swallow
on the strength of the lesson.

With **no database configured** the mirror is the whole store and the ledgers are in memory too,
so these paths still answer from it. That mode is for development and tests.

Pinned by `tests/integration/outageRefusesWritesOnFixtureAnimals.test.ts` and
`tests/integration/emptyReadersAreAnswers.test.ts`. Settles #90, #97, #91 and #65, whose entries
are deleted with this one: `an-outage-serves-and-bills-fixture-animals.md`,
`an-application-can-succeed-against-no-database-row.md`,
`sponsorship-checkout-accepts-an-archived-animal.md` and `pets-json-fallback-empty-means-outage.md`.

Not covered: the admin pet edit and archive actions, which still read the mirror and swallow a
failed write — `tasks/open/admin-pet-writes-succeed-against-the-mirror-during-an-outage.md`.
