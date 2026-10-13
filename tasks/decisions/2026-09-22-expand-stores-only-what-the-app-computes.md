# The expand migration stores only what the app itself would compute, so contract can verify it

**Decided:** 2026-09-22

Supersedes choices **4** (month-end clamping) and **6** (Malay tokens, in its accepting half) of
`tasks/decisions/2026-09-22-pets-birth-date-backfills-from-intake-date.md`. That entry's reasoning
is left intact; this one records why two of its answers were reversed a few hours later.

## What changed

`prisma/migrations/manual/20260922_pets_birth_date/migration.sql` now keeps one invariant:

> For every row it writes, the stored `birthDate` is exactly what
> `src/lib/domain/petAge.ts approximateBirthDate(age, intakeDate)` computes.

Two things had to move for that to be true.

- **The date rolls forward instead of clamping.** `2026-03-31` minus one month is `2026-03-03`,
  and `2024-02-29` minus one year is `2023-03-01` — the day of month is kept and the overflow
  spills into the next month, which is what `Date.UTC(year - n, month, day)` does. The SQL builds
  it as `make_date(target month, 1) + (day - 1)`.
- **Malay age words are refused rather than translated.** `approximateBirthDate` matches only
  `/(\d+)\s*y/` and `/(\d+)\s*m/`, so `"2 tahun"` matches nothing there and it returns the intake
  date. Reading it as two years is *more correct* — and was this file's behaviour — but it stores
  a value the app does not compute. The header now carries the normalisation `UPDATE` for the
  owner to run knowingly, and the pre-check names every Malay row first.

Refusing more is safe; storing differently is not. A row this file refuses is never backfilled,
so nothing downstream can disagree about it. That asymmetry is why the word-boundary anchoring
from choice 6 stays — `"3 minggu"` is still refused here even though the app reads it as three
months, because refusing is a difference contract never sees.

## Why, given that neither date is more correct

Every row here is flagged `birthDateIsEstimate = true` and the two rules differ by a day or three.
The old entry defended clamping on the merits — "a date inside the intended month beats one in
the next" — and that argument is not wrong. It is just not the argument that decides it.

**Roll-forward can be checked by something that can fail.** The contract migration re-derives
every row with the app's own function and compares before dropping `age`, so a wrong date stops
the drop. A clamped date could only ever be compared against constants typed by the same person
who wrote the SQL. The rehearsal now carries that check directly: **O2** asserts every stored date
equals the app rule across twelve shapes including both rollover cases, and **O1** pins the
transcribed rule against `src/data/pets.json`, so a drifted transcription fails before O2 can pass
for the wrong reason.

That reasoning came from the session holding the contract half (PR #94,
`worktree-pet-birth-date-migration`), which proposed it and asked to be pushed back on. It was
right and this branch moved. The composition trap it did not have — that a Malay-worded row would
make its re-derivation mismatch — came back the other way.

## The sequence this belongs to

**Expand → soak → contract**, and the two halves are separate files by different sessions:

1. **Expand** (this branch): add the columns, backfill, relax the old NOT NULLs. Nothing dropped.
   Stops the read outage on its own.
2. **Soak**: the derived dates and the `age` prose exist side by side, so a human can compare them
   on real rows before anything is destroyed.
3. **Contract** (PR #94): archive `age`, `ageCategory` *and* `birthDateIsEstimate`, verify by
   re-derivation, then drop.

The archive carrying `birthDateIsEstimate` matters: without it a rollback and re-apply silently
demotes a known birthday to an estimate. That is the other session's finding, recorded here
because the two files are only correct together.

## Verified against the contract half

PR #94 ran this branch's tip (`b40a7d7`) through its contract on pglite: five rows including both
rollover cases, **zero differing from `approximateBirthDate`**, and the full expand → contract →
rollback sequence completing with every `age` string restored. The two halves compose.

## The rationale weakened after the decision, and the decision stands anyway

Honesty about the load-bearing part: PR #94 has since removed its re-derivation entirely. It now
detects that expand ran from a structural signal — expand ends with `DROP NOT NULL` on `age`,
which a hand-patched `ADD COLUMN birthDate ... DEFAULT '2024-01-01'` does not — so no arithmetic
comparison is left for a Malay-backfilled row to fail. The reason this entry gives for refusing
Malay is therefore no longer the reason it matters to *them*.

It is kept on narrower ground: the invariant is an executable property (O2) rather than a claim,
it holds for anything that re-derives later — a report, a test, the next migration — and it keeps
the stored data and the app's own arithmetic from disagreeing about the same animal. The cost is
one normalisation `UPDATE`, printed in the header, on rows the pre-check names first. That is a
worse trade than it looked when the decision was made, and still the right one.

## What would reverse this

- **PR #42 widening `approximateBirthDate` to read `tahun`/`thn`/`bulan`/`bln`.** Once that is on
  master this file may widen with it — the invariant is "match the app", not "be English".
- **PR #42 changing the app to clamp.** Reported by PR #94 on 2026-09-22: that session was about
  to replace the rollover with `Math.min(day, lastDayOfMonth)`, which would make this file diverge
  again in the opposite direction from the one it just moved away from. PR #94 has asked them not
  to, on the grounds that two of three implementations now agree on roll-forward. **If it lands
  anyway, this file's `make_date(target month, 1) + (day - 1)` is what has to change**, and O2
  will fail loudly rather than silently — which is the whole point of having written it down as a
  check. Watch `src/lib/domain/petAge.ts` on `feat/pet-form-birth-date`.

Either way the app moves first. An expand that stores what the app does not compute is the failure
this entry exists to prevent, in whichever direction the disagreement arrives.
