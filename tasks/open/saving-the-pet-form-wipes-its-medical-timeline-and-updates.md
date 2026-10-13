# Saving the admin pet form wipes that animal's medical timeline and progress updates

**Status:** open · opened 2026-10-14 · found by `/code-review max` on the birth-date branch

Pre-existing on `master`, not introduced by that branch — but it sits inside a block that branch
edits, and it destroys data on the most ordinary action an operator can take.

`PetFormDialog`'s edit `reset()` payload lists 24 keys and **neither `updates` nor
`medicalTimeline`** (`src/components/admin/PetFormDialog.tsx:110-146`). `onSubmit` adds only
`image` and `galleryImages`. `petFormSchema.parse` drops absent optional keys, so `validated`
reaches the action with both collections missing.

`src/actions/pets.ts` then assigns them unconditionally:

    updates: sortHistoryByDate(validated.updates),
    medicalTimeline: sortHistoryByDate(validated.medicalTimeline),

`sortHistoryByDate(undefined)` returns `undefined`, `buildPetHistoryNestedCreate` turns that into
`{ create: [] }` via `(pet.updates ?? [])`, and `updateServerPet` deletes the previous rows first.
`petStore.updatePet` does the same to the local copy.

**So: open Edit on an animal with medical-timeline events, change one field, Save — and every
clinical event and progress update for that animal is deleted.**

## Why it is this shape

Deletion-by-omission is deliberate and tested: `tests/unit/petHistory.test.ts:824` is named "should
clear history even when the payload omits the keys entirely", and the action carries a comment
explaining that an event left out of the payload is meant to be removed rather than preserved.
That is a reasonable contract for an API whose callers send the whole animal.

The defect is that **the only writer never sends them.** A grep over `src/components/admin` and
`src/app/admin` finds no other screen that manages `medicalTimeline` or `PetUpdate`, so this dialog
is the sole path, and it always sends nothing. The rule and its only caller disagree, and the
caller wins.

## Settles when

Either the dialog carries both collections through its `reset()` and `onSubmit` so the contract is
honoured, or the action stops treating absent-and-empty as the same thing — `validated.updates !==
undefined ? sortHistoryByDate(validated.updates) : existing.updates` — and the test at
`petHistory.test.ts:824` is rewritten to pin an explicit `[]` as the clear signal rather than
omission. The second is smaller and closes it for every future caller; the first keeps the API
contract the tests describe.

Whoever takes it should check the same shape on `galleryImages`, which is assigned
`validated.galleryImages || existing.galleryImages || []` and therefore does *not* have this bug —
evidence the author knew the distinction and applied it unevenly.
