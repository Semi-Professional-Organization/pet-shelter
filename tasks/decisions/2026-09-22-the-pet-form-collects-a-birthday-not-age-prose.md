# The pet form collects a birthday, and age prose became derived everywhere

**Decided:** 2026-09-22 · closes `tasks/open/pet-form-has-no-birth-date-field.md`

`PetFormDialog` used to collect `age` as free text ("2 years") and `ageCategory` as a select.
Neither was ever stored: `buildPetPersistencePayload` wrote `intakeDate − age` to `birthDate` and
dropped both, and `mapDbPetToPet` recomputed them from that date on every read. So an operator's
typed "2 years" became a birthday relative to intake, and the displayed age then walked away from
what they typed by one year per year — while the band they picked was never read back at all.

The open entry offered two ways to settle: add a birth date field *and keep the age text as a
display-only estimate*, or have a maintainer confirm intake-relative ageing was intended. This
takes the first, minus the keeping.

## The form collects `birthDate` and `birthDateIsEstimate`, and nothing else about age

- `petBaseFormSchema` drops `age` and `ageCategory`. `birthDate` moves from an unvalidated
  `z.string().optional()` to the required `isoDateSchema` already defined in the same file —
  which was sitting there, used by the history schemas, while the birth date went unchecked.
- `birthDateIsEstimate` stays defaulted to `true`. For a rescue, a known birthday is the
  exception, and a flag that defaults to "we know" would be a lie by default.
- The dialog renders a `type="date"` input capped at the intake date, plus an "Estimated — exact
  date unknown" checkbox, and shows the derived age and band **read-only** beside it, recomputed
  as the operator types.

**Why read-only rather than kept as an editable estimate.** The open entry suggested keeping the
age text for display. A second editable copy of a derived value is the defect, not a mitigation:
it is exactly what went stale before. `src/lib/domain/petAge.ts` is the one place either value is
computed, and the form now shows what the site will show rather than offering to disagree with it.

## The write paths had to change too, or the field would have been inert

Adding the input alone would have done nothing. Three places dropped `birthDate` on the floor and
copied the prose instead:

- `src/actions/pets.ts` — `createPet` built the domain pet with `age: validated.age`, and
  `updatePet`'s `{...existing, ...validated}` left the previous read's prose in place. Both now
  wrap the literal in `withDerivedAge`.
- `src/lib/client/petStore.ts` — `addPet` and `updatePet` did the same for the localStorage
  mirror, so even the offline store lost the birth date on every edit.

The domain `Pet` type keeps `age` and `ageCategory` as required fields. They are still what every
card, table and CSV export reads; they are simply always derived now, never submitted.

## A birth date after the intake date is rejected

New refinement on `petFormSchema`. Worth pinning because the derivation this replaced *could not*
produce such a date — `intakeDate − age` is always on or before intake — so a typed birthday is
the first way one can enter the system, and a future date renders as a plausible "1 month" rather
than as an error.

## Verification

`npm run typecheck` clean; `npm test` 1580 passed / 98 files; `npm run test:integration` 59
passed / 6 files; `npm run lint` 0 errors (`PetFormDialog.tsx` carries the same single
pre-existing `react-hooks/incompatible-library` warning as before, confirmed by linting the
unmodified file in the main checkout); `npm run docs:check` OK.

The type change did the work of finding the callers: `tsc` failed in exactly three test files
whose form fixtures still supplied `age`/`ageCategory`, and nowhere in `src/`.

## Three corrections from `/code-review`

- **`max` no longer locks an operator out of a pet.** It was bound to the intake date flat, so any
  row whose stored birthday was already later — the shape `@default("2024-01-01")` produces for an
  animal that arrived before 2024 — could not be submitted at all. A `rangeOverflow` never reaches
  `errors.birthDate`, so the whole form silently refused to save that animal's name, status or
  photos, with only a native bubble to say why. The bound is now the later of the intake date and
  the stored value: a new date still cannot be typed past intake, and an existing bad one can be
  corrected instead of trapping the record.
- **A blank field now says "Birth date is required"** rather than "Date must be in YYYY-MM-DD
  format", which is what an empty string earns from the regex and is not what the operator did
  wrong. `z.string().min(1, …).pipe(isoDateSchema)`.
- **The read-only readout is no longer an orphan.** Its `<Label>` had no `htmlFor` and wrapped no
  control, so a screen reader announced "Age Stage" attached to nothing and the computed age with
  no name. The label carries an `id` and the readout an `aria-labelledby`.

A second round, on the fix commits, found the birth-date rule had a hole on the path it was
written to protect. It was purely relative, and `intakeDate` is only `z.string().min(4)` — so
`intakeDate: "2026"` failed the shape test, skipped the check entirely, and let any birthday
through. `createPet({ birthDate: "2099-01-01" })` then rendered as a plausible "1 month", because
`computeAgeInMonths` clamps a negative age to zero: exactly the failure the rule exists to stop.
There is now an absolute bound as well, which depends on no other field.

**`intakeDate` was deliberately not tightened to `isoDateSchema`.** Its stored values in
production are unknown, every edit re-validates the whole form, and a stricter rule would strand
any record whose intake date is not already ISO — the same trap as the `max` binding above, which
is the second time this shape has come up on this branch. The bound is compared against *tomorrow*
in UTC rather than today, so an animal born this morning in Kuala Lumpur is not refused because
UTC has not caught up.

The same review noted that `birthDateIsEstimate` is stored end to end and read by nothing —
filed as `tasks/open/birth-date-estimate-flag-is-stored-but-never-shown.md` rather than fixed,
because displaying it touches seven components and needs a Malay string for every English one,
which runs straight into the open bilingual-age entry.

## What was deliberately not done

- **`Pet.age` was not made bilingual.** `formatAgeString` returns `{ en, ms }` and every caller
  still takes `.en`, so a Malay visitor still reads "2 years".
  `tasks/open/ages-render-in-english-on-malay-site.md` stays open; it is a type-contract change
  across modules and was not a ride-along on this one.
- **`intakeDate` was left as `z.string().min(4)`.** Tightening it to `isoDateSchema` is right but
  is a separate change with its own blast radius through the fixtures.
- **The filter schema's `ageCategory` was left alone.** The gallery's age filter is a band the
  visitor picks, not a value stored on a pet, and `AGE_BANDS` is still its source.

Database half: `tasks/decisions/2026-09-22-pet-birth-date-backfill-derives-from-intake-and-age.md`.
