# An adoption application can be told it succeeded when no database row was written

**Status:** open · opened 2026-09-22 · reasoned from the code and the schema during review of the submission-guard change, not reproduced against a live database

`submitApplication` checks its target animal against the database and refuses one that is missing,
archived or not adoptable. When the database cannot answer, `findServerPetByIdAsync` falls back to
the `src/data/pets.json` mirror, which answers under the exact id that was posted — so the guard's
exact-id comparison cannot fire, and `isArchived` and `status` are read off the fixture.

**The missing-row half is closed.** PR #89 made `findServerPetByIdAsync` return `null` after a
successful query that found nothing, so an id absent from a populated database is now simply not
found. What remains is the `catch` path and the no-database path: `handlePersistenceError` rethrows
only under `STRICT_PERSISTENCE`, which nothing outside `vitest.config.mts` and one npm script sets,
so in every deployed environment a swallowed read failure hands back the mirror. That fallback is
deliberate and must stay — a swallowed database error must not fail the mutation
(`tasks/lessons/2026-09-04-a-dual-layer-fallback-must-never-let-a-swallowed-database-error-fail.md`).

**This is the adoption-write twin of
`tasks/open/an-outage-serves-and-bills-fixture-animals.md`**, which records the same route serving
a demo animal on the public profile and *billing* a sponsorship against it. That entry asks
whether a fixture animal may be served and billed during an outage; this one adds what the write
path does afterwards, which is the part that differs and the reason it is a separate entry rather
than a paragraph there: the profile serves something wrong and recovers, while the application is
accepted, acknowledged with a reference code, and then lost.

**What it costs is worse than applying for a demo animal.** `AdoptionApplication.petId` carries a
foreign key to `Pet.id` (`prisma/schema.prisma:174-175`). An application accepted against an id the
`Pet` table does not hold raises P2003 on insert, and `insertServerApplication` hands that to
`handlePersistenceError(…, "write")`, which rethrows only P2002. So the insert is swallowed too:
the application exists in the in-memory mirror until the next process restart, and the applicant is
returned `success: true` with a reference code for a record that reached no database and that the
tracking portal will not find after a redeploy. Nothing logs an error in production, because the
write-kind warning is the only signal and it is a console line.

This is not new to the guard — the same silent-success shape existed before, when the archive check
read the fixture — but the guard is what now makes the claim "the animal was checked against the
database", and that claim does not hold on these paths.

The honest fix is not another per-caller check; the id comparison is already there and cannot see
this.

**An earlier draft of this entry proposed making `handlePersistenceError` rethrow P2003 the way it
rethrows P2002, on the ground that a foreign-key violation is a deterministic caller error rather
than a transient outage. That is wrong, and the repo already says so.** Corrected here after a
review of the neighbouring branch pointed at the evidence:

- `src/lib/server/sponsorshipLedger.ts` defines `FK_VIOLATION = "P2003"` — "an optional relation no
  longer has a row" — and `recordSponsorshipPledge` *recovers* from it: it re-reads both referents
  after the failed insert, clears only the one that actually vanished, and retries. A global
  rethrow in the shared decision point would sit underneath a caller that has already decided this
  code is recoverable.
- `AdoptionApplication.petId` is `String?` with `onDelete: SetNull`, and `petName` beside it is
  documented as a snapshot that "survives `petId` going null" — the same shape as
  `PetSponsorship.petId`, whose comment says a record "can legitimately name an animal that has no
  row here". Rethrowing would refuse a submission the schema is explicitly built to accept, and
  turn away an applicant whose chosen animal's row disappeared mid-flight.

P2003 does not have one meaning. Where the relation is required it means "this write is wrong";
where it is optional it means "the referent vanished, drop the link". Both pet foreign keys here
are the second kind, which is why `handlePersistenceError` — shared by every repository — is the
wrong altitude to decide it.

The option that matches both the schema and the only precedent in this codebase is to mirror
`recordSponsorshipPledge` in `insertServerApplication`: on P2003, retry once with `petId: null`.
The application then persists, the reference code stays honest, and `petName`/`petBreed` carry what
the applicant applied for — which is what this entry is actually complaining about, since the
complaint is that the row is *lost*, not that it is accepted.

**Settles when:** a submission that reports success has actually been persisted — whether by
retrying with `petId: null` as the sponsorship ledger does, or by the write path distinguishing a
fixture-backed resolution from a database one and refusing before it acknowledges — pinned by a
strict-persistence test that arranges a `findUnique` miss on a real `pets.json` id, drives the
insert to P2003, and asserts on what the caller is told *and* on what was written.
