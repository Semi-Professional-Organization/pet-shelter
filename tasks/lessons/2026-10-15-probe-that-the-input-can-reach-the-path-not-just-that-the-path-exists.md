# Probe that the input can reach the path, not just that the path exists

**Learned:** 2026-10-15

A review of PR #119 said `approximateBirthDate`'s old `RangeError` was caught by the pet
repository as a database outage, which silently swapped the catalogue for the demo pets. The check
made before accepting it was the shape: `mapDbPetToPet` does run inside the same `try` as the
Prisma query, so a throw from it would go there. The comments, the decision, the stream, and a
new open entry (which mirrors to a public GitHub issue) were all rewritten to say so.

The next review showed that no input could take that path. The `pets` table has no `age`
column, so a database row always carries a `birthDate` and the mapper never parses an age. The
throw could only happen for a browser's `localStorage` copy, inside `usePetStore`'s own `try`.
The entry was deleted before it reached master.

**Rule:** a claim of the form "this throw lands in that handler" needs two probes, not one: that
the handler wraps the call, and that some real input reaches the throw through it. Trace the
input back to its source (the schema, the form, storage) before writing the consequence down,
and before anything public describes it as an incident path.
