# The pet form locks Save from its first submit until it opens again

**Decided:** 2026-10-20

`PetFormDialog` used to wait 400 ms before every save, for no reason anyone recorded, and that
wait was all that kept a second click from saving a second pet record. Without it, a click while
the dialog animates closed (it stays mounted until the animation ends) reached `onSave` again.

What it does now (`src/components/admin/PetFormDialog.tsx`):

- The first submit sets a lock: a ref, read synchronously so two submits dispatched before a
  re-render cannot both pass, and state, which disables the button. The lock clears only when the
  dialog opens again.
- `onSave` is awaited. If it throws or rejects, the lock clears and the dialog stays open for
  another try; if it settles, the dialog asks to close.
- Each opening is counted, so a save that settles after the operator closed and reopened the
  dialog neither closes nor unlocks the new opening.
- react-hook-form's `isSubmitting` still stops a fast double-click on its own.

The contract this puts on a parent, written on the `onSave` prop: close the dialog after a save
(rendering it closed before reopening it), and reject only when nothing was saved. The one parent,
`PetDataTable` through `usePetTableController`, does both: it applies the change locally, syncs
with the server in the background with its own rollback, and rejects only if the local part throws.

Alternatives not taken:

- **Gate on `open` instead of a lasting lock.** Simpler, and suggested twice in review, but it does
  not hold: a submit runs on the render it was dispatched from, where `open` is still true. With the
  lock's check swapped for `if (!open) return`, two of the file's tests save twice (two submits
  before a re-render, and a submit while closing). The closing animation it would guard also cannot
  be rendered in jsdom, where the content unmounts at once.
- **Unlock after a failed save only when the parent says nothing was saved.** Needs a richer
  `onSave` result for a case the one parent cannot produce.

Each part is mutation-checked: dropping the ref, the state, the await, the unlock on failure, or
the opening check fails a test in that file.
