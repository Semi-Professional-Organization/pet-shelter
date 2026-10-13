# `to_date` raises on an impossible date, so a round-trip check built on it never runs

**Learned:** 2026-09-22

Validating `pets."intakeDate"` — a `text` column — before the birth-date backfill, I wrote the
idiom that reads as obviously safe:

```sql
CASE WHEN to_char(to_date(intake_txt,'YYYY-MM-DD'),'YYYY-MM-DD') = intake_txt
     THEN to_date(intake_txt,'YYYY-MM-DD') END
```

The reasoning was that `to_date` is lenient: `'2024-02-31'` rolls forward to `2024-03-02`, the
round-trip comparison then fails, and the row is refused by name. A regex had already bounded the
month to `01-12` and the day to `01-31`, so nothing could be out of range.

On PostgreSQL 18.4 the rehearsal's `2024-02-31` row aborted the migration with

    date/time field value out of range: "2024-02-31"

`to_date` raised instead of rolling. The transaction still rolled back and the table was still
untouched, so the file was safe — but the message named no row, and the whole point of that check
was to hand the operator the id of the animal to go and fix. A production runbook that aborts
without saying *which* row is a runbook that cannot be acted on.

The fix avoids the lenient-parse idiom entirely: bound the year, month and day with a regex, then
check the day against the length of its own month with arithmetic that cannot raise —
`make_date(y, m, 1) + interval '1 month' - interval '1 day'` — and only then build the date with
`make_date`. Every expression yields NULL for a bad row, and the row is named by the check that
follows.

**Rule:** never let a *validation* depend on a parser being lenient. If a value must be rejected
by name, reject it with predicates that cannot themselves raise — regex bounds and arithmetic on
already-validated parts — and reserve the parse for values that have already passed. Leniency is
a version-dependent behaviour; being told the row id is the requirement.
