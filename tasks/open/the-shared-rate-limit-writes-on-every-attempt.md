# The shared rate limit writes to Postgres on every attempt, refused or not

**Status:** open · opened 2026-11-05

Found in review of #213. `checkSharedRateLimit` spends each registration budget with one upsert,
including attempts the budget is already refusing, so a flood of registration attempts becomes a
flood of writes to the database the whole site shares. Each waiting upsert holds one of the
instance's ten pool connections, and the upsert has no statement timeout, so a database that
stalls rather than errors holds the request open instead of refusing it at once. About one call in
fifty also schedules a sweep of expired rows, so sweeps grow with the flood too.

At this shelter's normal volume none of this is measurable. It matters only under a deliberate
flood. A per-instance cache of refusals was tried in review and removed, because it could refuse
after the row would admit.

Options: a read-before-write when the row is already at its cap, a `SET LOCAL statement_timeout`
around the upsert, a single-flight guard on the sweep, or both budgets in one statement.

**Settles when:** the refused path stops writing and the upsert has a timeout, or a decision entry
records that the flood cost is acceptable.
