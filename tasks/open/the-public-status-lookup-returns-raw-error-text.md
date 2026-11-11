# The public application status lookup returns raw error text

**Status:** ASSERTED · opened 2026-11-11 · found while fixing #201, reasoned from the code

`lookupApplicationStatusAction` in `src/actions/applications.ts` is called by anonymous visitors
on `/applications/track`, and its outer catch returns `err.message`. Under strict persistence
`findServerApplicationByReferenceAsync` rethrows a failed query as Prisma's own error, so a
database fault can show its invocation text to the public, and a validation failure shows Zod's
JSON array of issues. `submitApplication` had the same shape and was fixed for #201; this one was
left out because that issue's scope named only the submit path.

**Settles when:** the lookup's catch logs the cause and returns a fixed public message (and a
Zod issue's own message for invalid input), pinned by a test that makes the read throw.
