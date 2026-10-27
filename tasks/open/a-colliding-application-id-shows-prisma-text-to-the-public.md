# A colliding application id shows Prisma's error text to the public

**Status:** ASSERTED · opened 2026-10-27 · predates and was found by review of
`decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`, reasoned from the code

`submitApplication` builds `id: app-${Date.now()}`. Two submissions in the same millisecond share
it, the insert raises P2002 on `id`, `handlePersistenceError` rethrows unique violations, and
`insertWithUniqueReferenceCode` retries only a `referenceCode` collision. The action's outer catch
then returns `err.message`, which is Prisma's own "Invalid `prisma.adoptionApplication.create()`
invocation … Unique constraint failed on the fields: (`id`)" text, to an anonymous applicant, and
no retry happens.

**Settles when:** an id collision is either impossible (a `cuid()` or random id) or retried, and
the outer catch never returns a raw database message; pinned by a test that makes the first insert
raise P2002 on `id`.
