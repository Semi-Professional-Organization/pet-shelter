# A pet edit writes `deletedAt` back through `Date.toString()`

**Status:** ASSERTED · opened 2026-11-11 · found by the round-3 `/code-review xhigh` of the
#210/#211 fix, reasoned from the code

`mapDbPetToPet` (`src/lib/server/petMappers.ts`) maps `deletedAt` with `p.deletedAt.toString()`,
which drops milliseconds. A full edit of an archived animal writes the column back
(`buildPetPersistencePayload` parses it with `new Date(…)`), so each edit truncates the archive
timestamp to the second. The admin form already sent the read value back before #210/#211
(`PetFormDialog` passes `editingPet.deletedAt`); the server's baseline now being the database copy
does not change that. The mirror and the client store use `toISOString()`, so the two shapes
disagree.

Not fixed in #210/#211: switching the mapper to `toISOString()` is one line but changes the
format every read returns, and not writing `deletedAt` on a full edit changes what an edit that
does submit it means. Both are behaviour changes outside that brief.

**Settles when:** the mapper returns `toISOString()` (with the readers checked), or a full edit
stops writing `deletedAt` unless the archive state changes, with a test that an edit leaves a
stored millisecond timestamp unchanged.
