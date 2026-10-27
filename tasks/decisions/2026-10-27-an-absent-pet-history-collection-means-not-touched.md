# An absent pet history collection means "not touched", and only a submitted list replaces it

**Decided:** 2026-10-27

`updatePet` (`src/actions/pets.ts`) and the client store's `updatePet` (`src/lib/client/petStore.ts`)
used to assign `updates` and `medicalTimeline` unconditionally, so a payload that left either key
out cleared every stored row. That was a deliberate contract, pinned by a test named "should clear
history even when the payload omits the keys entirely", for callers that send the whole animal.

Its main caller never did. `PetFormDialog` manages neither collection and submits neither key, so
saving any edit deleted that animal's clinical events and progress updates (issue #107).

Two fixes were open: carry both collections through the dialog, or stop treating absent and empty
as the same thing. The second was chosen because it closes the bug for every caller, not just this
one. It is the rule `birthDateIsEstimate` and `deletedAt` already follow in the same function.
(`galleryImages` and `isArchived` look like they follow it, but their schema defaults fill an absent
key in, so the fallback never fires. The dialog always sends both, so nothing is lost today.)

The rule is enforced in the repository, not only in the action. `updateServerPet` takes a
`PetHistoryReplacement` naming the collections a write replaces, and deletes and recreates only
those. A first version kept the action's in-memory copy and let the repository rewrite every row
from it; review found that this overwrites newer database rows with a stale mirror, resets each
row's `createdAt`/`updatedAt`, and still happened on every `updatePetStatus` call. Now an edit or a
status change that sends no history queues no history writes at all
(`tests/unit/petHistory.test.ts`, "should not delete or rewrite stored history rows when an edit
omits them"). An explicit `[]` still clears.

Reversing this means some caller must send the full lists on every save, or history is lost again.
