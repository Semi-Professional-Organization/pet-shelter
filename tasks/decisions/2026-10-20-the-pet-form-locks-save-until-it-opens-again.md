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
- react-hook-form's `isSubmitting` still stops a fast double-click on its own.

The contract this puts on a parent, written on the `onSave` prop: close the dialog after a save
(rendering it closed before reopening it), and reject only when nothing was saved. The one parent,
`PetDataTable` through `usePetTableController`, does both: it applies the change locally, syncs
with the server in the background with its own rollback, and rejects only if the local part throws.

Alternatives not taken:

- **Disable Save while `open` is false, with no lasting lock.** Simpler, and a parent that keeps the
  dialog open could save again. But the window it guards, the closing animation, cannot be rendered
  in jsdom (the content unmounts at once), so no test could pin it; the lasting lock is pinned by
  `tests/components/PetFormDialog.test.tsx`.
- **Unlock after a failed save only when the parent says nothing was saved.** Needs a richer
  `onSave` result for a case the one parent cannot produce.

Each part is mutation-checked: dropping the ref, the state, the await, or the unlock on failure
fails a test in that file.
