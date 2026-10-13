# The adoption form keeps the previous opening's pet id when it opens on nobody

**Status:** open · opened 2026-09-22 · reasoned from the code and from PR #38's fifth review, not reproduced in a browser

`useAdoptionFormController` copies a selection into the form's fields only when it is handed a
real animal:

    useEffect(() => {
      if (selectedPet && open) {
        setValue("petId", selectedPet.id);
        setValue("petName", selectedPet.name);
      }
    }, [selectedPet, open, setValue]);

`petId` otherwise keeps whatever the last opening left in it, because the dialog is unmounted on a
200ms delay and `reset()` runs inside that timer. So reopening the form within the close animation,
from a surface that passes `selectedPet = null`, can show a title naming one animal — the title
follows `resolveDefaultPet` — while the field underneath still carries the previous one's id.

This is the path PR #38's fourth review made worse and its fifth review caught: the gallery's
`pets.find(isAdoptable)` fallback exists to guarantee the effect runs, and was briefly deleted as
redundant. See `tasks/lessons/2026-09-16-a-review-calling-code-dead-is-a-claim-to-check-against-its-consumers.md`.

**What changed on 2026-09-22, and what did not.** `resolveDefaultPet` no longer falls back to
`allPets[0]` whatever its status, so it returns `null` in one more case — a shelter where no animal
is adoptable at all. That widens the window above rather than closing it. What it is paired with is
the boundary: `submitApplication` now refuses a pet it cannot find, one that is archived, and one
whose status is not adoptable, so the worst outcome of the stale field is a rejected submission with
a confusing message, not an application recorded against an animal who has already gone home.

The dangerous version of this defect is therefore closed. The confusing version is not.

Not fixed at the same time because the obvious repairs each cost something that needs deciding
rather than guessing: clearing `petId` when `selectedPet` is null discards a half-filled form if any
surface ever reopens the dialog on the same animal; syncing it to `defaultPet` makes the form submit
for an animal the applicant never chose, which is the shape of the original defect. Neither is
obviously right, and no test covers the reopen-within-the-animation path.

**Settles when:** the form's pet field cannot disagree with its title — either the effect is
extended to cover the `selectedPet === null` case with a stated rule for what `petId` becomes, or
the dialog resets its fields on open rather than on a timer after close — pinned by a component
test that opens the form for one animal, closes it, reopens it within the close animation from a
surface passing `null`, and asserts on the submitted `petId`.
