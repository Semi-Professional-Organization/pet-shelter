# The public application status lookup returns raw error text

**Status:** ASSERTED · opened 2026-11-11 · found while fixing #201, reasoned from the code

`lookupApplicationStatusAction` in `src/actions/applications.ts` is called by anonymous visitors
on `/applications/track`, and its outer catch returns `err.message`. The leak that reaches the
public in production is a validation failure: a too-short reference code gets Zod's serialised
JSON array of issues instead of the issue's own message. Any other unexpected throw in that try
would also print its raw text; a failed database read does not today, because outside strict
persistence the read falls back to the mirror. `submitApplication` had the same shape and was
fixed for #201; this one was left out because that issue's scope named only the submit path.

**Settles when:** the lookup's catch returns a Zod issue's own message for invalid input and a
fixed message otherwise, pinned by a test that posts a short reference code.
