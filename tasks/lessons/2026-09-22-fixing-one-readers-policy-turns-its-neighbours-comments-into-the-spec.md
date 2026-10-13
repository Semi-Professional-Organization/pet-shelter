# Fixing one reader's policy turns its neighbours' comments into a spec for the wrong behaviour

**Learned:** 2026-09-22

`getServerPetsAsync` used to gate its fixture fallback on `rows.length > 0`. When that was fixed
to treat an empty table as an answer, three comments elsewhere kept describing the old shape:

- `tests/integration/support/prismaDouble.ts` justified its empty-by-default reads with
  "`getServerPetsAsync` only trusts the database when it returns at least one row" — the reason a
  test author was told to arrange rows;
- `tests/integration/faqEmptyPublishSet.test.ts` warned that "the wrong shape is next door in
  `petRepository.getServerPetsAsync`" and that anyone reconciling the readers had "two nearby
  precedents pointing the wrong way";
- `tasks/open/pets-json-fallback-empty-means-outage.md` quoted the `length > 0` code as live.

All three were stale for weeks, and `findServerPetByIdAsync` — the reader beside it, which really
did still fall through after a successful empty read — looked like a deliberate house style
rather than the last instance of a bug that had already been fixed twice. The comments were not
merely out of date; they were the argument for leaving it alone, and they outlived the thing they
described because nothing fails when prose goes wrong.

The tell: a comment in file A asserting a fact about file B. Nothing recompiles it, no test
covers it, and the next reader treats it as more authoritative than the code because it reads
like intent.

## Then I did it again, in the commit that shipped this lesson

The replacement comments were wrong in the same way, and a review caught all three:

- `petRepository.ts`: "This is the same trigger `getServerPetsAsync` above uses." It is not.
  `getServerPetsAsync` has no `isDatabasePersistent()` gate — it always issues the query and
  reaches the fixture only from `catch`. The reader I was documenting has a third door the other
  two lack. Same *policy*, different *trigger*, asserted as identical.
- `prismaDouble.ts`: "All three fall back only from their `catch`" — false for the same reason,
  and contradicted by a test in the very same commit, `"serves the mirror without querying when
  no database is configured"`.
- `actions/pets.ts`: claimed the exact-id guard "covers" the two remaining mirror routes. It
  refuses a case-variant and nothing else; `/pets/pet-001` spelled exactly is still served from
  the fixture on both.

Writing the lesson did not stop me repeating it an hour later, because the failure is not
forgetfulness. Each sentence was a claim about *another* function, written from memory of having
read it, at the moment I was busy with a third thing. That is indistinguishable, at writing time,
from knowing it.

**Rule:** when you change a policy that another file's comment, doc or ledger entry cites as
precedent, `grep` the function's name across `src/`, `tests/` and `tasks/` and fix every prose
copy in the same commit — the same "once two copies have diverged, fix both" that `AGENTS.md`
applies to code.

## A third time, and the rule above would not have caught it

The same day, the decision entry for that change called a side effect "cosmetic": an anonymous GET
reorders the shared `serverPets` mirror. A reviewer on a neighbouring branch then found that
`markCachedPetAdopted` reads that order — taking the first entry matching id *or* name — so an
approval could mark the wrong same-named animal and write *its* id into a
`PET_STATUS_TRANSITION_ADOPTED` audit row. Not cosmetic: a wrong permanent record, with the order
chosen by an unauthenticated caller. Settled in
`tasks/decisions/2026-09-22-an-approval-marks-the-id-it-asks-for.md`.

"Cosmetic" was an assessment of *consequence*, not a claim about a named symbol, so "open the
symbol you name" does not fire on it. Nothing was named. The question it silently answered was
**"who else reads this?"**, and the honest answer needed `grep serverPets`, which nobody ran —
the claim was reasoned from what the reordering does to catalogue display, and generalised.

## A fourth time, where the claim was true when it was written

The follow-up fix carried a comment justifying itself with "`petId` is unvalidated public input"
and "nothing on the submit path trims `petId`". Both were accurate the hour they were written.
Then the sibling branch merged, and `submitApplication` began trimming the id and refusing one
that matches no animal — so the comment described a threat that no longer arrives, and the next
reader could reasonably conclude the guard is dead code and delete it.

This one is not carelessness: no amount of checking at writing time would have caught it. The
premise **expired**. What distinguishes it is that the claim was about a *different branch's*
file, in a repo where several branches are in flight at once, and it stopped being true at a
merge rather than at a keystroke.

**Rule:** a cross-file premise has to be re-read at the merge, not only when written — if you
merge a branch that touches a file your comments reason about, re-read those comments as part of
resolving the merge. And when a guard's justification is "the caller lets hostile input through",
say which caller and when, so a later reader can check whether it is still so; a justification
that names its evidence can be re-verified, one that states a bare fact can only be believed or
deleted. The guard itself stays either way — defence in depth is the right answer precisely
because the caller's behaviour is someone else's to change.

**Rule:** before calling a side effect on shared mutable state cosmetic, grep for every reader of
that state and name them. A side effect is only as cosmetic as its least careful consumer, and the
consumer that makes it serious is rarely the one you were thinking about. The same applies to
"harmless", "internal only" and "cache only" — each is a claim about the whole set of readers, and
the set is a `grep`, not a recollection.

**And treat a comment that names another symbol as a claim requiring a read, not a recollection.**
Before writing "the same as X" or "X does Y", open X. If the sentence survives, keep it; if
opening X is not worth it, the sentence is not worth writing — delete it rather than ship an
unchecked cross-file assertion. "Same policy, different mechanism" is the specific shape that
slips through, because the sentence feels true and the reader has no way to tell. A cross-file
claim is [[a-predicate-is-only-as-true-as-the-read-underneath-it]] applied to comments, and the
read underneath a comment is the one nobody ever runs.
