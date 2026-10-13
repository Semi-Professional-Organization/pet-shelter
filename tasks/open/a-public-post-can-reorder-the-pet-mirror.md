# A public POST can reorder the pet mirror, and one cache write reads that order

**Status:** open · opened 2026-09-22 · reasoned from the code during review, not reproduced

`findServerPetByIdAsync` rewrites the module-level mirror on every successful database read:

    serverPets = [pet, ...serverPets.filter((p) => p.id.toLowerCase() !== norm)];

That an anonymous GET of a profile therefore mutates shared state was already recorded, and called
cosmetic, in `pet-profile-falls-back-to-a-fixture-the-database-lacks.md` — settled and deleted by
PR #89, whose reasoning is in
`tasks/decisions/2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`. Two things make it less
cosmetic than that note assumed.

**It is now reachable by POST.** `submitApplication` resolves its target through that reader, so an
unauthenticated submission moves an animal to the head of the mirror — including a submission the
guard then *rejects*, because the reordering happens inside the read, before any check. The budget
is the submission rate limit (20 per 10 minutes per address, and the address budget only binds
where a trusted proxy header is configured at all), so the order is cheap to drive.

**One cache write depends on that order.** `markCachedPetAdopted` takes the first entry matching
**either** identifier:

    serverPets.find((p) => p.id === petId || p.name.toLowerCase() === petName.toLowerCase())

`atomicUpdateApplicationStatus` calls it when staff approve an application. Two shelter animals
sharing a name — not exotic; `pets.json` alone ships common ones — and whichever sits earlier in the
array wins, even when the *other* one is the exact id match. The attacker chooses which by
submitting an application for it first.

**And the damage outlives the cache.** An earlier draft of this entry said "until the next
hydrate", which understates it: `atomicUpdateApplicationStatus` writes the returned pet's id into a
`PET_STATUS_TRANSITION_ADOPTED` audit row (`entityId: adoptedPet.id`). A rehydrate corrects the
mirror; it does not correct the audit log, which is the permanent record of who was adopted and
when. Corrected here after the session fixing `markCachedPetAdopted` pointed it out.

The forged-name half of this is already closed: `submitApplication` now stores `pet.name` from the
verified row rather than the posted string, so the name reaching `markCachedPetAdopted` is always
the real animal's. What remains is two real animals with the same real name, plus attacker-chosen
ordering.

Not fixed here for a reason worth stating: the repair belongs in `src/lib/server/petRepository.ts`
— prefer an exact id match before falling back to a name match, and/or do not rewrite the mirror
from a read — and a parallel session was editing that exact file for the fixture-fallback work
while this was found. Two branches rewriting one repository is how a clean per-path merge produces
a broken result.

**Settles when:** `markCachedPetAdopted` cannot return an animal whose id was not asked for while
an exact id match exists in the array — or the read stops reordering shared state — pinned by a
unit test holding two animals with the same name and asserting which one is marked.
