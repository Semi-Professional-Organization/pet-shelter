# A stale admin table or edit form can undo an approval

**Status:** ASSERTED · opened 2026-11-11 · found by the round-2 `/code-review xhigh` of the
#210/#211 fix, reasoned from the code

The admin table and the pet edit form send no expected status. `updatePetStatus` and `updatePet`
(`src/actions/pets.ts`) read the pet from the database at the start of the request, and since
#210/#211 both writes match only the status that read returned, so a change *between that
read and the write* is refused. A change made *before the click* is not: the server never learns
what the admin was looking at.

- **Status dropdown on a stale table.** An application is approved, so the pet is Adopted. An
  admin whose table still shows Available picks Available. The server reads Adopted, Adopted →
  Available is a legal transition, and the write succeeds: the approval is undone.
- **Edit form.** The edit dialog submits the whole form, status included. Saving a form opened
  before the approval writes its old status over Adopted: the write's condition is the status
  the server read at save time (Adopted), which still matches, and nothing checks what the form
  showed.

Out of #210/#211's scope, which is the server's stale mirror; this is new behaviour, so the owner
decides.

The likely mechanism is optimistic concurrency on a version the client already holds, such as
an `updatedAt` column the table and form send back and the write matches on, rather than status
alone, which would also catch a stale form whose status did not change.

The same gap covers more than status: a full edit's write is conditional on the status it read
only, so an archive (or any other column change) landing between that read and the write is
overwritten by the edit. A version match on `updatedAt` would cover that too.

**Settles when:** the table and the form send the status they showed, the server puts it in the
write's `where` (or refuses when it differs from the stored one), and a test approves an animal
and then submits a status change and an edit from the pre-approval copy, asserting both fail and
the row stays Adopted.
