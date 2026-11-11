# Looking up an application by its id finds nothing when a database is configured

**Status:** ASSERTED · opened 2026-11-11 · found by review while fixing #201, reasoned from the code

The tracking lookup still accepts a bare application id, but `normalizeReferenceCode` upper-cases
the input and the database match on `id` is case-sensitive. Application ids are lower case
(`app-<uuid>` since #201, `app-<timestamp>` before), so the lookup misses whenever a database
answers, while the no-database mirror path lowercases and finds it. The emailed tracking link
built from `getTrackingUrl(app.id, …)` is the likely victim.

**Settles when:** a lookup by an application's own id finds it against the database, pinned by a
test that looks one up by its lower-case id.
