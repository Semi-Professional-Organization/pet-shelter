# The adoption form offers animals the server will refuse

**Status:** open · opened 2026-09-22 · found by review of the submission-guard change, read from the code and not driven in a browser

`submitApplication` now refuses an animal that is archived or whose status is not adoptable. Three
places in the form can still put such an animal in front of the applicant, so the refusal arrives
at the end of a four-step wizard instead of at the start:

1. **The pet `<select>` renders every animal.** `AdoptionWizard` maps `allPets`, labelling each
   option with its status — "Bella — Mixed (Adopted • Free Adoption)". An applicant can pick it,
   complete all four steps, and only then be told the animal is not accepting applications. The
   controller computes an `availablePets` list with the right predicate, but **nothing consumes
   it**: it is returned in `state` and never destructured.
2. **`/adopt?petId=<id>` preselects any public animal.** `AdoptPage` takes the id straight from the
   query string and looks it up in `getPublicPets()` with no status filter, so a link to an Adopted
   or Pending animal opens the form pre-filled and titled for it. The gallery button and the detail
   page's call to action are both gated on `isAdoptable`; this entry point is not, and
   `resolveDefaultPet` returns `selectedPet` as given by design — the dialog title should name the
   animal whose page opened it.
3. **No adoptable animal at all.** `resolveDefaultPet` returns `null` rather than the old
   status-blind `allPets[0]`, so `defaultValues.petId` is `""` while the select still renders every
   animal from `allPets`. The control shows a name and the form value is empty, which surfaces as
   "Please select an adoptable pet" on Next against a field that looks filled in. Before the last
   resort was removed, value and control could not disagree this way.

None of this accepts a bad application — the server is the boundary and it holds. The cost is a
wasted five minutes and a confusing error, which is a better failure than the one it replaced
(the application used to be *accepted* against an adopted animal) but is not the right one.

**A fourth, from the same review.** On success the controller calls `addApplication(input)` with
what it posted, while the server now records the *verified* animal's id, name and breed. The two
disagree whenever they differ — a posted id with surrounding whitespace, or an animal staff renamed
between the page render and the submission — so the applicant's local list and the success screen
name something other than the record their reference code points at. `res.data` holds the written
record and is already read one line above for the reference code; it is scoped inside the `try`,
so using it means hoisting that binding rather than changing one argument, and
`addApplication` takes an `ApplicationFormInput` rather than the record. Worth doing with the rest
of this entry rather than alone.

Not fixed with the server guard deliberately. Narrowing the select to the adoptable list is not
one line: the control must still contain whatever `selectedPet` put in the field, or the value and
the options disagree again in a new way — case 2 above puts a non-adoptable animal there on
purpose. The shape that works is probably the adoptable list plus the current selection when it is
not already in it, and that is a UI decision with its own test, not a ride-along on a change whose
claim is about what the server accepts.

**Settles when:** the form cannot offer or open on an animal the server will refuse without saying
so at the point of choice — and the `defaultPet === null` case leaves the field and the control
agreeing — pinned by a component test that renders the wizard with no adoptable animal and one
with a non-adoptable `selectedPet`, asserting on what the select offers and what `petId` holds.
