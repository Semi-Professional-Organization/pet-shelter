# Every admin pet save marks a known birthday as an estimate

**Status:** open · opened 2026-10-13 · from PS-114

On `master` today, saving a pet from the admin form sets `birthDateIsEstimate` to `true` whatever
it was before. An exactness flag that was deliberately set cannot survive an unrelated edit — an
operator changes a description and the shelter stops claiming it knows that animal's birthday.

The chain, read on `master`:

1. `petBaseFormSchema.birthDateIsEstimate` is `z.boolean().optional().default(true)`
   (`src/lib/validations/pet.ts`), so the key is present on *every* parse, carrying `true`
   whenever the submitter said nothing.
2. `PetFormDialog`'s `reset()` never populates `birthDate` or `birthDateIsEstimate` — there is no
   control for either on `master` — so the form always submits the default.
3. `updatePet` (`src/actions/pets.ts`) builds `{...existing, ...validated}`, and step 1 guarantees
   `validated` carries the key, so a stored `false` is overwritten with `true`.
4. `buildPetPersistencePayload` then persists `true`.

A zod `.default()` is the mechanism worth remembering: it makes "the submitter did not mention
this field" indistinguishable from "the submitter said `true`", so the usual `?? existing` and
`{...existing, ...validated}` idioms stop protecting the stored value.

**Not a defect this branch introduced, and not one it fixes.** It was surfaced by a review of
PR #42 and is reported here so it is not lost with that branch. PR #94 fixes it on
`worktree-pet-birth-date-migration` by dropping the `.default(true)` and having each write path
apply `?? true` itself, with a test asserting the key is *absent* from the parse output — which is
the actual mechanism rather than its symptom. That PR has been open and unmerged since
2026-09-22.

Note the blast radius is currently bounded by something worse: production has no `pets.birthDate`
or `pets.birthDateIsEstimate` column at all, so nothing is being downgraded in production yet.
See `tasks/open/production-schema-has-drifted-ahead-of-master.md`.

**Settles when:** PR #94 merges, or — if that branch is abandoned — the `.default(true)` is
removed from `petBaseFormSchema` and each write path defaults the flag itself, with a test that
pins the key's absence from a parse that omitted it.
