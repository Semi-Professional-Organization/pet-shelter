# An approval marks the id it asks for, and the mirror's order stops deciding

**Decided:** 2026-09-22

Closes `tasks/open/a-public-post-can-reorder-the-pet-mirror.md`, filed by the session that landed
the adoption submission guards after it reviewed PR #89.

**This entry also corrects `2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`**, which is
not rewritten — the ledger contract forbids that — but was wrong on one point. See the last
section.

## What was wrong

`markCachedPetAdopted` took the first entry matching *either* identifier:

    serverPets.find((p) => p.id === petId || p.name.toLowerCase() === petName.toLowerCase())

`find` walks the array in order, so a **name** match on an earlier entry beat the exact **id**
match on a later one. Two shelter animals sharing a name was the whole precondition, and
`pets.json` ships common ones.

The order is publicly influenceable. `findServerPetByIdAsync` moves every animal it reads to the
head of the mirror, and that read sits behind an anonymous profile GET — and, since the adoption
submission guards landed, an unauthenticated POST, which reaches the read *before* the guard that
would reject the submission. So a visitor picks which of two same-named animals sits first.

`atomicUpdateApplicationStatus` then calls this on approval and writes the returned id into a
`PET_STATUS_TRANSITION_ADOPTED` audit row. The consequence is therefore not a stale cache entry
that the next hydrate repairs: **the wrong animal is recorded as adopted, permanently, in the
audit trail.**

Reproduced before fixing, not reasoned about: with two `Bella`s in the mirror and the decoy read
once through the public path, `markCachedPetAdopted("itest-bella-asked-for", "Bella")` returned
`itest-bella-decoy`.

## The fix

An id that was given decides the answer alone. The name is consulted only when there is no id.

    const requestedId = petId.trim();
    const target = requestedId
      ? findServerPetById(requestedId)
      : serverPets.find((p) => p.name.toLowerCase() === petName.toLowerCase());

**Reordering the two lookups was not enough, and the first draft of this change stopped there.**
Review caught it. `applicationFormSchema` validates `petId` as `z.string().min(1)` and nothing
more, and `submitApplication` accepts an id matching no animal — `if (pet && pet.isArchived)`
lets a `null` pet through. So an attacker who cannot beat a *real* id simply supplies a fake one:
float the decoy to the head of the mirror, submit `petId: "no-such-pet"`, `petName: "Bella"`, and
an id-first lookup misses and hands the decision straight back to the name. The approval then
runs `tx.pet.updateMany({ where: { id: "no-such-pet" } })` against **0 rows** while the mirror
marks the decoy adopted and the audit log records it. Same wrong permanent record, same
unauthenticated chooser, for an adoption the database never performed.

Gating the fallback on "no id supplied" closes that, and matches what the fallback was always
justified by.

**`findServerPetById` rather than an exact `===`.** Every other id read in this file normalises
with `trim().toLowerCase()`, and nothing on the submit path trims `petId`. An exact comparison
would miss `" pet-001 "` — which passes the submit-time archive check, because *that* lookup does
normalise — and drop it into the name fallback, reopening the hole above with no forgery at all.
Reusing the lookup that already exists is also the cheaper rung of `AGENTS.md`'s ladder.

**The name fallback stays** for applications predating the `petId` column, which arrive with an
empty string; `atomicUpdateApplicationStatus` passes `currentApp.petId ?? ""` precisely for them.

Pinned by `tests/integration/approvalMarksTheAnimalItAsksFor.test.ts`, six tests, including the
public reorder performed the way a visitor would and an arrangement assertion proving the reorder
actually happened, so the test cannot pass because the attack silently failed to set up.

## Considered and not done: stopping the read from reordering

The open entry offered either repair. Reordering was left alone because it is load-bearing in a
way the id fix is not: during an outage `getServerPetsAsync` serves this array as the catalogue,
so recency-first is the behaviour that lets a recently viewed animal survive a database failure.
Removing it is a product decision about outage ordering, and it would not have fixed the defect
anyway — two same-named animals with no id match are still resolved by position.

**What therefore remains open:** with **no** `petId` at all *and* two animals sharing a name,
order still decides which is marked. That is inherent — nothing distinguishes them.

An earlier draft of this entry said the residual was "no longer attacker-directed at a specific
victim, because an attacker cannot make the wrong animal win when the right id is present." That
was wrong, and it is corrected here rather than quietly deleted because it shipped to review in
that form: nothing requires an attacker to present a right id. That hole is what the `!petId`
gate closes, and the sentence was true only of the weaker fix it was written against. What is
left needs an application carrying no id at all, which no current submit path produces —
`applicationFormSchema` requires a non-empty `petId` — so it is reachable only by the legacy rows
already in the table, not by anything a visitor can send today.

## Correcting the earlier entry

`2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`, under "Not closed by this", says of the
mirror rewrite: *"Carried over from the closed entry's second bullet, unchanged and still cosmetic:
an anonymous GET mutating module state is worth knowing about."*

**"Cosmetic" was wrong.** It was written from the reordering's effect on catalogue *display* order
during an outage, without checking what else read that order — and one thing did, in a path that
writes an audit row. The claim reached a public GitHub issue and the `petRepository.ts` docstring
before anyone checked it, and the session that found it was reviewing a different change.

The error is the same one this stream already has a lesson about — prose asserting a property of
code the writer had not read. What is new, and why the lesson gained a paragraph rather than a
second file: the assertion was not about a *named* function, so "open the symbol you name" would
not have caught it. It was a claim about which code paths read a piece of shared state, and the
check that answers it is a grep for the state, not a read of a symbol.
