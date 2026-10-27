# A status change out of rehabilitation keeps the rehab fields, and the pet can no longer be edited

**Status:** open · opened 2026-10-27 · found by `/code-review xhigh` on the #107 fix (PR #196)

`updatePetStatus` (`src/actions/pets.ts`) writes `{ ...existing, status }`, so moving a pet from
"In Rehabilitation" to "Available" from the admin table keeps `rehabStage`, `rehabStageMs` and
`rehabProgressPercent`. The form schema refuses those fields on any other status. Opening Edit on
that pet loads them through `reset()`, validation fails on fields hidden because the pet is no
longer under rehabilitation, their messages render only inside that hidden block, and Save appears
to do nothing.

Pre-existing; outside #107's scope.

**Settles when:** a status change that leaves rehabilitation clears the three fields (as `updatePet`
already does when they are omitted), with a test that the pet then passes the form schema.
