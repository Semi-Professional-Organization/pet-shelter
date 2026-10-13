# Adding the column the schema wants restores the read and leaves the write still failing

**Learned:** 2026-09-22

The brief called the remaining drift "`pets.age` → `birthDate`", which reads as a rename: add the
new columns, backfill from the old, done. Production's `pets` lacks `birthDate`, master's client
selects it on every read, so adding it fixes the catalogue.

It does fix the catalogue. It does not fix pet creation. `age` and `ageCategory` were declared
`String` in the schema production was built from — NOT NULL, no default — and the current release
writes neither: `PetPersistencePayload` (`src/lib/server/petMappers.ts:117-149`) has no such
fields. So after the add, every `prisma.pet.create` still fails, now on a not-null violation
instead of a missing column.

It is worth seeing what that failure looks like. Prisma reports it as

    Null constraint violation on the (not available)

naming no column at all — so the half-migrated state fails in a way nobody could diagnose from a
production log, and it would look like a *new* bug introduced by the migration rather than the
half of it that was never written.

The migration now issues `DROP NOT NULL` on both, and the rehearsal pins the reason: it re-applies
the NOT NULL and asserts the same client still refuses the same create. Without that check the two
statements would be unexplained tidying that a later reviewer could reasonably delete.

**Rule:** when a schema change replaces a column, the direction that breaks is not only the one
whose column is missing. List what the *running release* writes to that table and what the
database still demands of it, and treat every superseded NOT NULL without a default as part of the
migration. Then write a check that fails if the relaxation is removed — otherwise the statement
carries no evidence that it is load-bearing, and its own file cannot tell a reviewer why it is
there. The expand half of expand/contract is "make the old columns optional", not just "add the
new ones".
