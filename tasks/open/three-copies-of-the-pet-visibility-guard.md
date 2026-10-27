# Three actions carry copies of the same pet visibility guard

**Status:** open · opened 2026-10-27 · found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`

`getPetById` in `src/actions/pets.ts`, `submitApplication` in `src/actions/applications.ts` and,
since that decision, `createPetSponsorshipAction` in `src/actions/sponsorships.ts` each check that
the resolved pet exists, carries exactly the requested id and is not archived. The comment at the
second copy said a third would want a repository reader instead. The copies already differ in
which reader they use (display versus write) and in whether they check status, and the status
question for sponsorship belongs to the status-guards work, so the extraction was not done in the
same pull request.

**Settles when:** one repository function (for example `findVisiblePetById`, with a flag for the
write path) carries the exists, exact-id and archived checks, the three actions call it, and the
existing guard tests still pass unchanged.
