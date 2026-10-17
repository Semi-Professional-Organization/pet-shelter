# The birth-date backfill rehearsal only agrees with the app east of UTC

**Status:** open · opened 2026-10-14 · from PS-114 · reported by the session that wrote the expand
migration, recorded here because `approximateBirthDate` is the thing being compared against

`prisma/migrations/manual/20260922_pets_birth_date/rehearse.mjs` checks the backfill SQL by
comparing it against a **hand transcription** of `approximateBirthDate` from
`src/lib/domain/petAge.ts`, and that transcription uses local-time date setters rather than the
UTC ones the real function uses. Neither harness pins a timezone.

So the comparison's answer depends on the machine's offset. Reported measurement: fixture
`pet-008` derives `2026-03-01` at UTC+8 and `2026-03-04` in `America/New_York`. The shelter's
contributors are in Asia/Kuala_Lumpur, so every rehearsal taken so far has been east of UTC and
has agreed.

**What makes this worth an entry rather than a comment:** the failure is loudest for someone who
has done nothing wrong. Re-take that measurement from any negative offset — a contributor in the
Americas, a CI runner on UTC with a shifted TZ, a cloud session — and the rehearsal reports
mismatches against a migration that is actually correct. The natural reading is "the backfill is
broken", and the natural response is to change the SQL, which would then be wrong for everyone
east of UTC.

## PR #42 did not close this, and made the copy drift twice

PR #42, merged as `187593c`, made the real `approximateBirthDate` timezone-invariant for
`YYYY-MM-DD` intakes: it parses them into calendar parts and builds dates with `Date.UTC`. Before
it, at `18c533e`, the function used `d.setFullYear(...)` / `d.setMonth(...)` at lines 161 and 169.
All four rollover values the rehearsal pins are preserved by that change, forward roll included,
and `tests/unit/petAge.test.ts` pins them from the TypeScript side.

(An earlier version of this paragraph cited `6d32df9` as the `master` commit. It is a *tree*
object — the output of `git merge-tree --write-tree`, misnamed as "master" in a message between
sessions and copied here. `git cat-file -t 6d32df9` prints `tree`. See
`tasks/lessons/2026-10-14-merge-tree-prints-a-tree-not-a-commit-so-never-quote-it-as-master.md`.)

It is tempting to conclude the timezone problem is therefore solved. It is not, because the
rehearsal does not call the function — `appRule` in `rehearse.mjs` (around line 675 on `master` at `d6dd030`) is a
hand-written copy, as its own comment says: "a transcription … a copy, and therefore capable of
drifting from it." After #42 that copy differs from the original in **two** ways:

1. **Offset.** The copy still uses `setFullYear`/`setMonth`, so it is still offset-dependent while
   the real function no longer is. Before #42 both read local time and agreed with each other; now
   they do not, so the gap this entry describes gets wider rather than closing.
2. **Vocabulary.** The copy matches `/(\d+)\s*y/` and `/(\d+)\s*m/` — the old unanchored patterns.
   The real function now reads weeks in both languages and refuses `minggu` as a month. So
   `3 minggu` is three months to the copy and three weeks to the function.

**And the guard that exists to catch exactly this cannot see it.** O1 pins `appRule` against
`src/data/pets.json`, whose `birthDate` values came from the real function — but all ten fixture
ages are plain English years and months (`"2 years"`, `"4 months"`, …) and **none** is a weeks or
Malay shape. So O1 passes while the transcription has silently diverged, and O2 then passes "for
the wrong reason" in precisely the way O1's comment warns about.

This is the same defect in miniature that
`tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`
is about — a transcription nothing checks against its original — except here the check exists and
is aimed at a fixture set too narrow to exercise it.

## 2026-10-14: the risk is now covered, but this entry is not settled

**What changed.** #42 merged, and with it `approximateBirthDate` computes through `Date.UTC`
rather than local setters. `pet-008` (`"5 months"`, intake 2026-08-01) now derives **2026-03-01 at
both UTC+8 and America/New_York** — measured, where it previously derived 2026-03-04 west of UTC.
So the *function* is timezone-invariant. The *copy* is not, which is the point above.

**A sound comparison now exists**, in `20260922_pets_birth_date_contract/rehearse.mjs` scenario 0.
It imports the real `approximateBirthDate` — no copy — runs the real expand SQL on pglite, and
asserts they agree on every spelling expand reads: all five year and seven month forms, the four
rollover cases its own rehearsal pins, a compound, and `pet-008`. It passes **77/77 in UTC,
Asia/Kuala_Lumpur, America/New_York and Pacific/Honolulu**. It was mutation-tested before being
trusted: making the "app" clamp the leap day instead of rolling it fails exactly one check, naming
`a-leap "1 year"@2024-02-29: sql=2023-03-01 app=2023-02-28`.

It also makes the containment relationship executable rather than prose: for each of `3 minggu`,
`3 weeks`, `3 wks`, `2 tahun`, `4 bulan`, `3 mnth` and `5 yo` it asserts that the app reads it and
that expand refuses it. If either side changes without the other, that is where it shows.

**So the timezone half of this entry's risk is covered, and the vocabulary half is covered for
single-unit strings.** A future change to `approximateBirthDate` on any spelling expand reads now
fails a check that cannot be fooled by a stale copy — once someone runs it, since it is a manual
`npx tsx` script and not part of `npm test` or CI.

**Mixed-language strings were a separate defect, found and fixed the same day.** `/code-review`
on the PR adding this check measured `1 tahun 6 months` stored as six months by the backfill while
the app reads one year, with no refusal. The backfill now refuses any age containing, anywhere in the
string, a unit the app reads and it does not, and any age containing a non-ASCII character. (A
word neither side reads is not refused by that check: `1 year 6 mons` is stored as one year. A
bare `6 mons` is still refused, as having no unit the backfill reads.) The same check
reproduces expand's J1 and J3 over its mixed and non-ASCII fixtures to show the
pre-check agrees with the file, verdict by verdict. Settled in
`tasks/decisions/2026-10-14-the-backfill-refuses-any-age-with-a-unit-it-does-not-read.md` and
`tasks/decisions/2026-10-15-the-backfill-refuses-any-non-ascii-age.md`. The count is printed by
the script; it is not restated here, because the last two restatements went stale within a day.

**Why this does not close the entry.** The condition below names *expand's* `rehearse.mjs`, and
that file still restates the function as `appRule`, still with local setters and the old unanchored
patterns. Its O1 and O2 still report green against a rule the app no longer uses. A reader who runs
that harness and sees 92 passing checks is being told something false about two of them. A guard
that reports green against the wrong rule is worse than no guard, because it is believed.

It was not fixed here because that harness needs `npm i --no-save embedded-postgres`, a large
binary install into a `node_modules` other worktrees share, and editing a harness you cannot run is
how a safe failure becomes an unsafe one — the same reasoning
`tasks/open/expand-refuses-compound-ages-written-in-short-units.md` gives for leaving its regex
alone. The smallest honest repair is probably to delete O1/O2 there and point at scenario 0 above,
rather than to fix the copy — a second copy kept correct is still a second copy.

(Since then the cost has fallen. #113 itself re-ran that harness in full on 2026-10-15, 92/92,
with `npm i --no-save embedded-postgres` installed into one worktree's *own* `node_modules`, as
`migration.sql` records around line 322. So the harness can be run without touching what other
worktrees share, and "a harness you cannot run" no longer holds. The repair above is still
undone.)

**Settles when:** `rehearse.mjs` imports `approximateBirthDate` instead of restating it. That is
now the only option that actually works: pinning `TZ=UTC` would fix the offset half and leave the
vocabulary half, since a copy with the old patterns disagrees with the function at any timezone.
Importing closes both at once and cannot drift again.

If importing is genuinely impractical — the harness runs standalone against embedded Postgres and
may not want a TypeScript import — then the fallback needs *both* halves: pin `TZ=UTC` with a
startup assertion so a mismatch fails loudly, **and** add a weeks row and a Malay row to whatever
fixture set O1 checks against, so the transcription guard can see a vocabulary drift at all. Check
`pet-008` at one positive and one negative offset either way.
