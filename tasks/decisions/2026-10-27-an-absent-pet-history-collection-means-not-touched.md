# An absent pet history collection means "not touched", and only a submitted list replaces it

**Decided:** 2026-10-27

`updatePet` (`src/actions/pets.ts`) and the client store's `updatePet` (`src/lib/client/petStore.ts`)
used to assign `updates` and `medicalTimeline` unconditionally, so a payload that left either key
out cleared every stored row. That was a deliberate contract, pinned by a test named "should clear
history even when the payload omits the keys entirely", for callers that send the whole animal.

Its only caller never did. `PetFormDialog` manages neither collection and submits neither key, so
saving any edit deleted that animal's clinical events and progress updates (issue #107). The rule
and its sole writer disagreed, and the writer wins every time.

Two fixes were open: carry both collections through the dialog, or stop treating absent and empty
as the same thing. The second was chosen because it closes the bug for every future caller, not
just this one, and it is the rule `galleryImages`, `isArchived`, `deletedAt` and
`birthDateIsEstimate` already follow in the same function. An explicit `[]` still clears; the
test that pinned omission-as-clear now pins omission-as-keep
(`tests/unit/petHistory.test.ts`, `tests/components/petStoreKeepsHistory.test.ts`).

Reversing this means some caller must send the full lists on every save, or history is lost again.
