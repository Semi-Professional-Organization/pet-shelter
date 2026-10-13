# Validating one copy of a value does not validate the one you write

**Learned:** 2026-09-22

The new guard in `submitApplication` resolved the target animal from a normalised copy of the
posted id:

    const requestedPetId = validated.petId.trim();
    const pet = await findServerPetByIdAsync(requestedPetId);
    if (!pet || pet.id !== requestedPetId) return { success: false, ... };

and then built the record from the request:

    petId: validated.petId,
    petName: validated.petName,

Two fields, two different defects, one shape. `applicationFormSchema` does not trim, so
`" pet-001 "` cleared every check via the trimmed copy and was written with its whitespace into a
column holding a foreign key to `Pet.id`; Prisma raised P2003, `handlePersistenceError(…, "write")`
swallowed it outside strict mode, and the applicant was handed `success: true` and a reference code
for a row that reached no database. And `petName` was never checked at all, while two places
downstream treat it as identifying — `atomicUpdateApplicationStatus` auto-rejects other open
applications matching on it, and `markCachedPetAdopted` marks the first pet matching *either* id or
name — so a forged name could close a popular animal's real applications and mark the wrong animal
adopted.

The guard was correct. Every test of the guard passed, including the ones written specifically to
prove it discriminated, because they all asserted on what it *refused*. Nothing asserted on what
the accepted path *stored*, and the resolved row was sitting in scope the whole time.

**Rule:** when a check resolves an entity, write the record from that entity, not from the request
it came in on — and where the request must be used, assert in a test that the persisted value
equals the resolved one. Normalising for the lookup (`trim`, `toLowerCase`, an id cast) creates two
values that a reader assumes are one; the guard then vouches for the copy nobody stores. Ask of
every field on the write path: "was *this* string the one the check passed on?" See
[[2026-09-22-a-check-that-becomes-a-query-must-be-re-placed-against-the-budgets]], the other
lesson from the same change — both are about the guard being right and its surroundings not.
