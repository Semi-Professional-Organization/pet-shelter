# The FAQ and bulletin dialogs can likely save twice if Save is clicked while they close

**Status:** ASSERTED · opened 2026-10-20 · read from the code during a review of the test-harness branch, not reproduced in a browser

`FaqFormDialog` and `BulletinFormDialog` submit with `await onSave(values)` and disable Save only
while react-hook-form's `isSubmitting` is set. Their parents (`FaqDataTable.handleSave`, and the
bulletin table the same way) await the server action and then close the dialog. So `isSubmitting`
clears as the dialog starts its closing animation, during which it stays mounted and Save is
enabled again: a click in that window would submit the same values a second time and create a
duplicate entry.

`PetFormDialog` had the same gap once its artificial 400 ms wait was removed, and now locks Save
from the first submit until it opens again
(`tasks/decisions/2026-10-20-the-pet-form-locks-save-until-it-opens-again.md`). The two other
dialogs were left alone because the test-harness branch did not touch them.

**Settles when:** a component test clicks Save on each dialog twice around the close and shows one
save (then the same lock, ideally a shared hook, goes into both), or a browser check shows the
closing dialog does not take clicks, which closes this as a non-issue.
