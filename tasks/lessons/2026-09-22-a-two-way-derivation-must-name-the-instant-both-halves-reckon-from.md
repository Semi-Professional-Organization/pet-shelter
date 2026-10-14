# A two-way derivation must name the instant both halves reckon from

**Learned:** 2026-09-22

PR #42 made age and birth date derive from each other. The two halves were anchored to
different days and nobody noticed, because each half is correct read on its own:

- `withDerivedAge` computes `age` from `birthDate` **as of now** — that is the whole point of
  the 2026-08-30 decision, so a stored age cannot rot as an animal ages.
- `PetFormDialog.handleAgeChange` computed `birthDate` from the typed age **as of the intake
  date**, because it reused `approximateBirthDate`, whose existing caller `deriveBirthDate`
  passes intake for legacy rows where the age string was written down on arrival.

Reusing the shared helper was the right instinct and still produced the bug, because the helper
takes the reference day as an argument and the two callers legitimately want different ones.
Probed: intake `2023-01-10`, operator types `3 years` → birthday `2020-01-10` → saved age
`6 years`. The operator said three, the record said six, and the displayed age walked a further
year from the typed text every year — which is the drift
`tasks/open/pet-form-has-no-birth-date-field.md` was opened about, reproduced *inside* the
feature added to end it.

A round trip is the only test that catches this. Every individual test passed: the age formatter
was right, the approximator was right, and the component test that covered the coupling still
passed either way, because the dialog defaults `intakeDate` to today for a new animal — so both
anchors agree in exactly the case the test set up. It took an `editingPet` with a past intake
date to separate them.

**Rule:** When two functions convert between the same pair of values, write the test that sends
a value through both and back, and arrange it so the two reference points *differ* — a fixture
where they coincide proves nothing. If the shared helper takes the reference as a parameter,
say in its docstring which caller passes what and why, because the next caller will otherwise
copy whichever call site it read first.
