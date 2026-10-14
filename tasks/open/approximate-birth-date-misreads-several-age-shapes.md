# `approximateBirthDate` misreads several shapes of age, two of them badly

**Status:** open · opened 2026-10-14 · from a `/code-review max` of PR #42, each case reproduced

Every result below is the real function on `master` at `187593c`, called with intake `2026-06-12`.

**Where it reaches today.** Since #94 the pet form collects a birthday directly, so
`approximateBirthDate` runs only for a record that has no `birthDate`: chiefly a pet saved to
browser `localStorage` before #94, on first render. That is narrow. But this function is also the
*reference* the birth-date backfill is checked against — PR #113 makes the contract rehearsal
import it — so every wrong answer here is a wrong answer from the oracle, and the narrow reach
widens the moment the known `petStore.ts` mount-effect defect is fixed.

## Fixable in the app alone

These change nothing the backfill stores, because the SQL already refuses each shape.

- **Decimals and fractions read the wrong digits.** The pattern captures the digit run *beside*
  the unit, so `0,5 tahun` — a six-month kitten — reads as `5 tahun`:

      0,5 tahun   -> 2021-06-12   five years old
      0,75 tahun  -> 1951-06-12   seventy-five years old
      1/2 tahun   -> 2024-06-12   two years
      1.5 bulan   -> 2026-01-12   five months

  Before #42 added Malay units these fell through to the intake date, which is wrong but
  conservative. The trap is already a lesson:
  `tasks/lessons/2026-09-22-a-regex-that-finds-a-number-beside-a-unit-does-not-find-the-number.md`.

- **An unbounded count crashes it.** `15000000 weeks` **throws** `RangeError: Invalid time value`;
  `12345678 wks` returns `-234583-03-21`. Years and months had the same exposure before #42; the
  weeks branch extends it to a unit that used to fall through safely. A cap mirroring the SQL's
  sixty years / 720 months (about 3,130 weeks) closes all three branches.

- **The return type can lie.** `withDerivedAge` types `birthDateIsEstimate` as whatever came in,
  so a literal `false` survives inference while the runtime returns `true`, and a `T` whose flag is
  typed `undefined` reduces the whole result to `never`. No production caller is affected. Fix:
  `Omit<T, 'birthDate' | 'birthDateIsEstimate' | 'age' | 'ageCategory'> & { … }`.

- **Three copies of the estimate rule disagree** on a `birthDate` of `''`, which satisfies
  `NOT NULL`: `mapDbPetToPet` keeps a stored `false`, while `withDerivedAge` and
  `buildPetPersistencePayload` force `true`. Latent — no writer produces `''` today. The clean fix
  has `deriveBirthDate` return `{ birthDate, isEstimate }` (the value `approximateBirthDate`
  already computes and discards) and uses it at all three sites.

## Not fixable in the app alone

Each of these would *open* a silent divergence from the backfill if only the app were changed, so
they need a change that touches the SQL in the same step.

- **Compact compounds read the smaller unit.** A trailing `\b` cannot sit between a unit letter
  and a following digit, so the larger unit is skipped:

      2y3m       -> 2026-03-12   three months, not two years
      5yrs8mths  -> 2025-10-12   eight months, not five years
      1y6m       -> 2025-12-12   six months
      1y2w       -> 2026-06-12   falls through to intake

  The probed app fix is replacing each trailing `\b` with `(?![a-z])`. But the backfill's `\M`
  fails the same way — Postgres counts the digit as a word character — so app and SQL currently
  *agree*, both wrong. Fixing the app alone makes them disagree.

- **Unlisted spellings fall silently through to intake.** `6 mons`, `6 mon`, `6 mts`, `2 yrsold`
  and `3 mgg` — the last being the usual Malay short form of *minggu* — all return `2026-06-12`.
  Adding them to the app means the backfill must refuse each, or mixed strings reopen the
  divergence `tasks/decisions/2026-10-14-the-backfill-refuses-any-age-with-a-unit-it-does-not-read.md`
  closes (pending PR #113).

**Settles when:** the first group is fixed, and pinned by tests, after PR #113 merges — it also
edits `petAge.ts`. The second group is fixed together with the backfill SQL, with the harness's
corpus extended to cover each shape, or explicitly refused on both sides.
