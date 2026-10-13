# An adoption audit row can name a pet the transaction never updated

**Status:** ASSERTED · opened 2026-09-22 · found reviewing
`decisions/2026-09-22-an-approval-marks-the-id-it-asks-for.md`, which does not close it

`atomicUpdateApplicationStatus` writes the pet transition audit row from the **mirror**, while the
database update is keyed on the application's `petId` and skipped entirely when that is empty:

    if (targetStatus === "APPROVED" && current.petId) {      // applicationRepository.ts:376
      await tx.pet.updateMany({ where: { id: current.petId }, data: { status: "Adopted" } });
    }
    ...
    const adoptedPet = markCachedPetAdopted(current.petId ?? "", current.petName);
    if (adoptedPet) {
      recordAuditLog({ action: "PET_STATUS_TRANSITION_ADOPTED", entityId: adoptedPet.id, ... });
    }

For a legacy application carrying no `petId` — the case the name fallback in
`markCachedPetAdopted` exists to serve — the transaction does not touch `pets` at all, yet the
mirror marks an animal adopted and an audit row is written naming it. The audit log then records
a pet status transition that Postgres never performed, and a rehydrate silently reverts the mirror
while the audit row stays.

That is the inversion of the invariant stated at the top of `petRepository.ts`: *"database first,
mirror second… a cache entry can therefore never describe a state the database refused."* Here
the cache describes a state the database was never asked about.

The larger version of this — an attacker-supplied `petId` matching no row, so `updateMany` hits 0
rows while the name fallback picks a victim — was closed on 2026-09-22 by requiring an id that
was supplied to resolve on its own. What remains of *that* direction is narrower and not
attacker-reachable: `applicationFormSchema` requires a non-empty `petId`, so only rows already in
the table can carry an empty one.

## The same change opened the opposite direction, and that is the worse half

Requiring a supplied id to resolve in the mirror means that when it *does not*,
`markCachedPetAdopted` returns `null` and **no audit row is written at all**.

The mirror is per-process and starts from `pets.json`. A serverless instance handling an approval
with a cold mirror, for an animal created after seeding — a `cuid()` id, a name no fixture
carries — misses on the id, has no name to fall back to, and returns `null`. The transaction has
already flipped `pets.status` to `Adopted`. So the database records the adoption, the audit log
records nothing, and the mirror keeps the animal at its previous status — which an outage read
(`getServerPetsAsync`'s `catch`, or `findServerPetByIdAsync`'s) then serves as still adoptable.

Before the narrowing this case produced a row with the *wrong* id. It now produces silence. Which
is worse is arguable — a wrong audit row is a false statement and a missing one is an omission —
but both are the same underlying defect: **the audit row is derived from the cache instead of from
the write.** The audit trail is currently conditional on cache warmth in one direction and on
cache contents in the other.

This is why the fix below is keyed off the transaction rather than the mirror: `updateMany`
returns a count, so "the database adopted this pet" is knowable without consulting the cache at
all, and it closes both directions at once.

**Not fixed with that change on purpose.** The repair is in the caller, not the repository, and it
is a real product question rather than a mechanical one: either key the audit row off the row the
transaction actually updated (`updateMany` returns a count, so "0 rows" is detectable), or decline
to write a transition audit row when no database transition happened, or backfill `petId` for the
legacy rows and delete the fallback entirely. The third closes this and the residual in the
decision entry together, and is the only one that removes the ambiguity rather than documenting
it.

**Settles when:** a `PET_STATUS_TRANSITION_ADOPTED` row is written exactly when the transaction
updated a `pets` row, and names that row — neither written for an approval that updated zero rows,
nor omitted for one that updated a row the mirror did not happen to hold. Pinned by two tests:
one approving a legacy application with an empty `petId`, and one approving with a cold mirror
that does not contain the animal, each asserting on what was audited rather than on what the
mirror holds.
