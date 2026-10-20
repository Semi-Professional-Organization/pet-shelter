# `SELECT … INTO` with no row leaves NULL, and `IS NOT TRUE` reads that as false

**Learned:** 2026-10-13

`rollback.sql` decided whether it had created `pets."birthDate"` like this:

    SELECT coalesce(col_description(…), '') = 'added by …' INTO mine
      FROM pg_attribute a WHERE … AND a.attname = 'birthDate';
    IF mine IS NOT TRUE THEN
      RAISE NOTICE '"birthDate" left in place: it carries no marker …';

`IS NOT TRUE` was chosen to be safe against NULL. It made the bug. When the column does not
exist the query returns no row, PL/pgSQL sets `mine` to NULL, and the branch written for "a
column somebody else made" ran for "no column at all". A second run of the rollback told the
owner a column had been left in place on a table that did not have one.

The `coalesce` inside the query did not help: it guards a NULL comment on a row that exists, and
there was no row.

**Rule:** in PL/pgSQL, a `SELECT … INTO` that can match zero rows has three outcomes, and a
boolean has two. Read `FOUND` straight after it and branch on absence first. Treat `IS NOT TRUE`
and `IS DISTINCT FROM` on such a variable as a sign that two of the three outcomes have been
merged, and name which two.
