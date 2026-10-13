# A check that becomes a query must be re-placed against the budgets that bound it

**Learned:** 2026-09-22

`submitApplication` validated its target animal above its rate limits:

    const pet = findServerPetById(validated.petId);   // in-memory array scan
    if (pet && pet.isArchived) { ... }

    // 1. Rate limiting — two independent budgets ...

That ordering was free and therefore invisible. `findServerPetById` scans a module-level array,
so running it before the budgets cost an unauthenticated caller nothing the process was not
already paying.

The fix for this file was to read the database instead — the mirror was seeded from
`src/data/pets.json`, so the archive flag being tested was the fixture's. Swapping the reader in
place, which is what the task described, would have left a Postgres `findUnique` on the
unauthenticated path *above* every budget: one round trip per POST, from anyone, with nothing
bounding it. The brief was right about the read and silent about the placement, and the placement
was only correct because of the property the change removed.

Nothing failed. Both readers return a pet, the types match, and every test passes either way — the
existing suite could not see the difference, and neither could a review reading the diff, because
the diff is one identifier and the ordering is unchanged lines.

**Rule:** when a check changes what it costs — memory to database, local to network, cached to
computed — re-derive where it belongs relative to the request's rate limits, authorization and
idempotency, rather than editing it in place. The old position encodes the old cost. State the new
position's reason in the code, and pin it with a test that exhausts the budget and asserts the
expensive call was never made; an ordering that nothing observes is an ordering the next edit will
undo. See [[2026-09-10-a-predicate-is-only-as-true-as-the-read-underneath-it]], which is the same
change from the other side: that one is about the read being true, this one about what asking cost.
