# A refused database write logs the row it refused

**Status:** ASSERTED · opened 2026-11-11 · found by review while fixing #201, reasoned from the code

`handlePersistenceError` in `src/lib/persistenceMode.ts` logs `err.message` for a write it does
not rethrow (any error but a unique violation, outside strict persistence). A Prisma validation
error's message renders the whole `data` argument, so a refused adoption-application insert in
production would print the applicant's NRIC, phone and address to the host log. The same holds
for every repository write that delegates to it. #201 kept its own new log line to the error's
name, code, model and constraint columns, but this shared path is unchanged.

**Settles when:** `handlePersistenceError` logs a Prisma error without its message (or with the
`data` argument removed), pinned by a test that refuses an insert whose message carries an NRIC.
