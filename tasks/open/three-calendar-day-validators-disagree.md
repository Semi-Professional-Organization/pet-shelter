# Three calendar-day validators answer the same question differently

**Status:** open · opened 2026-10-14 · read from the code; the pet copy's behaviour is reasoned, not run

`src/` has had three implementations of "is this `YYYY-MM-DD` a day that exists":

| Where | Year 0000-0099 | 31 February |
|---|---|---|
| `isIsoDate`, `src/lib/domain/transparency.ts:193` | accepted (`setUTCFullYear` guard) | refused |
| `isoDateSchema`, `src/lib/validations/pet.ts:128` | **refused** — `Date.UTC(y, …)` with no guard maps years below 100 into 1900+, so the round-trip fails | refused |
| the bulletin form (until 2026-10-14) | accepted, after its own fix | refused |

The bulletin copy is gone: `src/lib/validations/bulletin.ts` now calls `isIsoDate` and adds only
the one rule it lacks for its own column (Postgres has no year zero). That leaves two, and they
disagree. The pet schema rejects a syntactically valid date with "Date is not a real calendar
day", which is untrue.

**Severity is low.** No `<input type="date">` produces a year below 100, so no editor reaches it.
The reason to record it anyway is the one in AGENTS.md, "Boundaries and duplication": once two
copies of shared knowledge have diverged, the divergence is the defect, and the next fix lands in
one copy only. This one already had — the bulletin copy was corrected and tested while the pet
copy was not.

Not fixed in the bulletins change because `src/lib/validations/pet.ts` was under active work by
other branches at the time (the birth-date migration and its follow-ups touched its dates twice in
one day), and a correction there belongs with that work.

**Settles when:** `src/lib/validations/pet.ts` validates dates through `isIsoDate` (or both move
to one neutral module), and a test pins a year below 100 as accepted.
