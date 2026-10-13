# A rollback file for a DROP COLUMN is fiction unless something kept the values

**Learned:** 2026-09-22

The brief asked for "a reversible manual migration with both `migration.sql` and `rollback.sql`",
which reads as a formatting requirement and is not one. The forward migration drops
`pets.age` (free text an operator typed) and `pets.ageCategory` (a band they picked). The new
`birthDate` cannot reconstruct either: prose like `"about 2 years"` is not recoverable from a
date, and a band chosen by a human may disagree with the one the thresholds compute. A
`rollback.sql` that re-adds the columns and derives plausible values is not a rollback; it is a
second migration wearing the name of one, and it would be discovered to be that only by someone
already having a bad day.

What made it genuinely reversible was copying both columns into a side table *inside the same
transaction*, before the drop — along with what each row derived and whether its prose parsed, so
the conversion can be audited later with plain SQL rather than trusted. `rollback.sql` restores
from it verbatim and **aborts** when the table is gone rather than inventing values, which makes
"this is now irreversible" an explicit, separate, human step (`cleanup.sql`) instead of a
side effect nobody noticed.

The archive costs something honest: `prisma/schema.prisma` does not declare that table, so
`db:check-drift` reports one extra destructive statement until cleanup runs. Saying so in the
file's header is better than a rollback that cannot roll back.

The same reasoning makes the round trip work in the other direction. Rows created *after* the
conversion have no archive entry, so `rollback.sql` writes one for them, keeping their real
`birthDate`. Re-applying the forward migration then restores those dates exactly rather than
re-deriving them from prose it had just synthesised.

**Rule:** before writing `rollback.sql` for a migration that drops or narrows a column, name the
values it destroys and say where the undo reads them from. If the answer is "it recomputes them",
the migration is one-way — either add an archive step or write that down in the header, but do not
ship a file whose name claims otherwise.
