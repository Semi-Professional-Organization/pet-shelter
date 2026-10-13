# A public adoption submission validates its target against the database, per caller

**Decided:** 2026-09-22

Settles `tasks/open/submit-application-checks-a-fixture-and-no-status.md`, which is deleted with
this entry. `submitApplication` resolved its target with `findServerPetById` — the synchronous
mirror reader — and then tested `pet && pet.isArchived`. Three defects in those two lines: the
archive flag came from `src/data/pets.json` rather than from Postgres; `pet &&` passed when nothing
matched, so an unknown id was accepted; and no status was checked, so an adopted animal accepted
applications. All three are fixed. What follows is the part that was a choice.

## Adoptable means `getPetStatusPresentation(status).isAdoptable`, not `status === "Available"`

The flag is true for `Available` alone today, so the two agree — but they are different claims, and
the gallery's preselect already reads the flag. Using it means a new status alias, or a decision
that some other status may be applied for, changes one table instead of splitting the server away
from the UI in silence. The same substitution was made in `resolveDefaultPet` and in the
controller's `availablePets`, one line below it, which had the same raw comparison.

Consequence accepted: **`Pending` is refused.** That is not a new product call — it is the one
already made in `tasks/decisions/2026-09-10-pending-is-a-stage-of-adoption-not-a-track.md`, where
Pending sits in the adoptable *track* so the catalogue keeps it beside Available, while the detail
page renders its button disabled on purpose. The server now agrees with the button. Reverse it by
giving `Pending` `isAdoptable: true`, which is one line and would also re-enable that button.

An unrecognised status resolves to the `pending` presentation, so it fails closed rather than
falling through as adoptable.

## An exact-id match, not merely a found one

Swapping to `findServerPetByIdAsync` is not on its own sufficient, which is the part of the brief
that needed revising. That reader falls through to the mirror after a *successful* read that found
no row, and the mirror matches ids case-insensitively where Postgres does not. So a posted
`PET-001` missed the database, matched fixture `pet-001` — Available and unarchived there — and the
submission was accepted against an animal the database had archived. The action refuses any result
whose id is not exactly the one posted, which is what `getPetById` does for `/pets/[id]`.

## Per caller, knowingly, rather than fixing the repository

`tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md` argues the opposite — that
guarding each caller "does not scale past two" and the repository should return `null` after a
successful empty read. That argument is right, and this makes three guarded callers.

It was still not done here. That fix changes every caller of `findServerPetByIdAsync` at once,
including `src/actions/sponsorships.ts` — a second public write path with no test covering this
behaviour — and its own settle condition requires checking it against the update and archive
mutations that read through the same helper. Doing it inside a change whose claim is about adoption
submissions would have shipped an unreviewed behaviour change to sponsorship checkout.

**A parallel session made exactly that repository fix while this one was in flight** —
`worktree-pet-missing-row-is-an-answer`, commit `97df591`, "Return null for a pet the database
lacks", cut from the same base `8d36ace` and recorded in
`tasks/decisions/2026-09-22-a-pet-the-database-lacks-is-a-missing-pet.md`. That is the better fix
and this entry does not dispute it. Their source paths and this one's are disjoint, so git merges
them without saying anything, which is worth nothing on its own; they were therefore merged
locally and verified together before either was proposed — typecheck clean, unit 1589,
integration 79, this action's ten tests passing against their reader. The per-caller guard here
stays after that lands: it is what `getPetById` carries too, it costs one comparison, and an
action on a public write path should not depend on a repository invariant it cannot see.

That branch also *closes* `pet-profile-falls-back-to-a-fixture-the-database-lacks.md` by deleting
it. A note recording this as its third guarded caller was drafted onto that entry and then
withdrawn: modifying a file the other branch deletes is a modify/delete conflict, and a conflicted
pull request gets no CI run at all. The record lives here instead.

What changes when that fix lands is the residual below, not this decision.

**The residual is therefore real, and it is two cases, not one.** Both are named in a comment at
the guard. Neither is caught by the exact-id comparison, because in both the fixture answers under
the very id that was posted:

- *the database answers "no such row"* for an id that is in `pets.json`. This is what `97df591`
  closes.
- *the query throws.* `handlePersistenceError` rethrows only under `STRICT_PERSISTENCE`, which
  nothing outside `vitest.config.mts` and one npm script sets, so in production an outage returns
  the mirror and an application is accepted against a fixture animal at the fixture's status.
  `97df591` does not close this and is not meant to: a swallowed database error must not fail the
  mutation, which is
  `tasks/lessons/2026-09-04-a-dual-layer-fallback-must-never-let-a-swallowed-database-error-fail.md`.

So the claim this entry's title makes holds whenever the database answers, and not when it cannot.
That distinction was missing from the first draft of this entry, which said `97df591` closed "the
residual" as though there were one; the parallel session's reviewer caught it and it was checked
here against `persistenceMode.ts` before being corrected.

## The lookup moved behind the rate limits

It ran above them, which was free when it read an in-memory array and is a Postgres round trip now
that it does not. Leaving it there would have handed an unauthenticated POST one `findUnique` per
request with nothing bounding it — a regression introduced by the fix itself. It sits after both
budgets and before the idempotency wrapper, so a refusal is not cached against the idempotency key.

## `resolveDefaultPet` returns null instead of `allPets[0]`

The last resort was taken whatever the animal's status. Removing it makes `null` reachable in one
more case, and `null` is load-bearing here — see
`tasks/lessons/2026-09-16-a-review-calling-code-dead-is-a-claim-to-check-against-its-consumers.md`,
where deleting a "redundant" branch that produced a pet instead of `null` broke the form's field
sync. Both consumers were checked rather than assumed: the dialog title in `AdoptionForm` already
branches on it, and the controller already defaults `petId` to `""`. Neither is new, because
`allPets` is empty on a cold `/adopt` render and this function already returned `null` there.

A selected animal is still returned as given, without a status check. Opening the form from an
animal's own page should headline that animal; the server is what refuses the submission. Changing
that would make the dialog title disagree with the page that opened it.

The widened `null` window leaves the form's stale-`petId` path more reachable, which is now
`tasks/open/adoption-form-keeps-a-stale-pet-id-when-it-opens-on-nobody.md`.

## The record is written from the verified animal, not from the request

Added after review, and the reason it belongs in this entry rather than a follow-up: a guard that
validates one copy of a value while the write uses another has not validated the write.

`petId` was written untrimmed while the guard compared `validated.petId.trim()`. The column carries
a foreign key to `Pet.id`, so a posted `" pet-001 "` cleared every check and then raised P2003 on
insert — swallowed outside strict mode, leaving the application in the in-memory mirror only, with
`success: true` and a reference code returned to the applicant.

`petName` was written from the request while the resolved animal sat in scope. That is not
cosmetic, which is what an earlier draft of this work assumed: `atomicUpdateApplicationStatus`
auto-rejects other open applications matching on `petName` as well as `petId`, and
`markCachedPetAdopted` marks the first pet matching **either** id or name. A submission naming an
animal it was not for could therefore close that animal's real applications when approved, and
flip the wrong pet to Adopted.

Both now come from `pet`. The alternative — trimming in the schema — was rejected because it fixes
one field and leaves the general shape, which is that the action holds the authoritative row and
should use it.

## Not done

`lookupApplicationStatusAction` reads `findServerPetById(app.petId)` at the same file's line 505.
Left alone deliberately: it is a read-only display enrichment on the tracking portal that already
falls back to the application's own stored `petBreed`, so a mirror hit costs a possibly-stale breed
and photo, not a wrong write. It belongs to the repository-level fallback question above.
