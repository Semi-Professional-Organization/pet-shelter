# The pet birth-date conversion splits into expand and contract

**Decided:** 2026-09-22 · supersedes
`tasks/decisions/2026-09-22-pet-birth-date-backfill-derives-from-intake-and-age.md`

That entry describes a single file that added `birthDate`, backfilled it, and dropped
`pets.age` / `pets.ageCategory` in one transaction. It was rehearsed and green, and it is not what
ships. The design it records was removed before merge, and this entry says why. Read it for the
rejected alternatives — `db push`'s own statement, interval arithmetic, the `'2024-01-01'` default
— which all still stand. What changed is the shape.

## What was decided

`pets.age` → `birthDate` runs as **expand → soak → contract**, across two files owned by two
sessions:

1. **Expand**, `prisma/migrations/manual/20260922_pets_birth_date/` — written by the session on
   `fix/pets-birth-date-production-migration`. Adds both columns, backfills every row, relaxes the
   two old columns to nullable. Destroys nothing.
2. **Soak** — a human reads the derived birthdays against the age prose, in production, while both
   still exist.
3. **Contract**, `prisma/migrations/manual/20260922_pets_birth_date_contract/` — this branch.
   Archives the four columns, then drops the two old ones.

**The case for the split is that the two halves have different urgency.** Expand is what stops the
outage: production has no `birthDate`, the deployed client selects it on every catalogue read, so
every read raises 42703 and the live site serves `src/data/pets.json`. Expand fixes that and is
reversible with no data loss. Dropping the columns fixes nothing further — it removes the drift and
the last copy of the operator's age prose. There is no reason for those to happen in the same
minute, and one good reason not to: the soak window is the only chance anyone gets to compare a
derived birthday against the prose that produced it, with both in front of them, on real data.

## The contract half no longer derives anything, and that is the substantive change

The superseded design had this branch carrying its own backfill. That meant two files in this repo
each owned a rule for turning "2 years" into a date — and **measured, not assumed, they
disagreed**. Run over the same five rows, against expand as it stood at `77510c5`:

| age | intakeDate | expand (then) | this branch's old rule | `approximateBirthDate` |
|---|---|---|---|---|
| 1 year | 2024-02-29 | 2023-02-28 | 2023-03-01 | 2023-03-01 |
| 1 month | 2026-03-31 | 2026-02-28 | 2026-03-03 | 2026-03-03 |
| 1 month | 2026-05-31 | 2026-04-30 | 2026-05-01 | 2026-05-01 |
| 18 months | 2026-06-12 | 2024-12-12 | 2024-12-12 | 2024-12-12 |
| 2 years | 2026-06-12 | 2024-06-12 | 2024-06-12 | 2024-06-12 |

Three of five. Expand used `make_interval`, which clamps a subtraction that would leave the month;
the old rule here built `make_date(y, m, 1) + (day - 1)`, reproducing JavaScript's forward roll.

The disagreement has since been resolved in roll-forward's favour (below), but **that is not why
the backfill was removed.** Two rules for one conversion is the defect `AGENTS.md` names under
"Boundaries and duplication", and two rules that happen to agree today are still two rules. The
split is the fix; the agreement is a separate good outcome. **Expand owns the arithmetic. This half
owns the archive and the drop.**

## The arithmetic is roll-forward, agreed by both sessions, and the table above is now history

The position first taken here was that roll-forward should win because it can be asserted against
`approximateBirthDate` — imported and executed — whereas clamping can only be checked against
constants typed by whoever wrote the SQL. That was put to the other session. It was then
*withdrawn* here, on the grounds that the merits are thin (one to three days on a value explicitly
flagged a guess) and that the testability argument was an artefact of the contract re-deriving,
which it no longer does.

The other session did not accept the withdrawal. They took the original argument, said it decides
it, and changed expand to roll-forward — `b40a7d7`, "Store only what the app itself would compute".
Re-measured against that commit, the same five rows:

| age | intakeDate | expand | `approximateBirthDate` |
|---|---|---|---|
| 1 year | 2024-02-29 | 2023-03-01 | 2023-03-01 |
| 1 month | 2026-03-31 | 2026-03-03 | 2026-03-03 |
| 1 month | 2026-05-31 | 2026-05-01 | 2026-05-01 |
| 18 months | 2026-06-12 | 2024-12-12 | 2024-12-12 |
| 2 years | 2026-06-12 | 2024-06-12 | 2024-06-12 |

Zero differ. **The divergence that motivated half this entry no longer exists.** The split stands
on its own merits — the soak window, and one rule in one file — not on the two halves disagreeing.

Their reasoning is worth keeping because it is better than the version argued here: *refusing more
is safe, storing differently is not*. A row expand refuses is never backfilled, so the contract
never sees it and nothing downstream can disagree about it. That principle is also why expand now
refuses Malay age tokens (`thn`, `tahun`, `bln`, `bulan`) outright rather than reading them, having
previously accepted them — `approximateBirthDate` does not, so a Malay-backfilled row would have
been one the app could never reproduce.

**A third implementation nearly broke this.** The session on PR #42 was, at the same time, about to
change `approximateBirthDate` itself to clamp (`Math.min(day, lastDayOfMonth)`), which would have
made the newly-agreed expand diverge again in the opposite direction. Asked to drop it, on the
grounds that two of three implementations now agree and expand is the one no session is left
holding. Three copies of one subtraction, none of them agreeing, is what this looked like for
about an hour.

## How the contract knows expand ran, without re-deriving anything

A structural signal, confirmed by probe rather than by reading:

- Expand ends with `ALTER COLUMN "age" DROP NOT NULL`, so afterwards `pets.age` is **nullable**.
- A hand-patched `ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01'` — the obvious
  emergency move to stop the read storm, and `db push`'s statement minus the drops — leaves `age`
  exactly as it was: **NOT NULL**.

So `birthDate` present and `age` nullable means expand ran; `birthDate` present and `age` still
`NOT NULL` means someone patched the column in and those dates are placeholders. The contract
proceeds on the first and refuses on the second with a remediation hint.

This replaces a guard added during the first review round, which refused whenever `birthDate` was
already populated. That guard was correct for the hand-patch case and **broke the composition** —
probed: it rejected expand's own output with `5 pets row(s) already have a birthDate while "age" is
still present`. The sequence could not have run. A fix for one review finding silently disabled the
design; it was caught only by executing both files back to back.

## Reversibility

`DROP COLUMN` is one-way and `birthDate` cannot reconstruct free-text "2 years" or a hand-picked
band, so the contract copies `age`, `ageCategory`, `birthDate` and `birthDateIsEstimate` to
`pets_age_archive_20260922` before dropping. `rollback.sql` restores verbatim and aborts once
`cleanup.sql` has dropped the archive.

The contract's rollback **does not remove `birthDate`** — that would put the site back on fixtures,
and undoing expand is expand's rollback's job. Each file undoes its own half. It also no longer
reconstructs prose for animals created after the contract ran; they come back with `age` NULL,
which the restored nullable column permits. The superseded design synthesised prose for those rows
from the birth date, which meant a fourth copy of the age-band thresholds in SQL.

**Cost, stated rather than hidden:** until `cleanup.sql` runs, `db:check-drift` reports one
destructive statement, `DROP TABLE "pets_age_archive_20260922"`. That is the price of a rollback
that can restore the original prose.

## Verification

`rehearse.mjs` beside the contract: **37 checks, 0 failures** — every refusal state (no
`birthDate`, hand-patched `age`, a NULL `birthDate`) leaving the table untouched, the archive
holding all four values verbatim including a birthday marked *known* rather than estimated, re-run
a no-op, rollback restoring nullable columns without touching `birthDate`, an animal created after
the contract coming back with NULL prose rather than an invented one, and cleanup making rollback
refuse.

Separately, the **real sequence** was run end to end against expand as it stands on
`fix/pets-birth-date-production-migration` at `b40a7d7`: expand applies, leaves `age` nullable, the
contract applies on top, the archive holds five rows with **zero** birth dates differing from
expand's, and the contract's rollback restores all five ages while `birthDate` survives. The same
run confirms zero of the five differ from `approximateBirthDate` since `b40a7d7`.

One defect in the application half was found by the PR #42 session reading this branch's
description rather than its code, and is worth recording because a peer review caught what two
`/code-review` rounds did not: `birthDateIsEstimate` was `.optional().default(true)`, so the key
was present on every parse and `updatePet`'s `{ ...existing, ...validated }` overwrote a stored
`false` with `true`. A birthday someone actually knew was silently demoted to a guess by an update
that merely did not mention it. Probed before believing it, fixed by dropping the default, and
pinned by a test asserting the key is *absent* from the parse output — which is the mechanism, not
the symptom.

## What was deliberately not done, as of 2026-09-22

- **Expand was not modified from here.** Both changes in it — roll-forward, and refusing Malay
  tokens rather than reading them — were made by that session after the two points were raised
  with them directly. Their branch ended at `5ca7492` — `b40a7d7` plus two documentation commits,
  one of which records the clamp risk from the app side; that session has ended.
- **`approximateBirthDate`'s "minggu" bug was not fixed.** `/(\d+)\s*m/` prefix-matches the Malay
  for *weeks*, so the function reads "3 minggu" as three months. Expand refuses such rows, so no
  production row can carry one. Filed as
  `tasks/open/approximate-birth-date-reads-minggu-as-months.md` rather than fixed here: that regex
  is now the referent three separate implementations have agreed on, and moving it belongs in a
  deliberate change, not a ride-along on a migration branch.
## 2026-10-13: the two halves ship together after all

The original intent was to leave expand on its own branch with its own rehearsal, which is what
that session preferred. Three weeks later that turned out not to be possible: **expand had no pull
request and its session had ended**, so it could never land on its own. Merging the contract alone
would have put a migration on `master` whose refusal hint points at
`prisma/migrations/manual/20260922_pets_birth_date/migration.sql` — a path that would not exist —
and left the drift entry's step 1 naming a missing file.

So `fix/pets-birth-date-production-migration` (tip `5ca7492`, nine commits) is merged into this
branch and both halves land on PR #94 together. Their commits and authorship are preserved through
the merge; nothing of theirs was rewritten or re-authored. Their two decision entries
(`2026-09-22-pets-birth-date-backfills-from-intake-date.md`,
`2026-09-22-expand-stores-only-what-the-app-computes.md`) and their eight lessons come with it.

**One real benefit.** With both folders in the same tree, the contract's `rehearse.mjs` scenario 0
stops being a fallback shape and runs the actual sequence: the real expand, then the contract on
top. That immediately caught something — a fixture row with `age = 'about two'`, which expand
**refuses** rather than guessing at. The harness was feeding expand a row it will never accept. Now
asserted in both directions: expand refuses unreadable prose and leaves the table untouched, so the
contract can never be handed such a row. That is their "refusing more is safe, storing differently
is not" principle, executable instead of quoted.

**Expand's own `rollback.sql` is now exercised too**, which it was not from this side before. Its
harness needs `embedded-postgres`, a large optional download, so it was run on pglite instead:
expand → rollback removes both new columns, re-tightens `age` to NOT NULL, and keeps every age
string. A courtesy check of a neighbour's file, not a replacement for its own 92-check harness,
which was not re-run here.

Contract rehearsal: **49 checks, 0 failures**, with scenario 0 live.

## What was deliberately not done, as of 2026-10-13

- **Expand's 92-check harness was not re-run.** It requires `npm i --no-save embedded-postgres`,
  a large binary install into a `node_modules` shared with other sessions' worktrees. Expand's
  behaviour was instead verified independently here, on pglite, against the real file.
- **Nothing was applied.** Agents are denied production access and `npx prisma migrate*`.
