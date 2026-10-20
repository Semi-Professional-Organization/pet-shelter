# The admin forms default dates to the UTC day, which is a day behind in Malaysia before 08:00

**Status:** open · opened 2026-10-20 · raised by a review of the test-harness branch, confirmed by reading the code

`PetFormDialog` defaults a new pet's intake date to `new Date().toISOString().split("T")[0]`
(`src/components/admin/PetFormDialog.tsx`, in the form's defaults and again when it opens), and
`ApplicationDetailDialog` turns "tomorrow" into an interview date the same way
(`src/components/admin/ApplicationDetailDialog.tsx`). `toISOString()` is UTC, so from 00:00 to
07:59 in Malaysia the intake date defaults to the day before, and "tomorrow" comes out as today.

The components tier now runs in `Asia/Kuala_Lumpur` (`tests/setup/hermeticRuntime.ts`), so a test
with a fixed clock can show this. None does yet, and nothing has been changed.

**Settles when:** both defaults use the local calendar day, pinned by a test with the clock at
01:00 Malaysia time, or the owner decides the UTC day is what these fields should hold.
