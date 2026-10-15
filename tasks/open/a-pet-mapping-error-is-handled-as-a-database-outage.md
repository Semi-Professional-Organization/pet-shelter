# A bug in mapping one pet row is handled as a database outage, and serves the demo animals

**Status:** open · opened 2026-10-15 · found by the review of PR #119

`getServerPetsAsync` and `findServerPetByIdAsync` in `src/lib/server/petRepository.ts` call
`mapDbPetToPet` inside the same `try` as the Prisma query. So an exception thrown while *mapping* a
row is caught as if the *query* had failed, and goes to `handlePersistenceError(…, "read")`. That
rethrows only under `STRICT_PERSISTENCE`, which no deployed environment sets. The function then
returns the in-memory store, which starts as the bundled demo pets.

**What that meant in practice.** Until PR #119, `approximateBirthDate` threw `RangeError` for a
legacy age so large its birth date left the `Date` range (`15000000 weeks`). On a pet row with no
`birthDate` and such an age, the whole public catalogue would have been silently replaced by the
demo animals, with nothing logged in production. Nothing crashed, so nobody would have seen an
error. PR #119 removes that particular throw. It does not remove the mechanism: the next exception
anywhere under `mapDbPetToPet` (`formatAgeString`, `computeAgeInMonths`, the history mappers) takes
the same path.

**Reasoned from the code, not provoked.** No mapping exception has been raised against a running
instance.

The distinction is the one `tasks/lessons/2026-09-03-a-fallback-that-fabricates-data-is-a-defect-not-resilience.md`
draws, and `an-outage-serves-and-bills-fixture-animals.md` covers the *real* outage case. This
entry is narrower. A mapping bug is not an outage, and a fallback designed for an unreachable
database should not be what answers a bad row.

The obvious change is to move the `.map(mapDbPetToPet)` out of the `try`, so that only the Prisma
call falls back. It is not a one-liner to choose, though. A mapping error would then reach the
page as an error, and whether one bad row should fail the whole catalogue, be skipped and logged,
or be shown degraded is a decision to make explicitly.

**Settles when:** a mapping exception no longer falls back to the demo pets, and a test throws from
the mapper in non-strict mode and asserts what the catalogue and the profile do instead.
