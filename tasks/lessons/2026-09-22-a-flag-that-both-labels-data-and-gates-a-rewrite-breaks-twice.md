# A flag that both labels data and gates a rewrite breaks twice when nobody sets it

**Learned:** 2026-09-22

PR #42 added a calendar birth-date picker to `PetFormDialog` so a shelter worker could record
the day an animal was actually born, instead of the intake-relative guess
`tasks/open/pet-form-has-no-birth-date-field.md` was opened against.

`birthDateIsEstimate` defaults to `true`, and `handleBirthDateChange` never cleared it. One
missing `setValue` line, and two separate things were wrong:

1. **Label.** Every date picked from the calendar was stored as an estimate, so the feature could
   not record the one thing it existed to record.
2. **Guard.** The same boolean is what `handleAgeChange` consults before rederiving the birth
   date from the age text. Reading `true`, it rederived. Since `handleBirthDateChange` also
   *fills in* the Age field, the operator's next keystroke there silently replaced the chosen
   birthday with `intakeDate` minus the typed age — the original defect, reached through the new
   control instead of around it.

Seventeen new unit tests were green, and every one of them exercised the schema, the server
action or the mapper. The dialog had no test file at all — `tests/components/` contained no
`PetFormDialog` test — so nothing in the suite ever picked a date and then typed in a field.

The fix and its tests are not in this branch's final diff: PR #94 rewrote the same form from the
other direction, rendering age and band read-only so the reverse derivation stops existing, and
this branch yielded the form rather than contest it. The defect was real and was reproduced;
what it teaches survives the code being replaced.

**Rule:** When a change adds an exact input beside an existing inferred one, grep for what else
writes the inferred field and write the test that sets the exact value and *then* touches the
inferred input — the ordering is the test, not the two values separately. If one flag both
describes the data and gates the inference, name that in review: a single missing assignment
breaks the label and arms a silent overwrite, and a suite that only tests the persistence layer
will stay green through both.
