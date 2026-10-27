# An approval can auto-reject unrelated legacy applications in the mirror

**Status:** ASSERTED · opened 2026-10-27 · found by review of the adoption audit change (#198), read
from the code and not reproduced

After an approval, `atomicUpdateApplicationStatus` closes other open applications in the mirror when
`otherApp.petId === currentApp.petId` or the pet names match. The transaction beside it filters on
`petId` only and is skipped when the approved application has none. So approving a legacy
application with an empty `petId` rejects, in the mirror only, every other open application that
also has an empty `petId`, whatever animal it was for, and writes an
`APPLICATION_AUTO_REJECTED_DUE_TO_ADOPTION` audit row for each. Postgres rejects none of them.

The same class as #101 (mirror and audit derived from the cache instead of the write), left out of
that fix to keep its scope.

**Settles when:** the mirror and the audit rows reject exactly the applications the transaction
rejected, pinned by a test approving a legacy application beside another legacy one.
