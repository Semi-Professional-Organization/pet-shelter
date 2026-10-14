# `approximateBirthDate` misreads several shapes of age, most of them since PR #42

**Status:** open · opened 2026-10-14 · rewritten 2026-10-14 · from reviews of PR #42, each case reproduced

Every result below comes from running the real function — `master` at `187593c`, and the pre-#42
version extracted from `18c533e` — with intake `2026-06-12`, under `TZ=UTC`. The backfill verdicts
come from the patterns in `prisma/migrations/manual/20260922_pets_birth_date/migration.sql`,
emulated with Postgres's `\M` taken as "next character is not alphanumeric or `_`".

**Where it reaches today.** Since #94 the pet form collects a birthday directly, so this function
runs only for a record with no `birthDate`: chiefly a pet saved to browser `localStorage` before
#94, on first render. That is narrow, and widens the moment the known `petStore.ts` mount-effect
defect is fixed. It also matters as a reference: at the time of writing, open PR #113 would have
the contract rehearsal import this function and compare the backfill against it, so if #113
merges, every wrong answer here becomes a wrong answer from that harness's oracle.

## Regressions PR #42 introduced

#42 added a trailing `\b` to each unit pattern, to stop `3 minggu` (Malay for three weeks) being
read as three months. That boundary cannot sit between a unit letter and a following digit or
letter, so shapes the earlier function read correctly now fail:

| age | before #42 | `master` | backfill |
|---|---|---|---|
| `2y3m` | 2024-06-12 (two years) | 2026-03-12 (three months) | refused, fractional |
| `5yrs8mths` | 2021-06-12 (five years) | 2025-10-12 (eight months) | refused, fractional |
| `1y6m` | 2025-06-12 (one year) | 2025-12-12 (six months) | refused, fractional |
| `1y2w` | 2025-06-12 (one year) | 2026-06-12 (intake) | refused, no unit |
| `6 mons`, `6 mon`, `6 mts` | 2025-12-12 (six months) | 2026-06-12 (intake) | refused, no unit |
| `2 yrsold` | 2024-06-12 (two years) | 2026-06-12 (intake) | refused, no unit |

`3 mgg`, the usual Malay short form of *minggu*, is different and not a regression: before #42 it
read as three **months** (2026-03-12), which was wrong, and on `master` it falls through to the
intake date, which is wrong more conservatively. It should read as three weeks, the way `3 minggu`
now does (2026-05-22) — the one case in this family that #42 fixed rather than broke. The backfill
refuses it.

**All of these are fixable in the app alone.** The backfill refuses every one — three as fractional
ages, the rest for having no unit it recognises — so changing what the app computes for them
changes nothing the migration stores. A refused row is not stored.

The fix is not a single token. Replacing each trailing `\b` with `(?![a-z])` restores the compact
compounds, but not `6 mons`, where the unit is followed by a letter; those need `mons?`, `mts?` and
`mgg` listed explicitly. The guard cannot simply be removed, because it is what keeps `3 minggu`
from reading as months.

## Also fixable in the app alone

- **Decimals and fractions read the digits beside the unit.** `0,5 tahun` — a six-month kitten —
  reads as `5 tahun`, five years; `0,75 tahun` reads as seventy-five; `1.5 bulan` as five months.
  These Malay cases are new in #42, which added the units: before it they fell through to intake.
  **The English cases are not new** — `0.5 years` reads as five years and `1.5 months` as five
  months both before #42 and on `master`. The backfill refuses all of them as fractional. The trap
  is already a lesson: `tasks/lessons/2026-09-22-a-regex-that-finds-a-number-beside-a-unit-does-not-find-the-number.md`.

- **An unbounded count crashes it.** `15000000 weeks` throws `RangeError: Invalid time value`;
  `12345678 wks` returns `-234583-03-21`. A cap mirroring the backfill's sixty years / 720 months
  (about 3,130 weeks) closes all three branches.

- **The return type can lie** — confirmed with `tsc`, since no runtime probe sees a type.
  `withDerivedAge({ …, birthDateIsEstimate: false })` with no `birthDate` is typed `false` but
  returns `true`; an explicitly `undefined` flag collapses the result to `never`. Fix:
  `Omit<T, 'birthDate' | 'birthDateIsEstimate' | 'age' | 'ageCategory'> & { … }`.

- **Three copies of the estimate rule disagree** on `birthDate: ''`, which satisfies `NOT NULL`:
  `withDerivedAge` and `buildPetPersistencePayload` return `true`, `mapDbPetToPet` returns `false`.
  Latent — no writer produces `''` today. The clean fix has `deriveBirthDate` return
  `{ birthDate, isEstimate }` and uses it at all three sites.

## Not yet checked

A *mixed* string — one recognised unit and one unlisted — might be read differently by the app and
the backfill once unlisted spellings are added app-side. Single spellings are refused by the
backfill, so they fail closed; mixes were not probed.

**Settles when:** these are fixed and pinned by tests — after open PR #113 lands or is withdrawn,
since it also edits `petAge.ts` — and the mixed-string question is answered by probe rather than by
reasoning about `\M`.

## Correction

The first version of this entry said compact compounds and unlisted spellings were *not* fixable in
the app alone, because the backfill's `\M` "fails the same way" so app and SQL "currently agree,
both wrong". That was accepted from another session after only the app half was checked, with the
SQL half reasoned rather than read. The backfill's fractional check runs first and aborts on
`2y3m`, so nothing is stored wrong. It also presented these as standing limits rather than as
regressions #42 introduced, and implied the decimal defect was new and Malay-only.
