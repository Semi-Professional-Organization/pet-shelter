<!--
  This file still has the collision defect that `tasks/lessons.md` was split to remove on
  2026-09-09: one file, one append point, written by every concurrent session. A conflict here
  costs a pull request its whole CI run, because GitHub builds no merge commit for a conflicted
  PR — see `tasks/decisions/2026-09-09-lessons-become-one-file-per-lesson.md`.

  It was left as one file deliberately: these are work-stream write-ups with far less uniform
  structure than a lesson, so splitting them is its own task, not a ride-along. Until then,
  prepend a new stream at the top and do not reformat what is below it.
-->

# Active Work Streams

Historical completed work streams (August-September 2026) have been archived to [tasks/archive/todo-historical-streams.md](archive/todo-historical-streams.md).

Record active multi-step work streams below.

# A short staff invite code no longer takes the site down

**Branch:** `fix/invite-code-any-length` · opened 2026-10-17 · base `d6dd030`

On 2026-10-17 a new `STAFF_INVITE_SECRET` under 16 characters failed the startup secret check,
and every public page returned 500. The owner chose to make the code's length their call. A
short code now boots with a warning, and the risk accepted is in
`tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`.

> **Before deploying this branch:** check the production values of all three secrets. Each now
> refuses the boot if it is any secret's development default or a placeholder an older
> `.env.example` published, with or without quotes, and the invite code also in any letter case. That is correct, because such a key is public in this repository. But
> a production configured that way today would return 500 on every page after the deploy.

- [x] `allowShort` waives only the "short" weakness, and only for the invite code.
- [x] Still refused: unset, quotes-only (straight, curly or zero-width), the dev defaults, and
      published credentials (`HOPE2026`, `1234`, the seeded staff passwords), all recognised
      through surrounding quotes. An accepted code is used as set, and a warning says so if
      it keeps quote marks.
- [x] The session and admin keys now also refuse any secret's dev default, quoted or not
      (exact letter case). These refusals are new; see the note above.
- [x] The `.env.example` test and the operator-file guard call the real accessors.
- [x] Twenty-four `/code-review high` rounds. The loop ended at round 24, the first in which
      every finding was declined with a written reason (the exit rule in the decision entry).
      Fixes along the way were verified by probe and mutant. Four of my own changes were
      reverted after review: case-insensitive key matching, stripping quotes from an accepted
      code, quote-free length measurement, and editing an old decision entry.

## Review

**Verified at the branch tip:** `npm run check`, 0 errors. `npm run test:all` all passing.
`npm run build` exit 0. `next start` checks: a 4-character code serves pages with 200 and logs
the warning without the value. `HOPE2026`, `"HOPE2026`, `admin123`, `""`, and a session secret
set to the admin default all refuse to boot, while an upper-cased session default still boots.
Mutants are tabulated in the decision entry.

**Deliberately not done:**

- No minimum length: the owner's choice.
- Not limiting a weak secret's damage to the feature it gates (option 2): the better design,
  but not chosen. It is tracked in `tasks/open/one-weak-secret-still-takes-the-whole-site-down.md`.
- The rate limiter stays per-process, so it does not bound guessing on serverless hosts.
- Quoted invite codes of 8-15 characters inside prose are not scanned by the guard; that is the
  stated ceiling.



# Parser fixes from PR #42's review — overflow clamp, `withDerivedAge` type

**Branch:** `fix/approximate-birth-date-shapes` · off master `187593c` · 2026-10-15
**Decision:** `tasks/decisions/2026-10-15-the-app-does-not-refuse-a-fractional-age-it-cannot-show-as-unknown.md`
**Lesson:** `tasks/lessons/2026-10-15-a-refusal-ported-into-a-function-that-must-return-becomes-a-default.md`

## Items

- [x] `approximateBirthDate` no longer throws. A count whose date leaves the `Date` range
      (`15000000 weeks`, `300000 years`) made `toISOString()` throw `RangeError`. It now clamps
      to the earliest date a `Date` holds (`-271821-04-20`), older than any age that fits. When
      the intake is out of range too, the intake is returned as given, as for an age with no
      unit. **Mostly defensive today:** the Prisma model has no `age`, and `usePetStore`'s
      mount effect replaces the derived pets with the raw saved ones. What still differs, for
      one render, is set out in the decision.
- [x] `withDerivedAge` return type omits the four fields it recomputes. Pinned by two
      `expectTypeOf` tests that fail `tsc` on the old signature.
- [x] Tried and **withdrawn** after review, all for one reason: a refusal here is the intake
      date, which shows a newborn. They were a fractional/range refusal (`3-4 years` went
      from four years to newborn), a sixty-year ceiling (`61 years` went from senior to
      newborn), and an overflow guard sending `15000000 weeks` to the intake date. Also dropped:
      an ISO fall-through, and `setUTCFullYear` in place of `Date.UTC`, which turned a two-digit
      intake (`26-06-12`) into 26 AD. See the decision and lesson.

## Review

- `/code-review high` runs in rounds, and the loop ends on a round with no findings. No
  per-round record of findings is kept here. The commits that answered them are in PR #119's
  commit list on GitHub, which survives the squash merge, and each message says what it changed.
  The code last changed in the fix that restored `Date.UTC`'s century reading. Every later change
  this branch itself made under `src/` and `tests/` is a comment; merges from `master` bring
  other code in.
- Grid: 476 age × intake pairs, master against the branch: 389 identical, 87 where master threw,
  0 other. Every input master read without throwing reads the same, including every string PR
  #113's rehearsal pins (the three non-ASCII ones added at its request).
- #113's contract rehearsal, which imports the real function, passes on the merged tree (85/0).
- Discriminating tests (fail on master by name): the four overflow clamps, the end-to-end
  `senior` check, and the out-of-range intake. The rest of that block are guards that pass on
  master by design.
- The petAge suite passes at UTC-8, with `TZ` set in PowerShell and the offset confirmed as 480 in
  the same shell. (Node ignores `TZ` set from Git Bash on this machine.)
- The tree that will land, `master` plus #114 plus this PR, does not exist until #114 merges.
  Every gate is run on it, and CI is green on it, before this PR is merged.

**Deliberately not done.**
- Fractional and ranged ages still misread (`0,5 tahun` gives five years). Fixing them needs an
  "unknown age" path first; see the decision.
- A non-ISO intake (`2026/06/12`) still leaks into `birthDate` unconverted on the fall-through.
  It is pre-existing, and the obvious fix threw on an out-of-range intake for every age.
- `Date.UTC` still reads years 0–99 as 1900–1999 (`2000 years` gives 1926). Fixing it alone
  moved two-digit intakes to 26 AD; it needs `isoDateSchema`, `transparency.ts`'s `isIsoDate`
  (which already reads 0–99 literally) and the intake format settled together.
- Compact compounds (`2y3m`) and unlisted spellings (`6 mons`): tied to how the backfill's
  fractional check is narrowed (`expand-refuses-compound-ages-written-in-short-units.md`).
- Three copies of the estimate rule: latent, no writer produces `''`.
- Distributive return type for a union-typed pet: needs an `as` cast and no caller passes a
  union.
- The `approximateBirthDate` docstring still explains rollover with `Date.UTC(2023, 1, 29)`.
  That is still true of JavaScript and of `isoDate`, which uses `Date.UTC`.
- `usePetStore`'s mount effect (`setPets(JSON.parse(saved))`) undoes the initializer's
  `withDerivedAge`, so saved pets keep their stale stored `age`/`ageCategory`. Already named in
  #114's parser entry as a known defect; not fixed here, because fixing it changes what every
  returning browser shows and wants its own test.
- `petRepository.ts` maps rows inside the same `try` as the Prisma query, so a mapping exception
  would be handled as a database outage. No known input makes `mapDbPetToPet` throw today, so
  this is latent and not recorded as an open entry. A round-six entry claiming otherwise was
  deleted before it was published.
- The decision cites an open entry that arrives with PR #114.

# PR #42 follow-up — what a review run after the merge found

**Branch:** `fix/pr-42-review-findings` · opened 2026-10-14 · off `master` at `187593c`
**Review:** `/code-review max` of `18c533e..868e584`, run 2026-10-14, 15 findings

## Items

- [x] Re-established state before acting. #42 had been squash-merged as `187593c` with
      `reviews: 0`, 36 seconds after the review started — tree identical to the branch head, so all
      15 findings were on `master` and every fix had to be a follow-up PR.
- [x] Split the findings with the session behind PR #113 rather than racing it. #113 already
      carried the fix for the worst one (finding 1: the backfill stored a different date for
      `1 tahun 6 months` than the app computed, despite this branch's claim that it "fails
      closed"). That session took F10, F12 and F13 onto #113; this branch took the rest that do
      not touch `petAge.ts` or the SQL.
- [x] **F15 — corrected a false public ledger entry**, in two passes. The entry described a strict
      `intakeDate` check that existed only in a reverted commit, asked for a production count
      against a rule `master` never had, and reopened a settled decision. The first rewrite
      overcorrected — it said a stranded record's *status* could not be changed (it can:
      `updatePetStatus` bypasses `petFormSchema`) and that no existing row was at risk (the
      `2024-01-01` column default can produce one). Second pass fixed both, and widened the
      production check to every row with `birthDate > intakeDate`, so a hand-corrected birthday is
      caught as well as the default. It also renamed the file, believing the name was the public
      issue's title. It is not — the mirror takes the title from the first heading — and renaming
      would have *closed* the issue as if settled. The rename was reverted; the new heading
      retitles the issue in place.
- [x] **F11 — pinned seven accepted spellings nothing tested.** `tahun`, `thn`, `bln`, bare `m`,
      `yr`, `week`, `mnths`. One `it.each` case per spelling, so a dropped one is reported by name.
      Proved each case kills its own mutant: dropped one spelling at a time from the real patterns,
      ran the suite, restored the original bytes from memory. Seven mutants, each killed by exactly
      its own case and no other, every time. Later rounds folded every accepted spelling into that
      one table, so each unit alternative in the patterns now has a named row; the mutation result
      was re-run after each change and held.
- [x] **F14 — corrected the previous stream's record, here rather than in it.** The stream below
      says the `minggu` regex was left alone; it was fixed in #42. An earlier pass on this branch
      edited that stream in place. A review pointed out that `CLAUDE.md` step 5 and this file's own
      header forbid reformatting what is below a new stream, so those edits were reverted and the
      corrections moved into the section below — the stream underneath is now byte-identical to
      `master`.
- [x] Filed `drift-log-has-recorded-nothing-since-2026-10-13.md`. First version compared this session's
      zero lines against 161 for another and blamed how the worktree was entered. Wrong: the whole
      log is 161 lines from **one** session across 90 minutes on 2026-10-13, and nothing from anyone
      since. Rewritten as what it is — the log went silent for every session. **Later folded
      into** master's `drift-log-recorded-nothing-for-a-whole-session.md` (widened by #104 on
      the same defect) and deleted, so the defect has one public issue, not two.

- [x] **Reviewed this branch before opening it**, `/code-review high`, and it found ten more — six of
      them prose stating a state that was not true, in a branch whose whole purpose was correcting
      that. The tree hash was still in a public entry; two corrections cited squashed-branch commits
      that are not ancestors of `master`; the stream said an open PR "deletes" a file; the drift
      entry's comparison was meaningless; the rewritten date-rules entry named the wrong failure
      and dropped a real risk. Each probed, all ten fixed or recorded.

- [x] **A third and a fourth review, each probed before acting.** The third found the F5 premise
      false and the rename mistaken; the fourth re-ran every parser claim and citation in the
      rewritten entries and found them all correct — the probe-first method held where it was used.
      Its findings were the places still reasoned rather than run: the drift entry called the
      liveness log unconditional (the script exits before it on an unparseable payload, and both
      logs share `tmpdir()`, so a moved temp directory would freeze both), the Malay decimals were
      said to be refused "as fractional" (they are refused for having no unit), and the
      born-at-the-shelter query needed the expand migration first and missed three of the four
      rules a stored birthday can fail.
- [x] **Found that the SQL emulator had been broken all along.** The Bash tool collapses a doubled
      backslash in command text, so `\s` reached Node as a plain `s` and matched the letter. Its
      verdicts for inputs with a space were computed on the wrong pattern; most happened to be
      right. Rebuilt with the backslash from its character code and self-tested; only the English
      decimals changed. A lesson and a memory note record it.

- [x] **Fifth and sixth reviews.** The fifth found subtler interactions: a mixed Malay/English age
      is stored wrong by the expand migration on `master` *now* (filed as live, not hypothetical);
      the no-unit check runs before the fractional one; a sibling entry's planned fix would reopen
      a divergence (the two now link each other); an env var redirects the hook's logs; the
      liveness log cannot be attributed to a session. The sixth reported the code clean and every
      cited fact correct, and found precision and process items — a headline still asserting a
      conclusion the body had withdrawn, the wrong cause given for one refusal, a table claiming
      "every spelling" with six missing, and a decision held in this stream instead of
      `tasks/decisions/`. All fixed.

## Corrections to the stream below

`Pet form birth date — critique PR #42, then yield it to PR #94` is left exactly as written. These
are the parts of it that are wrong, recorded here because a stream below this one is not edited:

- **Its two "`minggu` left alone deliberately" bullets are false.** #42 made weeks a unit in both
  languages after the owner ruled that "3 minggu" means three weeks. Both bullets were written
  before that change and never revised.
- **Where it cites a commit as where something landed, read `187593c`.** #42 was squash-merged to
  `master` as `187593c`. Its branch commits — `925b7c6` (weeks), `4cad3ce` (a review's fix round) —
  are real but are not ancestors of `master` (`git merge-base --is-ancestor 925b7c6 origin/master`
  exits 1), and they stop resolving if `feat/pet-form-birth-date` is deleted.
- **It omits the omission that mattered most:** the expand harness's `appRule` was left stale
  while #42 widened the real function. In
  `tasks/open/the-backfill-rehearsal-is-only-correct-at-positive-utc-offsets.md`.
- **It omits that #42 merged unreviewed** after the 2026-10-13 review — including `925b7c6`, a
  behaviour change, and `4cad3ce`, that review's own fix round.

## Review

The review's verdict on my own work is the thing worth recording. Of 15 findings, the largest
group was prose I wrote asserting a state that was not true — a docstring naming SQL files that do
no arithmetic, a ledger entry citing a tree hash as a commit, a stream saying a fix had not been
made, a public entry describing a rule `master` never had. I named this pattern three times on the
night it happened and kept producing it, because naming it did not change what I checked before
writing. What would have: grepping each claim against `origin/master` at the moment of writing,
not against the branch I was standing on.

Then the review of *this* branch found six more of the same, written after I had already put the
lesson into words — including the tree hash surviving in a public entry this branch was created
to fix. Writing the rule down did not stop me breaking it. What did, in the second round, was
mechanical: for the new parser entry, every claim was run against the real function on `master`
through a throwaway test before it was written, and the two that resisted a runtime probe went to
`tsc` instead. It held: the fourth review re-ran every parser claim and citation in that entry and
found them all correct. (When this paragraph was first drafted, no review had yet seen the entry,
and I first wrote that the second one had cleared it — which it could not have.) What later reviews
still found was in claims I had *reasoned* rather than run, and in the probe itself: the SQL
emulator had been silently broken all along. Check first, then write — and check the checker.

The one that cost most was `6d32df9`. `git merge-tree --write-tree` prints a *tree* OID. I told
another session "merges clean against master at `6d32df9`", it repeated the hash in good faith, and
it ended up in a public issue as the commit where `master` still used local setters. `git cat-file
-t 6d32df9` prints `tree`.

## Explicitly NOT done

The open defects are tracked in the ledger, not here — a work stream may record what was not done,
but `tasks/README.md` does not let it hold an open question. Each was reproduced against the real
function on `master` before being filed, rather than copied from the review.

- **F4–F9, all of the parser defects — deferred until open PR #113 lands or is withdrawn**, at that
  session's request, because #113 also edits `petAge.ts`. All are fixable in the app alone: the
  backfill refuses every affected shape, so changing what the app computes for them changes nothing
  it stores. Most are **regressions #42 introduced** with its trailing `\b` — `2y3m` read correctly
  as two years before #42 and reads as three months now; `6 mons` read as six months and now falls
  through to intake. Decimals read the wrong digits (`0,75 tahun` → seventy-five years; the English
  cases predate #42), an unbounded count throws `RangeError`, the return type can lie, and three
  copies of the estimate rule disagree on `birthDate: ''`. In
  `approximate-birth-date-misreads-several-age-shapes.md`, every case reproduced against both the
  pre-#42 and current function.
- **F5's coupling to the SQL was a false premise, and this stream carried it for a round.** An
  earlier version said compact compounds could not be fixed app-side because the backfill's `\M`
  "fails the same way" and the two "agree, both wrong". It was accepted from another session after
  only the app half was checked. The backfill's fractional check *aborts* on `2y3m` (`migration.sql`
  lines 403 and 445–448), so nothing is stored wrong — it runs second, after the no-unit check at
  429, which `2y3m` passes because its trailing `3m` is a unit the backfill reads. That session confirmed it on
  a real Postgres and withdrew the claim from its own decision entry.
- **F2 remainder — the expand harness's stale `appRule`.** Needs `embedded-postgres` to run, and
  deleting the copy changes O1/O2 wholesale. In the rehearsal entry.
- **`CLAUDE.md` step 7 still says nothing about what `git merge-tree --write-tree` prints.** Filed as
  `tasks/open/close-out-step-7-does-not-say-what-merge-tree-prints.md`, so it surfaces at session
  start and mirrors to an issue rather than living only here. A
  review argued the tree-hash trap belongs there, not only in a lesson — and `CLAUDE.md` step 6
  itself records that a lesson living only in `tasks/lessons/` was ignored and let PR #38 ship a
  defect. Not changed here: `CLAUDE.md` is the process every session follows, and changing it is
  the owner's decision rather than a ride-along on a ledger branch. The clause, ready to add to
  step 7: *"Its first output line is the **tree** the merge would produce, not a commit — never
  quote it as a ref. Use the exit status for clean or conflicted, and cite `git rev-parse
  origin/master` for the commit."*
- **The structural half of F11.** The seven spellings are pinned, but a spelling *added* to a
  pattern still goes untested until someone adds a row. Making that impossible means exporting the
  vocabulary from `petAge.ts` and feeding both the patterns and the test from it.
- **The years and weeks word boundaries are unpinned, deliberately.** Removing either still leaves
  the suite green, and pinning them would mean asserting a wrong answer. Recorded as a decision —
  `tasks/decisions/2026-10-14-the-years-and-weeks-unit-boundaries-are-left-unpinned.md` — because it
  is a choice someone could reasonably reverse, and a stream is not where the next session looks.
- **The `tasks/todo.md` conflict with #113.** Both branches prepend a stream at the same anchor, so
  whichever merges second conflicts and loses its CI run until resolved. Inherent to this file's
  one-append-point design (its own header says so); resolved by keeping both streams.

# The backfill rehearsal checks the real age function

**Branch:** `fix/rehearsal-checks-the-real-age-function` · opened 2026-10-14 · follows #94 and #42

## Items

- [x] Merge #42 (owner's instruction once the `minggu` revision landed). Verified its behaviour
      change before merging: all three units now compute through `Date.UTC`, every rollover value
      the backfill transcribes is preserved, and English spellings are unchanged.
- [x] Verify the #42 session's finding rather than take it on trust: expand's `rehearse.mjs`
      compares against `appRule`, a hand copy still on local setters and the old unanchored
      patterns, and `pets.json` holds only plain English ages — so its O1 guard cannot see either
      drift. Confirmed. This session had claimed #42 closed the timezone entry; it did not.
- [x] Add a sound comparison to the contract harness: the real `approximateBirthDate` against the
      real expand SQL on every spelling expand reads, the rollover cases and `pet-008`. 77/77 in
      four timezones; mutation-tested.
- [x] Make the containment executable: each app-only spelling is read by the app and refused by
      the backfill.
- [x] Correct the expand header, which still said it read "the spellings the app itself reads".
      Comment-only, verified three ways, because the harness parses part of that header.
- [x] ~~Settle `malay-age-units-outpace-the-backfill.md` into `decisions/`.~~ **Withdrawn.**
      `/code-review medium` measured `1 tahun 6 months` stored as six months by the backfill while
      the app reads one year, silently — the exact case the decision said could not happen. #42
      opened it, and this session merged #42 having checked single-unit spellings only. The entry
      is restored with the measured table at the top and a pre-flight query, tested on pglite
      against thirteen strings, for the owner to run before applying expand. The decision never
      reached master.
- [x] Harness revised from the same review: single-unit refusals asserted by message and row id
      rather than "any error"; app readings asserted by exact date rather than "differs from
      intake"; the bare `y`/`mo`/`m` and no-space `5y` forms added; a clear failure under plain
      `node`.
- [x] **Fixed the mixed-string defect** rather than pinning it — a second review showed it was
      broader (`2 tahun 3 years`, `5 yo and 3 years`) and that pinning a fixable defect green was
      the wrong call. Three SQL lines in expand's unit classification, mirrored in its header
      pre-check. Expand's own J1 and J3 reproduced in the contract harness and passing for 18
      fixtures; mutation-tested by removing the pre-check half, which J1 caught. The only
      executable change to expand is those three lines. 88/88. The vocabulary entry settles into
      `decisions/` — this time with a claim that was measured, and with its residuals named.
- [x] Corrected five stale claims in expand's header the review found, all made false by #42 or
      b40a7d7: the app's Malay behaviour, O2's coverage, "ninety-two checks", the month-end
      direction, and the contract "re-deriving".
- [x] `/code-review high` found the same divergence through **whitespace**: JS `\s` matches a
      no-break space, Postgres `[[:space:]]` does not, so `1<NBSP>year 6 months` was one year to
      the app and six months to the SQL. The refusal now also covers Unicode whitespace — and
      deliberately not all non-ASCII, after reading the bytes of every non-ASCII fixture in
      expand's harness showed M1 expects en/em-dash ranges refused *as fractional*. Mutation-tested.
      93/93.
- [x] **Caught the editor decoding `\uXXXX` into literal characters** in the production SQL,
      including a BOM inside a regex. Rewritten with `String.fromCharCode(92)`, as auto-memory
      already warned; the migration now contains no non-ASCII byte.
- [x] From the #42 session's review of #42: fixed F10 (a `petAge.ts` sentence saying both SQL
      files do date arithmetic) and F13 (refused list now names `5 yo`, `5yo`, `mnths`). **F12 —
      a `6d32df9` "master" ref in a public entry that is a git *tree*, not a commit — handed back
      to that session**, which asked to own it: the line also needs rewriting now #42 has merged,
      and two sessions editing one line of a public entry is how it gets a conflict. Agreed a split: they
      take the app-side parsing fixes. This session first told them F5 and F6 had to land with the
      SQL, claiming `2y3m` was read as three months on both sides. **Wrong, and corrected by them:**
      measured against the file, the backfill's fractional check refuses `2y3m`, `5yrs8mths` and
      `1y6m` outright, and `1y2w`, `6 mons` match no unit and are refused too — so the app side can
      be fixed alone. A fifth unrun claim about regex behaviour from this session tonight.
- [x] 2026-10-15, `/code-review high` on `38a7156`: ten findings. **U+0085** splits the engines in
      the opposite direction from the no-break space, and a non-ASCII letter glued to an *English*
      unit splits their word boundaries; both stored a wrong birthday silently. The whitespace
      deny list is replaced by a stage of its own refusing **any non-ASCII age**, tested as
      `octet_length <> char_length` (no regex, no escape), placed after the fractional check so
      dash ranges keep their message, plus a refusal of any non-UTF8 database. Pre-check gains a
      `non-ASCII age` verdict. Three mutations, each caught. The redundant MIXED loop is gone (J3
      asserts the same, stricter); stale prose fixed in the header, the harness, the TZ entry. The
      2026-10-14 decision is reversed in part by a new entry rather than rewritten. 82/82 in four
      timezones.
- [x] `/code-review medium` on that round: no correctness defect, but the stage sat *after* the
      unit and fractional regexes, so a pasted `2<NBSP>years` got "cannot be derived" or
      "fractional" depending on ctype. **Moved the non-ASCII refusal to the first stage**, in the
      file and the pre-check (one WHEN, not two copies); encoding guard moved inside the backfill
      branch and mirrored in the pre-check as `database not UTF8`. The three divergences are now
      **measured** on pglite C.UTF-8 rather than asserted, and the app's half pinned by date.
      `petAge.ts` docstring points at the new decision.
- [x] **Ran expand's own harness for the first time this session**, after `npm ci` plus
      `npm i --no-save embedded-postgres` in this worktree's own `node_modules`: 92/92. Its M1, N1
      and L3 expectations updated for the new stage; J1/J3 gained non-ASCII and app-only fixtures
      and J3 now checks each verdict's own message. Contract harness 85/85 in four timezones.
      Mutations re-run for the new placement, each caught. Gates: typecheck, lint (0 errors),
      docs:check, unit 1605/1605, components 177/177, integration 92/92, build.

## Review

**Not done, deliberately:** expand's harness still restates the function as `appRule`, so its
O1/O2 still report green against a drifted copy, and the timezone entry stays open for that
reason. On 2026-10-15 that harness was installed and run here (92/92) and its refusal checks were
updated for the non-ASCII stage, but O1/O2 were left alone: retiring them in favour of the
contract harness's comparison is the entry's own suggested repair, and a separate change.

**The mixed-string defect is fixed** — after this stream had first recorded it as deliberately
not fixed, on the grounds that expand's harness could not be run. That reasoning did not survive
review: the two checks the change touches were reproducible. Lesson filed. Expand's own 92-check
harness was later run in full, 92/92, once installed into this worktree's own `node_modules` --
which was possible all along, and is what "could not be run" should have prompted.

**What was wrong in this session, briefly:** it asserted that #42 closed the timezone entry without
checking what the rehearsal compares against; gave a spec built on master while the branch had moved
past it; merged #42 having verified single-unit spellings but not combinations; and then wrote a
decision asserting containment that a `medium` review disproved in one probe. Four claims, none
measured on the inputs that broke them.

# Bulletins get a server-side store (#76)

**Branch:** `worktree-bulletins-76` · opened 2026-09-22 · GRAVE lane
**Settles:** `tasks/open/bulletins-are-a-per-browser-demo-anyone-can-edit.md` (issue #76),
and P-D for `Bulletin` in `docs/tasks/TARGET_SCHEMA_TYPE_INTEGRITY.md:193`.

## Items

- [x] Audit the brief against `origin/master` 8d36ace before building. Every line of the ledger
      entry's evidence re-verified at that commit; no in-flight PR overlaps (only #42, birth-date).
- [x] Put P-D to the owner with three costed options, including one the brief did not name
      (server-render the fixture read-only). Owner chose (a), the full model. Recorded in
      `tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md`.
- [x] Claim and five kill conditions written before the spike (`tasks/open/CLAIM-bulletins-76.md`).
- [x] K1: the embedded-postgres rung recovered and `npm run db:push:local` run verbatim against
      real PostgreSQL 18.4. Did not fire — the migration is rehearsed, not asserted.
- [x] Migration rehearsed: hand-written DDL produces objects identical to `prisma db push`,
      is idempotent, and the enum rejects an out-of-vocabulary category.
- [x] `Bulletin` model, three enums, one index; `src/lib/server/bulletinRepository.ts`;
      `src/actions/bulletins.ts` behind `requirePermission(MANAGE_CONTENT)`.
- [x] `/admin/bulletins` editor; admin nav repointed and the `permissions: null` opt-out removed.
- [x] K2: `BulletinFeed` is a Server Component with zero client state. Did not fire.
- [x] Public "Staff Admin Access" toggle, `AdminBulletinModal` and `bulletinStore.ts` deleted.
- [x] Media host allow-lists, enforced on write *and* on read.
- [x] `src/data/bulletins.json` reshaped; the `dQw4w9WgXcQ` embed removed from shipped content.
- [x] Test suite: 114 cases, eight claims checked against mutants.
- [x] Merge `origin/master` 4782ff2 (#88's AST guard) and re-run every gate.
- [x] `/code-review`, **four rounds**, because each fix round is new code:
      round 1 (whole diff) fourteen findings — ten fixed, one declined with a reason;
      round 2 (the fix commit) thirteen, **two worse than what they replaced**;
      round 3 (that fix) thirteen, one of them the tiebreaker still being dead;
      round 4 (after merging #93) fourteen, of which five are master-side and already
      filed by the session that wrote them. Migration re-rehearsed after every change
      that touched its SQL.
- [x] Round 5, the whole PR against master `187593c` before merge: fifteen findings, verified
      one by one since the reviewer probed none. The public read no longer serves the launch
      fixture on a production outage (it resurrected deleted notices and ISR cached them);
      future-dated notices are scheduled against the shelter's day; the migration script seeds
      only on the run that creates the table. Rehearsed on a real Postgres on port 5433, clear
      of another session's server on 5432 — which is how the "(remote)" label on a local URL
      was found and fixed in both migration scripts.
- [x] Round 6, round 5's fixes on their own: fifteen findings. Round 5's seeding rule had broken
      the launch (a table created by `prisma db execute` was never seeded, and production stops
      serving the fixture once the table exists); reversed to "seed an empty table". Rehearsed
      both ways on a real Postgres. The fixture question now asks whether a database exists
      before asking `NODE_ENV`; the form's default date is the shelter's; P2022 has its own
      message; the third copy of the migration-target label, in `check-drift.ts`, is fixed.
- [x] Twenty-seven mutants across six rounds, all killed (4 + 4 + 5 + 2 + 6 + 6).
- [x] Round 7: ten findings, all small — the review is converging. Three declined with reasons in
      the decision entry. Filed for the shelter: the launch notices are from August and two are
      pinned.
- [x] Round 8: converged — "no correctness bugs serious enough to block". Seven low-severity
      fixes, including a factual error in the public launch-notices entry; one decline.
- [x] Round 8's fixes reviewed on their own (`ec8fbce..b9ffbba`), by hand: the forked
      `/code-review` returned empty after one tool call, so it is not counted as a review. No
      findings — every `isScheduledForLater` caller passes the shared day, and the emptied form
      default cannot post because the schema's `YYYY-MM-DD` regex rejects `""`. The seed's new
      rollback path was proven on embedded Postgres: a CHECK constraint rejecting the second
      fixture row made the script exit 1 with the constraint's own message, the table held 0 rows
      afterwards, and a clean re-run seeded all four.
- [x] Round 9, 2026-10-15: the review above found nothing because it was mine. Retried at
      `medium`, the forked `/code-review` found seven. Four fixed: `today` is required, one
      instant per request, a test that kills three mutants of round eight's fix (none had
      existed), and console spies restored on failure. Three declined with reasons in the
      decision entry. Lesson:
      `tasks/lessons/2026-10-15-an-empty-review-is-a-review-that-did-not-run.md`.
- [x] Round 10, round 9's fixes: eight findings, two against round 9 itself. The
      one-instant change is reverted, because the two paths it "aligned" never run together.
      The admin table takes `today` as a prop, which fixes the hydration mismatch instead of
      documenting it. The ninth-review test now checks behaviour (a future fixture notice is
      hidden) and kills three mutants. One finding refuted: the fake timers are restored by
      their `describe`'s own `afterEach`.
- [x] Round 11, round 10's fixes: no correctness bug. Of six findings, three were fixed: a
      component test for the `today` prop, a fallback test that now separates the shelter's day
      from UTC, and a comment moved back to its line. Two mutants killed. Three declined with
      reasons in the decision entry. 34 mutants in all.
- [x] Round 12: round 11's `low` review returned empty (one tool call) and was retried at
      `medium`. No correctness bug. Three test gaps fixed: a boundary spec, a far-future row,
      and an exact feed list. One `>=` mutant killed; 35 in all.
- [x] Round 13: round 12's "feed order" assertion could not detect a broken sort, because the
      fixture's file order already is feed order. It is now a set derived from the fixture,
      with ordering left to the ordering tests, as its comment says. The table spec freezes the
      clock. All six scheduling mutants re-run and still killed.
- [x] Round 14: seven findings, no correctness bug. One was refuted by a probe: removing the
      fallback's sort fails two existing tests, which the comment now names. Fixed: the
      named-row assertions, the instant and day as one pair, the six mutants tabulated in the
      decision entry, and strikethrough claims reworded in past tense. Two declined. **The
      review loop stops here**, for the reasons the decision entry states: test-only rounds,
      no correctness finding, every rule mutant-pinned.
- [x] Merge `origin/master` `e99ebf8` (#93), which fixed the adoption-submission defect this
      branch had filed; the duplicate open entry was deleted rather than left to mirror a
      second issue.

## Review

**Verified.** `npm run check` clean (typecheck, lint 0 errors, docs:check OK). `npm run build`
run in the worktree after `npm ci`, with throwaway secrets inline. The migration was rehearsed
against real PostgreSQL 18.4, not reasoned: its DDL produces objects identical to
`prisma db push`, re-running it is a no-op, the enum rejects an out-of-vocabulary category, and on
a database seeded with the index this branch later retired, a re-run clears it.

**CI settled the test question: PR #103 is green on every job**, including "Unit, integration &
component tests" (run `38428838326`, commit `af0fc2c`). That is the same tree that gave two
different local answers, so the local readings were both wrong about the code — recorded against
the order-dependence entry, which this stream also widened.

**Locally, `npm run test:all` could not be quoted as a single number, and this stream did not
pretend otherwise.** Two runs of the same tree, nothing changed between them: `65 failed`, then
`4 failed | 1964 passed (1968)`. The second run's four were one test each in four unrelated
non-bulletin files across two projects, and **all four pass in isolation**. That is
`tasks/open/unit-suite-is-order-dependent-in-both-directions.md`, which records the same shape on
plain `master` — and which this stream has now widened, because that entry describes the `unit`
project and these failures were in `components` and `integration`. `tests/unit/bulletins.test.ts`
is **126 passed** run on its own.

**The reviews are the story of this branch.** Round 2 found that round 1's fix had made an
ordering bug deterministic rather than fixing it. Round 3 found that round 2's fix for it was
still dead. Round 4 found that round 3's fix was *also* still dead, for a third reason. One
ordering rule, four attempts, each one claiming in a comment to have fixed it — which is the
lesson `tasks/lessons/2026-10-13-a-comment-asserting-a-mechanism-is-a-claim-to-run.md` is about,
and the strongest argument for the standing order in CLAUDE.md step 6 that this repo has produced.

**The tests were checked against mutants, not trusted.** Dropping the `MANAGE_CONTENT` gate,
returning `videoEmbedUrl` unfiltered, treating an empty result as an outage, and taking the byline
from anywhere but the session — all four failed the suite. A suite that passes proves nothing
about code nobody broke on purpose.

**Deliberately not done:**

- **The feed is still English-only.** `titleMs`/`contentMs` exist, the editor writes them, the
  reader resolves English into them — but nothing renders them.
  `tasks/open/home-page-text-stays-english-on-the-malay-site.md` owns the render side and is
  untouched. The columns landed now because adding them later means a *second* hand-run DDL
  migration against a branch with no down path.
- **Nothing was applied to production.** The deliverable is
  `prisma/migrations/manual/20260922_community_bulletins/migration.sql` plus
  `npm run db:migrate:bulletins`, for the owner to run. `npm run db:push` must NOT be used: it
  reconciles the whole schema and three destructive statements still stand between master and the
  production branch. Until the owner applies it, the live feeds serve the committed fixture
  through the repository's outage fallback — which is the same content visitors see today, so
  there is no window where the site is worse than before.
- **No `displayOrder` column**, and no reordering UI. Pinned-first-then-newest is the feed's real
  ordering; a manual column would be a second one to keep in step by hand. If staff ask to hand-
  order notices, that is a new column and a new decision, not an oversight.
- **The `/bulletins` archive is unpaginated.** Marked with a `ceiling:` comment. Fine at shelter
  scale; page it if the archive outgrows a few hundred, which is also when the page stops being
  readable.
- **No component test for `BulletinFeed`.** It is now a pure Server Component with no branching
  beyond media type, and the repository tests already pin the data it receives. A render test
  would assert that React renders props.
- **`src/actions/faqs.ts` still gates on a legacy role list** rather than `MANAGE_CONTENT`. Left
  alone deliberately — the 2026-09-18 decision kept it there, and changing it is not this task.

**One thing a reviewer should look at hardest:** this change *raises* the stakes. Before it, the
public editor could only damage the visitor's own browser. Now there is a real store behind real
pages, so the `requirePermission` calls in `src/actions/bulletins.ts` are the only thing standing
between an anonymous POST and the shelter's public notices. That is where the denial tests point.



# Donation receipts wait for reconciliation

**Branch:** `worktree-donation-receipt-reconciliation-boundary` · opened 2026-09-22
**Settles:** `tasks/open/general-donations-issue-receipts-before-payment-is-reconciled.md` (issue #56)

## The brief, and where it was wrong

The brief asked to "store the donation record in a pending status without assigning an official
receipt number" — i.e. a `status` column on `Donation`. That is unimplementable against
production and forbidden by this repo's own schema:

- `donations_no_mutation` has been live on the production branch since 2026-09-21
  (`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`). It refuses every UPDATE
  and DELETE on `donations`. A pending row inserted there could never be updated to attach its
  receipt number, so the reconciliation step would fail in production and nowhere else.
- `prisma/schema.prisma` already rejects the idea in prose, where `PetSponsorship` explains why it
  is not a `Donation`: "Modelling it as a mutable `Donation` would have meant putting a status
  column on a statutory document, which is exactly what that model's comment forbids."

So the pending state goes in a new `donation_pledges` table, mirroring the shipped
`PetSponsorship` → `settleSponsorship` pattern. This makes the brief's item 4 stronger than it
asked for: the LHDN export reads `donations`, so an unconfirmed pledge is structurally invisible
to it. There is no filter to forget.

The brief's "or webhook callback" is **not built**. No payment processor is integrated, `card` is
refused before rate limiting, and `grep -ril webhook src/ prisma/` returns nothing. Adding a
public POST endpoint that mints statutory receipts, with no signature to verify, would be a worse
hazard than the one being closed. Staff reconciliation is the boundary; the webhook is recorded
as the deferred option.

## Items

- [x] `DonationPledge` model + hand-written idempotent migration (never `db push`), with
      `rollback.sql`. **Applied nowhere** - see the new open entry.
- [x] `src/lib/server/donationPledgeLedger.ts`: pledge, settle, reject, pending queue
- [x] `submitDonationPledgeAction` returns a pledge, not a receipt
- [x] Staff actions: list / reconcile / reject, behind the existing reconciliation permission
- [x] Audit: `DONATION_PLEDGED` at submit (no `receiptNumber` in details), `DONATION_RECEIVED`
      moves to reconciliation
- [x] Tax-neutral acknowledgement email at pledge; receipt email only at reconciliation
- [x] Admin queue renders pending gifts beside pending sponsorships, via one extracted
      `ReconciliationQueue` rather than a second copy
- [x] Donor-facing acknowledgement replaces the receipt screen (EN + MS)
- [x] Tests: no receipt before reconciliation, idempotent double-confirm, export blind to pledges
- [x] Settle the open entry into `tasks/decisions/`

## Review

**Verification.** `typecheck` clean. `test` (unit) 99 files / 1596 tests, all green. `test:components`
11 / 170 green. `test:integration` 6 / 59 green. `lint` 0 errors, 13 warnings, every one of them
pre-existing and in a file this branch never touched. `docs:check` and the layer graph both OK.
`build` succeeded with throwaway secrets inline, after `npm ci` in the worktree.

**`npm run test:db` could not run on 2026-09-22 and did run on 2026-10-13.** Docker still will
not start here, but `tasks/lessons/2026-09-14-a-missing-docker-is-not-a-missing-database-tier.md`
already named the second route and this stream had not read it: `embedded-postgres` in the job
scratch directory, on the credentials `docker-compose.yml` uses. Tier 3b: **5 files / 42 tests
green**, including the three-way settle race, the dismissal transaction, and both reference
collisions against a real P2002. `migration.sql` and `rollback.sql` were rehearsed on the same
server — 7 checks, and the hand-written table is identical in columns and indexes to the one
`prisma db push` builds from the schema.

**A transient local Postgres made an earlier run look far worse than it was.** Midway through the
session a native server was listening on `localhost:5432`; `src/lib/server/prisma.ts` falls back to
a hardcoded localhost URL when `DATABASE_URL` is unset, so unit suites written for the in-memory
branch hit it and failed on leftover rows - 65 tests across 16 files, reproduced identically in the
pristine main checkout at `b44f857` before concluding anything. It had stopped by the final run,
which is green. Worth knowing before anyone reads a red unit run here as a regression.

### Code review, and the fix round

`/code-review high` over the whole branch diff returned six findings, each verified by probe
before it was accepted. One was medium and the rest low; all six are fixed:

1. `assertGiftRefString` ran inside `withReceiptTransaction` on the Postgres path, so a malformed
   reference came back as `ReceiptIssuanceError` rather than `TypeError` — an outage message for a
   programming error, and a disagreement between the two storage modes. Hoisted above the mode
   branch. `tests/unit/donationPledgeRefGuard.test.ts` is the new guard; it was confirmed to fail
   against the unfixed code before being kept.
2. The LHDN CSV fallback fills "Donor Email" from `entry.actorEmail`, which is now the coordinator
   rather than the donor. `exportCsv.ts` prefers `details.donorEmail` and keeps `actorEmail` as the
   fallback for older rows.
3. The migration's advisory lock used `4210771004` while every sibling uses `4210771001`, so its
   own comment about queueing against them was false. Aligned.
4. `isGiftRef` was dead and its docstring claimed a boundary it did not enforce. Wired into
   `giftRefSchema`, so a receipt number pasted into the queue is rejected on shape.
5. `useSponsorshipStore`'s contract still said `submitDonationPledgeAction` returns a
   `DonationReceipt`. Corrected, including why the hook is kept rather than deleted.
6. `prisma/schema.prisma` and the boundary test cited the open entry this branch deletes. Both now
   point at the decision file.

A second `/code-review high` over the fix commit returned six more, again each probed:

1. **Receipt dating.** The receipt now carries the confirmation date, not the gift date, so a
   year-end gift can land in the next tax year. Kept — it matches `settleSponsorship`, and
   back-dating would grow a month's gapless series after it was filed — but named as a `ceiling:`
   and written into the decision file rather than left to be discovered by a donor.
2. **`hasMore` was computed and never rendered**, so both queues truncated silently at 200 on a
   queue fed by an unauthenticated form. Now surfaced, which fixes the sponsorship lane too.
3. **`/donate` hardcodes `duitnow_qr`** while publishing the Maybank account, so a bank-transfer
   donor's receipt and queue row both name the wrong rail. Pre-existing; this change gives it a
   second consumer. Not fixed here — it needs a rail selector on the public form — and recorded as
   its own open entry.
4. **A `pledgeRef` collision lost the gift.** The reference is a 6-digit daily random, so ~200
   gifts a day carries roughly a 2% daily chance of a collision, which surfaced as "we could not
   confirm" — losing a real submission and telling the donor not to retry. Now redraws once, with
   three tests covering the retry, the second collision, and the `receiptNumber` unique that must
   *not* be retried.
5. **The donor-email fix was incomplete**: `SPONSORSHIP_RECONCILED` rows are classified as
   donations by the `receiptNumber` test and carry `sponsorEmail`, so they still exported the
   coordinator. Both spellings are now checked, and `sponsorName` was added to that audit row so
   the export stops calling reconciled sponsors "Anonymous Donor".
6. **Deploy ordering** — already tracked; see the open entry and the PR description.

A third `/code-review high`, over the second fix commit, returned four more:

1. **The sponsorship export fix was itself half a fix, and the half it left was the money.**
   `exportCsv` reads `amountMYR` and nothing else for the amount column, and the
   `SPONSORSHIP_RECONCILED` audit row carried only `amountSen`/`amountDisplay`. So the previous
   commit gave those rows a real supporter name and address — making them look authoritative —
   while the LHDN amount column still read `0.00`. The row now carries `amountMYR`, plus the tier,
   frequency, rail and dedication the exporter was otherwise inventing as "Rescue Donation" and
   "DuitNow QR". `taxIdOrIc` is deliberately still absent: an audit row is not somewhere to widen
   where an NRIC is stored.
2. **The collision retry was gated on `meta.modelName`**, which nothing in this repo has observed
   Prisma populating for a `donationPledge.create`. If it is absent the predicate returns false,
   the retry never fires, and the donor loses the gift exactly as before — silently. The call site
   is the discriminator (this only ever wraps one `create`), so the check is now on `meta.target`
   alone, with tests for the no-`modelName` and index-name shapes.
3. **The truncation banner had no test.** Two added, both directions.
4. A collision case was added to the Postgres suite, since that tier is the only place the *real*
   P2002 shape is observable — still unrun here.

A fourth and a fifth round followed, each over the previous round's fix commit:

- **Round four** found that the amount fix reached only rows written from then on: every
  reconciled sponsorship already in audit history carries `amountSen` and no `amountMYR`, so they
  still exported RM 0.00. The exporter now reads the sen, and an unknowable amount is an empty
  cell rather than a claimed zero. It also filed two pre-existing defects as open entries — the
  sponsorship lane's identical reference collision, and the two lanes disagreeing about an NRIC
  in the audit row.
- **Round five** found the collision predicate keyed on a field this client never sets. On Prisma
  7 with `@prisma/adapter-pg` a P2002 has no `meta.target`; the columns are at
  `meta.driverAdapterError.cause.constraint.fields`. So the `receiptNumber` guard was dead code
  and its tests passed on a fabricated error. `uniqueViolationColumns` now reads the real shape,
  with tests on it, one of which was confirmed to fail against the old code. The audit viewer and
  the CSV exporter also now share one amount resolver, which prefers the exact sen.

Not fixed from round five, and why: a receipted row whose amount cannot be resolved is still
exported, with an empty amount cell and no operator notice. Dropping a receipted row from a tax
export is worse than showing it incomplete, and a notice is a UI change to `useAuditLogController`.

**Round six, 2026-10-13/14** closed the review of round five and three filed follow-ups:

- **One reader for "which unique did this hit".** Round five's fixture was still transcribed from
  `node_modules`. The error was captured from a live server instead, and
  `src/lib/server/uniqueViolation.ts` now serves all three call sites. It returns `true`, `false`
  or `"unnamed"`, because the third is a different fact and each caller must decide what it may
  do with it.
- **The sponsorship lane's collision retry exists now**, and `isReferenceCodeCollision` in
  `applications.ts` — which read `meta.target` and so never retried — reads the real shape.
- **The audit-row rules moved to `src/lib/domain/receiptAuditRow.ts`.** One classifier and one
  amount resolver for the receipts tab, the viewer badge and the CSV fallback, which had been
  testing key *presence* in two places and *truthiness* in the third. A zero, negative or
  fractional `amountSen` is "no answer", so it can no longer mask a real `amountMYR`.
- **`/donate` asks which rail the donor used.**
- **An NRIC is no longer copied into the audit log** by either lane; see the 2026-10-13 decision.

**A second environmental trap, worth knowing.** Stopping the embedded server's Node wrapper left
one orphaned `postgres.exe` holding port 5432: it accepted connections and never answered. The
global `beforeEach` then timed out at 10 s in whichever file a worker opened first, so *different*
pure-logic suites failed on each run. That is distinct from the leftover-rows failure above, and
from plain contention — nine other sessions' Postgres processes were running, and the suite needed
`--maxWorkers=3` to go green (102 files / 1635 tests) even with the port closed.

**Round seven, 2026-10-14**, the review of round six's four commits, found nine and all are
fixed. The ones that changed behaviour: the QR panel's channel switcher was a second rail
selector the payload could not see, so it now moves the rail question (native radios, and copying
the account number no longer flips it); the sponsorship ledger's collision redraw and its
foreign-key recovery could not follow one another, and are now one loop; `uniqueViolationOn`
matched by substring and now matches exactly; and a ledger receipt's zero or negative amount is
printed rather than blanked, since that is what an offsetting correction looks like. Tier 3b was
re-run against a live server after these changes.

**Round eight, 2026-10-14**, the review of round seven, found ten; seven are fixed, three are
not. CI would also have failed: the Playwright golden path asserted an `HFS-DON` e-receipt on
submission — it pinned the defect this branch removes. It now asserts the pledge and the absence
of a receipt, and passes locally against a dev server with no database (5/5). Rewriting it
surfaced four public claims that a receipt is "generated instantly", on `/donate`, `/get-involved`
and in the FAQ fixture, now corrected; the production FAQ row is database data and needs an edit
in `/admin/faqs` at deploy time.

Fixed: the QR switcher sync was withdrawn and `/donate` shows only the DuitNow code, as the
modal does; `uniqueViolationOn` decides by the column list whenever there is one and reads an
index name inside a legacy `target` array; a negative ledger amount is exported as a number so a
spreadsheet SUM counts it; a double sponsorship collision has its own error message; and a
decimal string under `amountSen` is refused, because `"250.00"` is likelier misfiled ringgit than
250 sen. Not fixed: the foreign-key recovery is spent even when its lookup finds both referents
(pre-existing behaviour, not a regression); the two ledgers still implement the redraw in
different shapes (two copies; AGENTS.md waits for a third); and the suffix fallback for constraint
names, now marked as a `ceiling:`.

This round's commit has not been reviewed.

**Applied to production, 2026-10-15.** The owner ran the migration in the Neon SQL editor and
reported both confirming queries correct: `donation_pledges` exists, `donations_no_mutation` is
still enabled (`O`). The open entry is settled into the decision file. Left: merge, then the
production FAQ edit in `/admin/faqs`.

### Deliberately not done

- **No payment webhook.** The open entry offered it as the other fork. There is no processor
  integrated anywhere, `card` is refused before rate limiting, and `grep -ril webhook src/ prisma/`
  is empty. An unauthenticated public POST that mints statutory receipts, with no signature to
  verify, is a worse hazard than the one being closed. `settleDonationPledge` is the single funnel
  a callback would later call.
- **`pet_sponsorships` was not generalised to carry general gifts.** It was the smaller-looking
  option and it is rejected in the decision file with the reasons: `petName` is `NOT NULL` and read
  across ~10 files in the sponsor portal, and a sentinel pet name would land in
  `Donation.targetPetName`, which is a dedication.
- **No in-app view of an issued receipt.** Both printable dossiers rendered at *submission* time,
  which was the defect, so both are gone rather than relocated. The receipt now arrives by email,
  exactly as the sponsorship lane has always worked. A donor-facing receipt view belongs behind the
  sponsor portal, keyed on a receipt that exists; that is not built.
- **`--receipt-panel` is left declared with no consumer.** Removing the two dead component classes
  orphaned that one token. The repo's own guard polices `@layer components`, not `@theme` tokens,
  and the rest of the `receipt-*` family is still in use by the sponsor certificate; pulling one
  token out of a coherent family is churn into the design system for ~40 bytes.
- **Year-end receipt dating is still a `ceiling:`.** A gift sent on 30 December and confirmed on
  2 January is receipted in January. Back-dating would grow a month's gapless series after it was
  filed. The fix needs the bank statement's value date and a shelter policy, not a default.
- **`useSponsorshipStore.saveDonationReceipt` now has no caller.** Left in place: it is the client
  receipt store, and the right fix is a portal receipt view, not deleting the store on the way past.
- **The idempotency `ceiling:` is inherited, not closed.** A same-actor retry after a lost commit
  acknowledgement still reports uncertainty rather than guessing. Closing it needs an operation id
  on the row, and it should be closed for `settleSponsorship` at the same time - both functions
  carry the note.




# Pet form birth date — critique PR #42, then yield it to PR #94

**Branch:** `feat/pet-form-birth-date` · PR #42 · picked up 2026-09-22
**Lesson:** `tasks/lessons/2026-09-22-three-copies-of-one-date-calculation-disagreed-across-three-branches.md`

## Items

- [x] Audit first. PR #42 was eight days stale, `CONFLICTING`, and the entry it claimed to settle
      was still on master. Merged `origin/master` three times across the session (63 commits); the
      only source conflict was an import block in `src/actions/pets.ts`.
- [x] Critique. `handleBirthDateChange` never cleared `birthDateIsEstimate`, which defaults to
      `true`, so every date picked from the calendar was filed as a guess — and because
      `handleAgeChange` only spares *exact* birthdays, the next keystroke in the Age field
      replaced the chosen day with `intakeDate` minus the typed age.
- [x] First component test for `PetFormDialog`; the dialog had none. Each case watched failing
      against the historical component, aliased in under a throwaway config.
- [x] `/code-review high`. Ten findings, each probed. Five fixed, including one the first critique
      missed: `withDerivedAge` reads age *as of now* while the dialog computed the birthday *as of
      intake*, so "3 years" on a pet taken in three years ago saved as six.
- [x] **Discovered PR #94 was building the same thing**, and a third branch a second migration.
      Three branches, two migrations one letter apart in folder name, and no PR on one of them.
- [x] Told the #94 session, with the one correction that mattered: its "#42 is 166 files and
      −13,546 lines, cannot be merged as-is" was measured against the pre-merge tip. The honest
      figure was 17 files, +1048/−72, mergeable and green.
- [x] Yielded the form to #94. Its read-only age and band is the better design and it answers an
      open entry this session had already filed about the Age Stage select.
- [x] Sent #94 the `updatePet` estimate-flag defect. It had it, confirmed it by probe, and fixed
      it — a stored `false` was being overwritten with `true` by `{...existing, ...validated}`,
      because a zod `.default(true)` puts the key on every parse.
- [x] Dropped this branch's month-end clamp after the expand session finalised on roll-forward
      and ended. Pinned the rollover with tests instead.

- [x] #94 merged as `18c533e`. Merged master, resolved the `tasks/todo.md` stream collision, and
      deleted `every-admin-save-downgrades-an-exact-birthday.md` — verified first that
      `petBaseFormSchema` on master now reads `birthDateIsEstimate: z.boolean().optional()` with no
      `.default(true)`, so the bug that entry named is fixed rather than assumed to be.
- [x] Caught a data-losing resolution before #94 merged. #102 had rewritten
      `unit-suite-is-order-dependent-in-both-directions.md` to 135 lines while #94 added 12 lines of
      its own to the same entry, so taking the newer version — the obvious call — would have deleted
      the other session's named mechanism. Relayed rather than resolved; it was their prose.
- [x] Corrected my own stale prose a second time: #94 merging put both migrations on master, so the
      docstring and ledger entry calling them "unmerged" were wrong within minutes of being right.
- [x] `src/hooks/usePetTableController.ts` is no longer this branch's. #94 took the optimistic-row
      fix, because the stale row was a regression its own diff introduced and leaving it here meant
      master carrying a visible regression between the two merges. Nothing of mine conflicted,
      because the change had already been reverted.
- [x] Filed `the-backfill-rehearsal-is-only-correct-at-positive-utc-offsets.md`: expand's rehearsal
      compares its SQL against a hand transcription of `approximateBirthDate` that uses local-time
      setters, so it disagrees at negative UTC offsets and would read as a broken migration.
## Review

The brief was "continue implementing". Most of the value turned out to be in not implementing:
the form work was duplicated by a session that had gone further, and the most useful things this
branch produced were a defect report for someone else's PR and a set of tests holding a rule that
three branches had quietly disagreed about.

The clamp is the part worth explaining. `approximateBirthDate` rolls a month-end day forward —
31 March less a month is 3 March. This branch fixed it, which was right in isolation and wrong in
context: two SQL transcriptions of that function back the production backfill, and a backfill
must store what the application would itself compute. By the time the disagreement surfaced, the
expand migration had been finalised on roll-forward and its session had ended, so the cheap move
was to converge on the status quo and make it checkable. The rollover is now asserted by tests
that say in their own comment that they are expected to fail on an "improvement", and the
docstring names both SQL files. The four cases the expand session rehearsed against embedded
Postgres are the four the unit suite now pins.

Gates on the final tree: `npm run check` (typecheck, lint, docs:check) 0 errors; unit, components
and integration green; `npm run build` compiled. Earlier in the session `npm run test:all`
reported 30 failures that are not this branch's — every project passes alone and the failures are
Prisma errors in `insertServerPet`, which this diff never touches. Whether `test:all` is green on
master was not checked.

- [x] `/code-review high` on the slimmed diff, 2026-10-13. Seven findings. Two of my own comments
      had become false the moment the form was reverted — the `usePetTableController` fix claimed
      both stores recompute age, and `petStore` on master writes the typed string verbatim, so
      deriving only the rendered row made the table and `localStorage` disagree. Reverted it.
- [x] The docstring naming the SQL transcriptions was wrong on both path and claim: the contract
      half was renamed and does **no** date arithmetic. Only the expand file is a transcription.
      Rewritten to name one file, on its branch, and to say the Malay vocabulary does not agree.
- [x] Dismissed one finding by probe: `new Date("2026-02-30")` is valid in V8, so the pre-PS-114
      check accepted it identically and returned the same string. No regression.
## Explicitly NOT done

- **The `minggu` regex, the admin-save flag downgrade, and the Malay/SQL vocabulary gap.**
  All three are recorded as ledger entries rather than fixed here: anchoring that regex moves the
  arithmetic three implementations were aligned on, and the flag downgrade is PR #94s to land.
  `tasks/open/malay-age-units-outpace-the-backfill.md`,
  `tasks/open/every-admin-save-downgrades-an-exact-birthday.md`.

- **The form.** Reverted to master in full — `PetFormDialog`, `actions/pets.ts`, `petStore.ts`,
  `validations/pet.ts` and the component test. PR #94 owns it. `tasks/open/pet-form-has-no-birth-date-field.md`
  is restored here because this branch no longer settles it; #94 deletes it.
- **`tests/unit/petBirthDate.test.ts` deleted rather than kept.** Its `createPet`/`updatePet`
  cases assume `age`/`ageCategory` are still in the form schema, which #94 removes. Offered to
  that session case by case instead of left here to rot.
- **No migration.** Two already exist. This branch touches neither.
- **`hasAgeUnit` dropped.** It existed only to serve the dialog's age→birthday derivation, which
  #94 removes; keeping it would have shipped an exported function with no caller.
- **`/(\d+)\s*m/` matching "3 minggu" (Malay for *weeks*) as three months.** Real, found by the
  expand session, refused at the migration so no production row carries it — but still wrong on
  the fixture path. Left alone deliberately: anchoring that regex changes the very referent all
  three implementations just agreed on, and it deserves its own change, not a ride-along.
# Pet birth date — production conversion and the form that feeds it

**Branch:** `worktree-pet-birth-date-migration` · opened 2026-09-22
**Brief:** a five-step plan in the session prompt, revised before execution — see Review.

## Items

- [x] Audit the brief against `origin/master` rather than the main checkout, which was three
      commits behind. Step 1 was already done: the owner applied `20260917_status_enums` on
      2026-09-18 and the drift entry records the re-measurement.
- [x] Establish what the remaining pet drift actually costs. Probed the SQL Prisma emits with a
      recording `pg` pool and no database: `pet.findMany` selects `birthDate`, production has no
      such column, the error is swallowed, and the catalogue falls back to `src/data/pets.json`.
- [x] `prisma/migrations/manual/20260922_pets_birth_date_contract/` — `migration.sql`,
      `rollback.sql`, `cleanup.sql`, `rehearse.mjs`. **Restructured as the contract half** after
      the owner chose expand → soak → contract: it archives `age`/`ageCategory`/`birthDate`/
      `birthDateIsEstimate` and drops the two old columns, and derives nothing. Folder renamed
      from `20260922_pet_birth_date` — one letter from the expand half's name was a hazard.
- [x] `prisma/migrations/manual/20260922_settings_and_defaults/` — the additive remainder, so the
      drift has one answer rather than a leftover.
- [x] Rehearse on embedded PostgreSQL 17 (pglite; no Docker daemon, no local PostgreSQL). **42
      checks, all green**, harness committed as `rehearse.mjs`. Four real bugs found and fixed:
      interval arithmetic vs JS date overflow; `CURRENT_DATE` vs UTC; `"500 years"` backfilling
      silently to 1526; and an impossible `intakeDate` aborting without naming the row.
- [x] Audit against the parallel branch `fix/pets-birth-date-production-migration`, found late.
      It is the **expand** half (never drops); this folder is the **contract** half. Verified they
      compose by running mine against a table it had already migrated.
- [x] Form and write paths: `birthDate` + `birthDateIsEstimate` collected, `age`/`ageCategory`
      derived read-only; `createPet`, `updatePet` and the client store carry the date through.
- [x] Gates: `typecheck`, `test` (1580), `test:components`, `test:integration` (59), `lint`
      (0 errors, no new warnings), `docs:check`.
- [x] `/code-review high`, round 1. Six findings, five fixed, one filed. The medium one defeated
      the migration's headline promise: against a table where someone had already added
      `birthDate` by hand to stop the read storm, the file derived every date, discarded it,
      dropped `age` and reported success. Now refuses with a remediation hint the rehearsal
      executes. Rehearsal 42 → 46 checks.
- [x] `/code-review high`, round 2, on the fix commits — because a fix round is unreviewed code,
      which is what `2026-09-08-a-security-fix-needs-an-adversarial-pass-of-its-own...` says and
      what PR #38 ignored. Five more findings, all fixed. The archive carried the birth date and
      dropped `birthDateIsEstimate`, so a rollback plus re-apply silently demoted a known birthday
      to an estimate while `rollback.sql` claimed nothing was lost. Fix verified by mutation.
      Rehearsal 46 → 48 checks.
- [x] Ledger: two decisions, five lessons, two new open entries,
      `pet-form-has-no-birth-date-field.md` deleted, the drift entry updated and left open.
- [x] **Decided, with owner's authority: expand → soak → contract.** The parallel branch's file is
      the expand half and never drops; this one is the contract half. Reversed this session's own
      position on the arithmetic — expand's clamping stands, because once the contract derives
      nothing there is no second rule to keep in step, and the dispute was 1–3 days on a value
      already flagged an estimate. Raised directly with the other session.
- [x] Verified the real sequence end to end against `fix/pets-birth-date-production-migration` at
      `77510c5`: expand applies, contract applies on top, archive holds five rows with zero birth
      dates differing from expand's, contract rollback restores every age while `birthDate`
      survives. This also caught that review round 1's guard had **broken** the composition.
- [ ] **Owner applies expand, leaves a soak window, reads the derived birthdays against the age
      prose, then applies contract**, then `cleanup.sql`. Nothing further can be authored here.
- [x] Both peers answered. The expand session agreed the split, took the roll-forward argument
      this session had *withdrawn*, and changed expand to match `approximateBirthDate` (`b40a7d7`)
      — re-verified: 0 of 5 rows differ. They also now refuse Malay tokens outright. Their session
      has ended; branch is final.
- [x] PR #42 yielded the form to #94, and found a real defect in it by reading the description:
      `birthDateIsEstimate` defaulted on every parse, so an update omitting it demoted a known
      birthday to an estimate. Probed, fixed, pinned. They were also about to make
      `approximateBirthDate` clamp, which would have re-diverged the just-agreed expand; asked
      them to drop it.
- [x] Corrected a stale figure this session published about PR #42 (166 files / −13,546) — it was
      measured against an old tip; the honest number is 17 files / +1048 / −72, clean and green.

## Review

**The brief was revised, not executed.** Five of its assumptions did not survive contact:

1. *"Review `20260917_status_enums` for readiness"* — already applied to production on 2026-09-18.
   The main checkout was at `b44f857`, `origin/master` at `8d36ace`, and the intervening commits
   held the re-measurement. Lesson filed.
2. *"Design a migration to replace `age`/`ageCategory` with `birthDate`"* — the schema did that on
   2026-08-28 (`6108d82`). The gap was production DDL, not schema design.
3. *"Do not hardcode a birthday like '2024-01-01' without marking the estimate"* — right instinct,
   wrong artifact. `'2024-01-01'` is the `@default` on `prisma/schema.prisma:78`, which is why
   `db push` emits it. The column keeps it (or drift never clears); no row receives it.
4. *"Prepare a reversible migration with `migration.sql` and `rollback.sql`"* — a rollback of a
   `DROP COLUMN` restores nothing unless something kept the values. Hence the archive table, and
   the third file that drops it.
5. *"Settle both open entries into `tasks/decisions/`"* — only one could settle. The drift entry's
   own "Settles when" requires production to be reconciled, and an agent cannot reach it.
   Recording it as settled would have been a conclusion without evidence.

**The finding that changed the priority.** The pet conversion had been filed as pending hygiene
for nineteen days. It is not: production's pet catalogue is being served from the JSON fixture,
because the deployed client asks for a column production does not have. That is the same failure
shape as the 2026-09-16 application-insert finding, one table over, and it means every pet the
shelter has added or edited since the schema change is invisible on the live site.

**The mistake worth recording.** Neither this session nor the concurrent one listed the branches
before writing a migration, so the same conversion was authored twice on the same day. The audit
was one `git branch -a` and one `gh pr list`. `tasks/open/` could not have warned either session —
an entry records what is known, not who is acting on it — and the `open/CLAIM-*.md` the ledger
contract provides for exactly this went unwritten by both. Lesson filed. The salvage: reading the
other branch adversarially found two real defects in this one, because its edge-case list differed.

**Deliberately not done:**

- **Not applied.** `.claude/settings.json` denies agents `npx prisma migrate*` and `db execute*`,
  and this session had no production access. Both files are rehearsed and unapplied.
- **`getServerPetsAsync`'s missing `select` left as it is.** Narrowing it would hide this class of
  failure rather than fix it, and the fallback-trigger question is its own open entry.
- **`Pet.age` not made bilingual.** `ages-render-in-english-on-malay-site.md` stays open; it is a
  cross-module type-contract change, not a ride-along.
- **`intakeDate` left as `z.string().min(4)`** rather than tightened to `isoDateSchema`.
- **The archive is not dropped.** `cleanup.sql` is a deliberate human step, and until it runs
  `db:check-drift` will report one statement. Said out loud rather than hidden.
- **No e2e coverage added.** `e2e/pages/AdminPetsPage.ts` has no field fillers and the pet
  lifecycle spec never opens the form; building that out is its own task.
# An approval marks the id it asks for

**Branch:** `worktree-pet-mirror-ordering` · opened 2026-09-22 · ROUTINE lane
**Closes:** `tasks/open/a-public-post-can-reorder-the-pet-mirror.md` — filed by
`worktree-adoption-submit-guards`, landed on master with PR #93, deleted by the merge commit on
this branch. It was deliberately left undeleted in #93: that PR does not fix the ordering, and
closing a live defect's public issue with nothing on master behind it is worse than the
duplication.

## Items

- [x] Ownership check before starting, because the defect was handed over rather than found here:
      no open PR (#93, #94, #42) touches `petRepository.ts`, `applicationRepository.ts` or
      `persistenceMode.ts`, and the filing session said explicitly it left the file alone.
- [x] Reproduced before fixing. Two `Bella`s in the mirror, the decoy read once through the
      public path, and `markCachedPetAdopted("itest-bella-asked-for", "Bella")` returned
      `itest-bella-decoy`.
- [x] Fix: try the id against the whole array before the name is tried at all. Three lines.
- [x] `tests/integration/approvalMarksTheAnimalItAsksFor.test.ts`, 6 tests. `markCachedPetAdopted`
      had **no test referencing it at all** before this.
- [x] Reverted a `trim()` that crept into the name comparison — widening how names match is a
      different question from which identifier wins.
- [x] Corrected the "cosmetic" claim in the previous stream's decision entry, as a new dated
      entry naming it rather than a rewrite.

## Review

**The defect was found by a reviewer on someone else's branch, reviewing my change.** That is the
part worth recording. `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md` had
called the mirror reordering cosmetic; I carried that judgement forward into the decision entry
that settled it, unchecked, and it reached a public GitHub issue and a docstring. The adoption
session then grepped for readers of `serverPets` and found one that turns the reordering into a
wrong audit row.

The audit row is what makes it serious, and I had not looked at the caller.
`atomicUpdateApplicationStatus` writes the returned pet's id into
`PET_STATUS_TRANSITION_ADOPTED`, so a wrong match is a permanent wrong record rather than a cache
entry the next hydrate repairs.

**Deliberately not done:**

- **The read still reorders the mirror.** The open entry offered that as an alternative repair. It
  is load-bearing — during an outage that array *is* the catalogue, and recency-first is what
  lets a recently viewed animal survive — and it would not have fixed the defect, since two
  same-named animals with no id match are still resolved by position. Reasoned out in the
  decision entry rather than left implicit.
- **The residual is stated rather than filed**, and narrower than this list first claimed. With
  **no** `petId` at all and two animals sharing a name, order still decides. An *unmatched*
  supplied id no longer falls back at all — it returns null, pinned by
  `approvalMarksTheAnimalItAsksFor.test.ts` — so saying "empty or unmatched" overstated it and
  contradicted the decision entry, which is the file a later session trusts. No action closes
  what is left short of refusing ambiguous name matches, which breaks the legacy applications
  the fallback exists for.
- **P2003 not touched.** The same session suggested `handlePersistenceError` treat Prisma's
  foreign-key violation like its unique violation — always rethrow — so an adoption application
  cannot be accepted, given a reference code, and then silently lost. The analysis is in their
  entry and my assessment went back to them; it is a change to *every* repository write, and
  mixing it with a three-line cache fix would make both harder to review. It stays theirs.

# Adoption submissions validate their target animal

**Branch:** `worktree-adoption-submit-guards` · opened 2026-09-22 · base `8d36ace`
**Settles:** `tasks/open/submit-application-checks-a-fixture-and-no-status.md` (deleted with this work)

## Items

- [x] Audit the brief against the tree before implementing. All three server gaps and both client
      halves confirmed live at `src/actions/applications.ts:107-114` and
      `src/hooks/useAdoptionFormController.ts:60-61`. Nothing in flight on either file.
- [x] Gap 1 — `findServerPetByIdAsync`, so the archive flag comes from Postgres, not `pets.json`.
- [x] Gap 2 — reject a pet that is not found, **and** one whose id is not exactly the one posted.
      The swap alone does not close this; see Review.
- [x] Gap 3 — reject any pet whose `getPetStatusPresentation(status).isAdoptable` is false.
- [x] Moved the lookup behind both rate-limit budgets — it became a database query.
- [x] `resolveDefaultPet` uses `isAdoptable` and drops the `allPets[0]` last resort; the
      controller's `availablePets`, one line below, had the same raw comparison and now matches.
- [x] `tests/integration/adoptionSubmissionGuards.test.ts` — 10 strict-persistence tests.
- [x] `tests/unit/adoption/resolveDefaultPet.test.ts` — 7 tests; the function had none before.
- [x] Mutation-tested: four independent reverts, each turning red exactly the tests that name it.
- [x] Updated the `PetGallery` comment that cited the deleted ledger entry as its open reason.
- [x] Ledger: decision entry, two new open entries, one lesson. The neighbouring fixture-fallback
      entry is deliberately left untouched — see Explicitly NOT done.
- [x] `/code-review high` on the whole diff. Five findings, each checked by probe and all upheld;
      two fixed in code, three filed. See Review.
- [x] `/code-review high` again on the fix commit, which is where this repo's last three defects
      were. Five more findings, all upheld: one fixed (`petBreed`), four filed.

## Review

**The brief's step 1 was insufficient as written, and that is the finding.** Swapping
`findServerPetById` for `findServerPetByIdAsync` does not by itself make the check read the
database. That reader falls through to the `pets.json` mirror after a *successful* query that
found no row, and the mirror matches ids case-insensitively where Postgres does not — so a posted
`PET-001` missed the database, matched fixture `pet-001` (Available, unarchived there), and the
application was accepted against an animal the database had archived. The exact-id guard is what
closes it, which is what `getPetById` already does. The brief named exact-id matching; what it did
not say is that without it the swap is close to cosmetic.

**A regression the fix would have introduced.** The pet lookup ran *above* the rate limits, which
was free while it scanned an in-memory array and is a Postgres round trip once it does not.
Swapping in place would have handed an anonymous POST one `findUnique` per request with no budget
in front of it. Moved behind both budgets and pinned by a test that exhausts the email budget and
asserts `findUnique` was never called. That test is the one that goes red if someone moves it back.

**Every test discriminates.** Each rejection case is arranged under `pet-001` — a real row in
`src/data/pets.json`, Available and unarchived there — because an `itest-` id is absent from the
mirror too, so the assertions would pass against the broken action for the wrong reason. Proven by
probe rather than asserted: restoring `origin/master`'s action turns 6 of 10 red; disabling only
the status check turns exactly the 3 status tests red; removing only the exact-id match turns
exactly the case-variant test red; moving the lookup back above the budgets turns exactly the
rate-limit test red; restoring `|| allPets[0]` turns 3 of the 7 unit tests red.

**The suites are flaky under load, and it cost time here.** Seven other sessions were running in
this repo concurrently. Single runs of `--project unit` reported 63, then 72, then 12 failures
across *different* unrelated files each time, then 1587/1587 green on an unchanged tree; the
components tier failed two files with `Hook timed out in 10000ms` inside the `nextMocks.ts`
`beforeEach`. `vitest.config.mts` raises `testTimeout` to 20s but never sets `hookTimeout`, so
setup hooks keep the 10s default. Nothing here was a real failure — every file passed in isolation
— but the first instinct was to suspect this diff. A parallel session has filed the run counts;
not duplicated here. Rule of thumb: one failure each across unrelated files means load, not you.

**The review found the defects in what gets *written*, not in the check.** The guard itself held up.
Five findings, each verified by probe before being accepted:

- **The record stored the request's `petId`, untrimmed, while the guard compared the trimmed
  copy.** `applicationFormSchema` is `z.string().min(1)` with no `.trim()`, and the column carries
  a foreign key to `Pet.id`. A posted `" pet-001 "` passed every new check, then hit P2003 on
  insert — which `handlePersistenceError(…, "write")` swallows outside strict mode. The row never
  reached the database, lived in the mirror until the next restart, and the applicant got
  `success: true` and a reference code. Pre-existing, but the trim I added made it reachable
  through a guard that had just declared the animal valid. Fixed: write `pet.id`.
- **The record stored the request's `petName` too** — and I had filed that as "low severity",
  which was wrong. `atomicUpdateApplicationStatus` auto-rejects other open applications matching
  on `petName` *as well as* `petId`, and `markCachedPetAdopted` marks the first pet matching
  **either** id or name. So a submission naming a popular animal it was not for could close that
  animal's real applications on approval and flip the wrong pet to Adopted. Fixed: write
  `pet.name`; the open entry I had filed is deleted as settled. This is the finding that would
  have stopped the merge — it changed what my own ledger entry claimed.
- **My `availablePets` comment was false.** It claimed the list the form offers and the animal it
  opens on cannot disagree; the list has no consumer at all, and the wizard's `<select>` renders
  `allPets`. Comment corrected to say so rather than deleting the variable — this is the file where
  calling something dead cost a real defect once already.
- **Two form gaps** — `/adopt?petId=` preselects any public animal with no status filter, and a
  null `defaultPet` leaves the field empty while the select still lists every animal. Both filed.

Both code fixes are pinned by new tests that were mutation-checked: reverting `pet.id` and
`pet.name` turns exactly those two red and nothing else.

**The second review paid for itself, which is the whole argument for reviewing fix commits.** It
found five more, none of them in the guard:

- **`petBreed` was never written at all** — not by this change, by anything. The column's schema
  comment calls it a snapshot with "the same rationale as petName", existing so the record survives
  `petId` going null under `onDelete: SetNull`; the tracking portal's `pet?.breed || app.petBreed`
  was carried entirely by re-reading the live animal, so it showed nothing once that animal was
  gone — precisely the case the column is for. Fixed and mutation-checked. Same class as the first
  review's two findings: I had fixed the fields it named and not asked what else the draft owed the
  verified row.
- **The silent-success shape is worse than "a fixture animal can be applied for."** When the mirror
  answers, the application is written against an id the `Pet` table does not hold, the insert raises
  P2003, `insertServerApplication` swallows it, and the applicant gets `success: true` and a
  reference code for a row that reached no database. Disclosed at the guard and filed as
  `tasks/open/an-application-can-succeed-against-no-database-row.md`, with the observation that
  treating P2003 like P2002 is probably the smaller fix.
- **A public POST can now reorder the pet mirror**, because the reader rewrites it before any check
  runs, and `markCachedPetAdopted` takes the first entry matching *either* id or name. Two animals
  sharing a name and an approval can flip the wrong one. Filed rather than fixed: the repair is in
  `petRepository.ts`, which a parallel session was editing at the time.
- **The guard duplicates `getPetById`** — and so did my comment, three paragraphs of it. The
  comment now points at that one instead of restating it, so the two copies cannot drift into
  disagreeing explanations. Left as two copies deliberately; `AGENTS.md` says wait for a third.
- **The client store keeps what it posted** while the server records what it verified. Folded into
  the form entry.

**Merging #89 silently uncovered this branch's exact-id guard, and the probe caught it.** That PR
made `findServerPetByIdAsync` return `null` after a successful empty read. The case-variant test
here arranges `findUnique` to miss, so after the merge it is refused by `!pet` and never reaches
`pet.id !== requestedPetId` at all — **deleting the comparison left all 83 integration tests
green.** The guard was one cleanup away from being deleted as dead with a green build behind it.

The comparison is still load-bearing, on a narrower route: where no database is configured, or a
read threw and was swallowed, the mirror answers and its lookup lowercases while Postgres does not,
so `PET-001` resolves to fixture `pet-001`. Two tests now reach it that way (`STRICT_PERSISTENCE`
stubbed off so `isDatabasePersistent()` is false), one refusing the case-variant and one confirming
the exact id still works — the positive control, so a reader that refused *everything* on that
route could not pass. Re-probed after: deleting the comparison now fails exactly one test.

No lesson written for this: the parallel session had already filed
`tasks/lessons/2026-09-22-a-fix-can-silently-retire-the-test-that-guarded-the-thing-it-did-not-fix.md`,
whose rule is the one followed here, and a second copy is the duplication `AGENTS.md` warns about.

**The third review found the status check's floor, and it is lower than the code claimed.** The
guard's comment said an unrecognised status "resolves to the `pending` presentation, so it fails
closed". That is true of `getPetStatusPresentation` and false of the path that reaches it:
`fromDbPetStatus` compares four exact, case-sensitive spellings and returns `"Available"` for
everything else, so nothing unknown ever arrives at the fallback from a database read. A column
holding `adopted` presents as Available, `isAdoptable` is true, and the guard passes the animal it
exists to refuse — on a production branch that has held `Pet.status` as text rather than the enum.

Comment corrected, gap filed as `tasks/open/an-unknown-pet-status-reads-as-available.md`, and
pinned by a test named "does NOT yet refuse…" so it is found when the mapper is fixed rather than
discovered again. Not fixed here: the default sits in a mapper every pet read goes through, so
changing it is a catalogue-wide behaviour change, and what it should become is a real question —
`Pending` fails closed for adoption but files the animal in the adoptable track, throwing turns one
bad row into a failed render, and a fifth `Unknown` status touches every surface.

This is the one finding across three reviews that reached the PR's own claim. It does not defeat it
— before this change *no* status was checked at all — but "rejects a pet that is not adoptable" is
now stated with its floor: as far as the mapper can tell one.

**Rejecting `Pending` is a product call, and it was already made.**
`tasks/decisions/2026-09-10-pending-is-a-stage-of-adoption-not-a-track.md` files Pending in the
adoptable *track* while the detail page renders its button disabled on purpose. `isAdoptable` is
true for `Available` alone, so the server now agrees with the button rather than deciding anew.

## Explicitly NOT done

- **The repository-level fallback fix.** `findServerPetByIdAsync` still serves the fixture for an
  id a populated database lacks, so a `pets.json` animal can still be applied for. That residual
  is stated in a comment at the guard. Not fixed here because it changes every caller at once,
  including `src/actions/sponsorships.ts` — a public write path with no covering test — inside a
  change whose claim is about adoption. A parallel session is landing exactly that fix
  (`worktree-pet-missing-row-is-an-answer`, `97df591`), which also *closes* that ledger entry by
  deleting it. The two branches were merged locally and verified together at that commit:
  typecheck clean, unit 1589, integration 79 (this branch's 10, theirs, and the existing 59). That
  branch has since moved past `97df591`, so the measurement is pinned to the commit it was taken
  against rather than to a moving tip. A note recording "third guarded caller" was drafted onto that entry and
  then withdrawn — modifying a file the other branch deletes is a modify/delete conflict, and a
  conflicted PR gets no CI run at all. The relationship is recorded in the decision entry instead.
  The remaining collision is `tasks/todo.md`, which both branches prepend to; that is the known
  defect named in this file's own header, and whoever lands second resolves it.
- **The form's stale `petId`.** Dropping `allPets[0]` makes `null` reachable in one more case, and
  the form only syncs its fields when handed a real pet, so a reopen inside the close animation can
  still carry the previous animal's id. The dangerous half is closed — the server refuses it — and
  the confusing half is `tasks/open/adoption-form-keeps-a-stale-pet-id-when-it-opens-on-nobody.md`.
  Not fixed blind: both obvious repairs discard a half-filled form or submit for an unchosen
  animal, and no test covers that path.
- **`lookupApplicationStatusAction`'s mirror read** at the same file's line 505. Read-only display
  enrichment that already falls back to the application's stored `petBreed`; a mirror hit costs a
  stale breed and photo, not a wrong write.
- **Narrowing the form's pet `<select>` to adoptable animals.** The server refuses them now, but
  the wizard still renders `allPets`, so the refusal lands after four steps rather than at the
  point of choice. Not one line: the control must still hold whatever `selectedPet` put in the
  field, and `/adopt?petId=` puts a non-adoptable animal there on purpose. Filed with the two
  related form gaps as
  `tasks/open/the-adoption-form-offers-animals-the-server-will-refuse.md`.
- **The outage half of the fixture fallback.** The guard reads the database whenever the database
  answers. When the query *throws*, `handlePersistenceError` swallows it outside strict mode and
  the mirror answers under the posted id, so an outage still accepts applications against fixture
  animals at fixture status. That fallback is required by
  `tasks/lessons/2026-09-04-a-dual-layer-fallback-must-never-let-a-swallowed-database-error-fail.md`,
  so it is a policy question rather than a bug here. The first draft of the decision entry claimed
  `97df591` closed "the residual"; it closes the missing-row half only, and the entry now says so.
- **`selectedPet` is still returned without a status check.** Opening the form from an animal's own
  page should headline that animal; the server is the boundary that refuses the submission.
- **No component test for the `defaultPet === null` render.** The dialog title already branched on
  it and `allPets` is empty on a cold `/adopt` render, so the state was reachable before this
  change; the new behaviour is covered at the unit level instead.
# A pet the database lacks stops being served from the fixture

**Branch:** `worktree-pet-missing-row-is-an-answer` · opened 2026-09-22 · ROUTINE lane
**Closes:** `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`

## Items

- [x] Audit the brief against `origin/master` 8d36ace before writing anything. Four of its five
      steps needed revising; step 3 was already satisfied and step 4's test shape would not have
      discriminated.
- [x] `findServerPetByIdAsync` returns `null` after a successful read that found nothing. One
      line; the `catch` and the no-database path are untouched.
- [x] `tests/integration/petMissingRowIsAnAnswer.test.ts`, 10 tests, every one on `pet-001`.
- [x] Probe: pre-fix reader put back, suite run, 3 failures observed, fix restored.
- [x] Three stale comments repaired — `prismaDouble.ts`, `faqEmptyPublishSet.test.ts`,
      `pets.ts` — all describing a `length > 0` trigger that no reader has used for weeks.
- [x] Ledger: decision entry; `pets-json-fallback-empty-means-outage.md` narrowed to the two
      readers that remain; one lesson.
- [x] Collision check against the nine live worktrees. `worktree-adoption-submit-guards` is
      closing `submit-application-checks-a-fixture-and-no-status.md` right now; a note written
      there was reverted rather than shipped into a modify/delete conflict.
- [x] Gates: `typecheck`, `test:integration` (70), `test:components` (170), `lint` (0 errors),
      `docs:check`. `npm test` is reported separately — see Review. CI is the authority for the
      two that cannot run here: `Strict persistence against Postgres` and `Playwright golden
      paths` both passed on PR #89.
- [x] `/code-review high` on `origin/master...HEAD`: 4 findings, all verified by probe, 3 fixed
      in `06393d3` and the fourth refiled as an open entry. Second review round on that fix
      commit, per the standing order that a fix round is unreviewed code.
- [x] Merged `origin/master` after #88 landed mid-session. The merge-check was clean, and the
      clean result was not taken as the answer: `tasks/todo.md` is the one file both sides
      touched, and it was read afterwards to confirm neither stream was dropped — `git diff
      origin/master -- tasks/todo.md` shows no removed lines, so this copy is a superset of
      theirs. #88 touches no `prisma/` path, so no `db:generate` was needed before re-running
      the gates.

## Review

The brief asked for five things and four of them were wrong about the repository, which is the
part worth recording.

**Step 3 — "verify callers return 404/error" — was already true.** `getPetById` has returned
`null` on a falsy pet since PR #38 and `createPetSponsorshipAction` has returned
`{success: false}` since it was written. Neither was edited. Editing them would also have
collided with `codex/sponsorship-contract`, an unmerged branch that rewrites
`src/actions/sponsorships.ts` wholesale — worth checking for before touching a file, not after.

**Step 4's suggested test would not have failed against the bug.** The brief pointed at
`softDeleteFiltering.test.ts`, whose own comments already document why: an `itest-` id is absent
from the fixture mirror too, so the reader returns `null` for it either way. Every test in the
new suite uses `pet-001`, a real row in `src/data/pets.json`, unarchived there.

**The decision was not actually open.** Both the open entry and `prismaDouble.ts` described
`getServerPetsAsync` as gating its fallback on `rows.length > 0`; it has not done that since it
was fixed, and `softDeleteFiltering.test.ts` pins the current behaviour. So the catalogue and the
profile disagreed about the same table, and the profile was the odd one out — which turns "should
a missing row fall back?" from a policy question into a consistency defect. That is the whole
argument for the one-line change, and it was sitting in the repository rather than in the brief.

**Deliberately not done:**

- **`src/actions/sponsorships.ts` untouched.** A genuinely unknown `petId` now gets
  `SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE` — "we could not confirm your pledge" — which invites
  a retry that can never succeed. It is the wrong message for the case, but it is the right
  *outcome*, the file is being rewritten on another branch, and a copy change is not this task.
- **`submitApplication` untouched, and its open entry left alone.** Another session is closing
  both on `worktree-adoption-submit-guards`, off the same base commit. The two changes compose —
  their caller switch plus this reader fix — but neither is complete alone: on their branch a
  fixture id still resolves, because they inherit the pre-fix reader. The paths are disjoint, so
  the merge will be clean and will prove nothing; whoever lands second runs the other's suite.
- **The mirror is still rewritten on every public profile view**, so during an outage the
  catalogue's order follows recent profile views. Carried into the decision entry rather than
  fixed: it is cosmetic, and the sync is what lets a later outage serve a recently viewed animal.
- **Tier 3b (`npm run test:db`) not run** — no Postgres on 5432 here, and
  `tests/integration/db/` has no pet-read coverage, so it could not have exercised this.
- **`npm run build` not run.** The worktree has its own `npm ci`, so it could have been; it was
  left out because nothing here touches a route, a component or the Prisma schema, and the build
  would only re-prove what `tsc --noEmit` already proved. Named rather than implied.
- **The unit suite was not made to pass, because it does not pass on `master` either.** Five runs
  in ninety minutes: `1580 passed (1580)`, then `57 failed` on the same tree, then `54 failed`
  on the main checkout carrying **none** of this branch's changes, then `1819` green across all
  three projects from a review sub-agent, then `8 failed` after the merge — on a set of files
  *disjoint* from the earlier failures, one test in each of eight unrelated domains.

  Two measurements pin it as order-dependence rather than breakage, and they point opposite
  ways: the eight files from the last run pass when run together alone (`8 passed`, `156
  passed`), and `tests/unit/volunteerForm.test.ts` fails when run alone (`4 failed | 10
  passed`) on both trees while passing inside the full suite. One group needs the suite, the
  other needs to avoid it.

  Filed as `tasks/open/unit-suite-is-order-dependent-in-both-directions.md` with all five counts
  and both repros. Not fixed here: it is not this change's defect and it is its own task. The
  claim this branch can actually make is the narrow one — every deterministic gate passes, the
  new suite passes in every run it appeared in, and the gate that is not deterministic is
  reported as such rather than as a pass.

## Review round

`/code-review high` found four, none touching the fix. Each was checked by probe before being
accepted, per the standing order:

1. **Sponsorship checkout accepts an archived animal** — confirmed by `grep -n "isArchived"
   src/actions/sponsorships.ts`, which returns nothing. The settled entry had recorded this and
   the decision entry replacing it had not carried it, so it would have left the ledger with the
   file. Refiled to `open/`, where it mirrors to a public issue. Not fixed: it is a caller check,
   and the caller is being rewritten on `codex/sponsorship-contract`.
2. **The `getPetById` comment understated its own guard**, saying the exact-id check covers "the
   no-database path" when the `catch` path reaches the same case-insensitive mirror. Fixed — and
   pointed at, because this branch's lesson is precisely that comments become the spec.
3. **`not.toHaveBeenCalled()` depended on test declaration order** — the ledger `vi.fn()` is
   built once in the module factory and no config clears it. Fixed with `vi.clearAllMocks()`.
4. **`@/lib/email` was mocked wholesale**, leaving twelve of fourteen exports undefined for the
   next test that needs one. Fixed with `importOriginal` and a spread.

The reviewer also ran the probe independently and reproduced the same three failures, which is
the part of its report worth more than the findings.

### Second round, on the fix commit — and it was right to insist

The standing order says a fix round is unreviewed code. It found five more, and this is the part
of the stream worth reading:

1. **The exposure is still open on the outage path.** `handlePersistenceError` rethrows only
   under `STRICT_PERSISTENCE`, which nothing outside `vitest.config.mts` and one npm script sets
   — so in production a transient read failure serves fixture `pet-001` at its exact URL and
   bills a pledge against it. The decision entry had filed this under "what this deliberately
   stops serving", as a *virtue*, and not under "not closed by this". The code was right and the
   claim was wrong, which is the more dangerous of the two. Filed as
   `tasks/open/an-outage-serves-and-bills-fixture-animals.md`; framing corrected in place.
2. **Three comments I had just written were factually wrong about other functions** —
   "the same trigger `getServerPetsAsync` uses" (it has no `isDatabasePersistent()` gate at all),
   "all three fall back only from their `catch`" (contradicted by a test in the same commit), and
   the exact-id guard "covers" both mirror routes (it refuses a case-variant and nothing more).
   This stream's own lesson is about exactly this, and I reintroduced it within the hour. The
   lesson now says so and carries a stronger rule: a comment naming another symbol is a claim
   that requires opening that symbol, not recalling it.
3. **A test pinned the repair shut.** "Leaves the mirror holding the fixture it declined to
   serve" also asserted that the reader may never evict the denied id — which is the cheapest fix
   for finding 1. It now asserts a *different* fixture id survives, proving the suite has not
   simply lost its fixtures without forbidding the improvement.
4. The wrong checkout message is **newly reachable because of this change**: `if (!pet)` was
   nearly dead before, and is now the normal answer for a hard-deleted animal, telling supporters
   to chase a bank reference for a pledge nothing attempted. Recorded on the sponsorship entry.

The probe was re-run after the test edit — same 3 of 10 fail against the pre-fix reader — because
changing an assertion invalidates the earlier discrimination evidence.

### Third round, before the merge — and it stopped the merge

Run against the whole diff once the PR was open. Five findings; one of them was the reason this
list insists on a review per fix round.

**The change had silently retired the test guarding `getPetById`'s exact-id check.** That guard
was pinned by `softDeleteFiltering.test.ts`'s case-variant test, which arranges `findUnique` to
resolve `null` for `PET-001`. Against the old reader that null reached the case-insensitive
mirror and the guard refused the result; against the new reader the empty read returns `null`
first and the guard is never reached. Measured, not argued: deleting `pet.id !== requested` left
**69 of 69 integration tests green**. Two earlier reviews missed it, and so did I — the line is
still executed, just never decisive, so nothing flags it. A comment in the same commit said "do
not delete this guard", which is a note, not a test.

Closed by a new test that reaches the guard the way production still can — no `DATABASE_URL`, and
a non-strict outage — with a positive control asserting `/pets/pet-001` *does* resolve on the same
route, so a reader that refused everything could not pass it either. Verified by probe: removing
the guard now fails that test, where before it failed nothing. Integration is 70, not 69, for
this reason. Lesson written:
`tasks/lessons/2026-09-22-a-fix-can-silently-retire-the-test-that-guarded-the-thing-it-did-not-fix.md`.

The other four were narrower and all confirmed: a test of mine whose comment claimed coverage it
did not provide (`resetServerStore()` reseeds the array it asserts on, so it holds even against a
reader with no fallback); a `prismaDouble.ts` comment saying the no-database door is unreachable
under that double when this branch's own test walks through it; a docstring naming one place
`STRICT_PERSISTENCE` is set where the branch's own ledger entry names two; and the checkout
rejection being pinned only as `success: false`, which locks in a message that tells supporters to
chase a bank reference for an animal that never existed. The first three are fixed. The last is
recorded on the sponsorship entry rather than fixed, because that file is being rewritten
elsewhere.

Three of the five were, again, prose asserting something about code — the failure this stream
already wrote a lesson about, found twice more after writing it.
# `pets.age` → `birthDate`: the production migration — the other half of the schema drift

**Branch:** `fix/pets-birth-date-production-migration` · opened 2026-09-22 · cut from
`origin/master` 4782ff2, **not** from PR #42 — see "Deliberately not done" for why.

- [x] Audit the brief before implementing it. Three of its four premises did not survive: see the
      Review below.
- [x] `prisma/migrations/manual/20260922_pets_birth_date/migration.sql` — adds `birthDate` and
      `birthDateIsEstimate`, backfills both from the prose `age` production still carries, and
      relaxes the `age`/`ageCategory` NOT NULLs. Drops nothing.
- [x] `rollback.sql` beside it — restores the previous shape exactly, because `age` is never
      written to. Its header says plainly what it costs after go-live.
- [x] `rehearse.mjs` beside it — 92 checks on a throwaway embedded PostgreSQL 18.4 created UTF8,
      all passing,
      7 of them driving master's own generated Prisma client. **Kept, unlike the
      `20260917_status_enums` script**, so a reviewer can re-take the measurement.
- [x] `tasks/decisions/2026-09-22-pets-birth-date-backfills-from-intake-date.md` — the backfill
      rule, the expand/contract split, and the full check list.
- [x] Drift entry updated with the 2026-09-22 measurement, and one earlier claim in it corrected.
- [x] Six lessons: the lenient-parser trap, the superseded NOT NULLs, the stray-process sweep,
      the regex that finds a number beside a unit rather than the number, the token list whose
      one-letter alternative became a prefix match when it gained a second language, and the
      check that asserts a literal and hides the crash it was written for.
- [x] The `#46`/`#47` stream's one genuinely stale line: the enum migration is applied.
- [ ] **Owner: apply `20260922_pets_birth_date/migration.sql` in the Neon SQL editor.** Run the
      header's "before" query first — it names any row the file would refuse. Needs no merge.
- [ ] Owner (one minute, worth doing first): open `/pets` on the live site. Exactly the ten
      fixture animals at ids `pet-001`…`pet-010` confirms the catalogue is serving
      `src/data/pets.json`; anything else means the read works and the drift wants re-reading.
- [x] Later, its own file: drop `age`/`ageCategory` — the contract half. **Not written here on
      purpose, and now owned by PR #94** (`worktree-pet-birth-date-migration`), which archives
      `age`, `ageCategory` and `birthDateIsEstimate` before dropping and verifies this
      branch's dates by re-derivation. Sequence: expand (here) → soak → contract (#94).
- [ ] Owner: decide the soak length between applying this and applying #94's contract.

## Review

**The brief asked for two things. One was already done, and the other was bigger than described.**

- **Item 2 was already fixed.** It asked to correct `tasks/todo.md:21-22`, where `#72`/`#73` were
  said to be open. On master that line already reads "merged 2026-09-21" — the edit existed
  uncommitted in the main checkout when this session started and has since been committed. It also
  could not have been done where the brief said to do it: PR #42's branch predates the whole
  `#46`/`#47` stream, and its `tasks/todo.md` ends at line 17. What *was* stale in that stream is
  the enum-migration checkbox, ticked above.
- **The migration is not a rename.** The drift statement bundles an add+backfill (reversible) with
  a drop of `age`/`ageCategory` (not). Only the first half is data-preserving, so only the first
  half is here. `db:check-drift` will still report one destructive `pets` statement afterwards, and
  that is correct rather than a failure.
- **Adding `birthDate` alone would have left writes broken.** `age`/`ageCategory` are NOT NULL with
  no default in the schema production was built from, and the release writes neither, so pet
  creation would still fail — as `Null constraint violation on the (not available)`, naming no
  column. This is the part the brief's framing missed entirely, and check P7 exists to stop a later
  reviewer deleting the two `DROP NOT NULL`s as tidying.
- **The drift is very likely breaking reads right now, not just blocking a push.** Reproduced, not
  reasoned: master's own client answers `The column pets.birthDate does not exist in the current
  database.` against a production-shaped table, and `handlePersistenceError(…, "read")` swallows
  that into the `pets.json` mirror. ASSERTED for production itself — the `/pets` probe above is
  what would settle it, and nobody has run it.

**Two defects the rehearsal found in this session's own first draft**, both fixed: `to_date` raises
on `2024-02-31` rather than rolling it forward, so the validation built on a round-trip comparison
aborted without naming the row; and a failing multi-statement file leaves the editor session in an
aborted transaction, which the header now tells the reader to expect.

**`/code-review` then found six more, every one real, and the green rehearsal had not caught any of
them.** Worth recording because the rehearsal was thorough and still missed all six:

1. **A fractional age was silently read as the wrong number.** `"1.5 years"` backfills as **5**
   years — the patterns take the digit run beside the unit token, not the leading number. The
   plausibility bound passed it, no notice fired, and the follow-up file is scheduled to drop the
   `age` prose that would have revealed it. Now refused and named. Every rehearsal fixture had
   been `"N years"` or `"N months"`, because that is what the repo's seed data holds — so the
   fixtures tested the shapes that already exist, which is the set that never contained the bug.
2. **The header's pre-check listed only two of the four refusals**, so a clean pre-check could
   still be followed by an abort — defeating the one step the header calls unskippable. And the
   check named "names every row the file would refuse" tested neither missing case.
3. **The Malay-token equivalence claim was false**, and it was this session's own regression: the
   token list came from PR #42's `approximateBirthDate` and the work was then re-based onto
   master, whose version matches only `y` and `m`. Claim withdrawn, divergence named in both the
   header and the decision entry; the wider tokens are kept on purpose.
4. **Every disclosure was `RAISE NOTICE`**, which the Neon SQL editor is not documented to show —
   so the clamping the decision entry calls "made visible" might not have been. The After section
   now carries a query that reads the clamped rows out of the table.
5. **The snapshot was taken before any exclusive lock**, so a row inserted in that window would
   keep the `'2024-01-01'` default while the guard that exists to catch exactly that still passed.
   `LOCK TABLE ... ACCESS EXCLUSIVE` now precedes the read.
6. **The rehearsal reported any Prisma import failure as "no generated client" and exited 0**,
   which would have dropped its seven strongest checks silently on any machine but this one. It
   now reports the real error and a skip fails the run.

**A second review, on those fixes, found six more — every one real again.** Per the 2026-09-08
lesson that a fix round is unreviewed code written in a hurry, and it earned its keep:

1. **`"3 minggu"` — Malay for three weeks — was stored as three months.** Widening the token list
   to Malay turned the bare `m` alternative into a prefix match on any m-word; English
   `"3 weeks"` had always been refused correctly. Tokens are now anchored to a word boundary.
2. **`rollback.sql` could leave a column stricter than it found it.** Production's nullability is
   never measured, so if `age` was already nullable, apply was a no-op while rollback still
   restored NOT NULL — breaking pet creation in a state production was never in. The migration
   now marks what it relaxes and the rollback restores only marked columns.
3. **A rollback after go-live could make the migration inapplicable.** Post-migration pets have
   `age IS NULL`; dropping `birthDate` strands them, and one stranded row aborts the whole table
   on re-apply. Now named before the drop, with the `UPDATE` to undo it, and walked end to end by
   checks G6–G8.
4. **The advisory lock at the top of the file waited outside any timeout**, since the DO block's
   `lock_timeout` had not been set yet. Bounded by a `SET LOCAL` before it.
5. **The fraction guard scanned the whole string**, so `"2 years, 12.5 kg"` would have blocked the
   entire table with advice that did not fit the row. Narrowed to a fraction adjacent to a unit.
6. **`check("J3 …", true, …)`** — a summary line passing a literal `true`, so it printed `ok`
   whatever the loop found. That is the exact defect the comment two lines above it describes in
   an earlier revision of J1, reintroduced while fixing J1.

**The suite is now mutation-tested, not merely green.** Removing the fractional guard from
`migration.sql` fails C9, C10, C11 and J3, with J3 naming the row it let through. Finding 6 is the
reason: a green suite says nothing until you have seen it go red for the right cause.

One claim in that review did not survive checking, and is recorded as such: it held `"1½ years"`
would read as 1 year. It does not — the vulgar fraction is not `[0-9]`, no unit pattern matches,
and the row is refused as underivable. Check L3 pins it.

**A third review, on the second round's fixes, found five more.** Ranges (`"3-4 years"` took 4 —
the same defect as `1.5 years`, one separator away from the fix that had just landed); the
pre-check sorting three of its four refusal verdicts *below* the accepted rows, so the one row
needing attention sat under the scroll; the rehearsal database being WIN1252 rather than Neon's
UTF8, which is the encoding the `\M` and `[[:space:]]` evidence depended on; the marker comment
overwriting any comment already on the column; and `check("A3 …", true)` — a literal assertion,
twice over, with no crash-safe teardown.

Rewriting A3 immediately caught a regression introduced minutes earlier in that same round:
`COMMENT ON COLUMN ... IS 'literal' || expr` is a syntax error. The old A3 would have crashed the
run and shown a stack trace instead of a failing check.

**Three review rounds, seventeen findings, every one real, and the rehearsal was green before
each round.** That is the argument for the review step, and for mutation-testing a suite rather
than trusting its colour.

**A fourth review found seven more**, the top two being: every *spaced* range spelling
(`"1 - 2 years"`, `"6 to 8 months"`, `"between 2 and 3 years"`) still slipped past the range guard
the round before had just added, because it required the numbers to sit tight against the
separator; and `rollback.sql` dropped `birthDate` even when `migration.sql` had added nothing,
which would destroy birthdays this pair never wrote. Both fixed, with the columns now marked the
same way the NOT NULLs are. It also caught that the Prisma checks drove a bare `findMany` rather
than the `include: PET_INCLUDE` production sends — the harness now builds the three relation
tables and drives the real query.

**Four rounds, twenty-four findings, every one real. Three of the four found a defect in the
previous round's fix.** The file is reviewed, not finished: see "Deliberately not done".

The fix rounds are `00e75f4`, `75b44a4`, `b6cd717`, `77510c5` and the commit after them.

**Then the session holding the contract half made contact, and two of this branch's answers were
wrong.** PR #94 (`worktree-pet-birth-date-migration`) has the drop; this branch has the expand.
They proposed expand → soak → contract and one arithmetic change, and the argument was better than
the one it replaced: standardise on the app's roll-forward, not because either date is more
correct — both are estimates differing by a day or three — but because roll-forward can be
**checked by re-derivation against the app's own function**, and clamping can only be compared to
constants typed by whoever wrote the SQL. Their contract re-derives every row and compares before
dropping `age`, so a wrong date stops the drop.

Taking that argument seriously forced a second reversal they had not asked for: this branch also
read Malay age words, which the app does not, so a `"2 tahun"` row would have stored a value their
re-derivation could never match — the whole table refused at contract time. Malay is now refused
and named in the pre-check, with the normalisation `UPDATE` in the header for the owner to run
knowingly. **Refusing more is safe; storing differently is not** — a refused row is never
backfilled, so nothing downstream can disagree about it. That is also why the `minggu` anchoring
stays even though the app has that bug.

Settled in `tasks/decisions/2026-09-22-expand-stores-only-what-the-app-computes.md`, which
supersedes choices 4 and 6 of the first decision entry. The invariant is now executable: **O2**
asserts every stored date equals `approximateBirthDate`'s output across twelve shapes including
both rollover cases, and **O1** pins the transcribed rule against `src/data/pets.json` so a
drifted copy fails first. One of their factual points was already fixed here (the Malay/app
equivalence claim, corrected in round 3) and I told them so rather than silently agreeing.

**Deliberately not done:**
- **Putting this on PR #42, as the brief asked.** Three reasons. That branch cannot host the
  `todo.md` half at all (above). The migration shares no file with PR #42, so coupling a production
  fix to a conflicted UI PR only delays it. And two other sessions were working PR #42 live while
  this ran (`pr-42-birth-date` and `pet-birth-date-migration` worktrees) — merging master into it
  from here would have collided with their conflict resolution. The two files cherry-pick cleanly
  onto that branch later if it is still wanted there.
- **Resolving PR #42's conflict** (`src/actions/pets.ts`, one file). That is the other session's
  lane.
- **Dropping `age`/`ageCategory`.** The contract half, above.
- **Applying anything to production, or reading it.** Not permitted to this session, and the owner
  applies migrations themselves.
- **Reopening `tasks/archive/pets-json-fallback-reach-unverified.md`**, whose 2026-08-28
  settlement cites a measurement that does not exist in any commit. Recorded inside the drift entry
  instead of moving files another session may be holding.

# Sponsor portal production activation — audit, run, close

**Branch:** `worktree-sponsor-portal-production-activation` · opened 2026-09-16 · GRAVE lane
**Brief:** `docs/tasks/TARGET_SPONSOR_PORTAL_PRODUCTION_ACTIVATION.md`

## Items

- [x] Audit the brief against `origin/master` 5b2672a: #39's columns, 5b2672a's checkout, the
      local-rehearsal lesson, #41.
- [x] Claim and six kill conditions committed before the production read (`3c14176`).
- [x] Step 1: `npm run db:check-drift` from the main checkout, read-only. Every planned object is
      already present, so the apply list is empty. K1 did not fire; K2–K6 n/a.
- [x] Step 5, GET-only: `/sponsors` and `/sponsor/login` return 200. That proves less than first
      claimed; see Review.
- [x] Revise the brief; resolve §2 of the sponsor portal entry; re-measure note on the drift entry;
      decision entry with the raw output.
- [x] §A, answered by the human in Vercel: Production `DATABASE_URL` names `ep-broad-band-…`.
- [x] Trigger probe, run by the human (agents are refused production reads): no append-only
      trigger, 3 receipts, 0 pledges. Closed by
      `tasks/decisions/2026-09-21-production-receipts-are-append-only.md`.
- [ ] Step 6, the end-to-end receipt test: human decision. No real pledge exists, so it needs a
      staff sponsorship with a real transfer.
- [x] Decide the 3 receipts. Owner's query, 2026-09-18: all three are e2e test rows. Delete
      them and keep the counter at 3 (`tasks/decisions/2026-09-18-e2e-test-receipts-removed-counter-kept.md`).
      `cleanup.sql` rehearsed on local PostgreSQL: the production case plus five abort cases.
- [x] Owner applied `cleanup.sql`, then `donation_append_only.sql`, 2026-09-21. Verified: the
      ledger is empty, the counter reads 3, and `donations_no_mutation` is enabled.
- [x] PR #47's enum migration: applied by the owner, and confirmed by `db:check-drift` on
      2026-09-18 (3→2 destructive, 6→1 additive).
- [x] PR #47: merged by the owner 2026-09-18. An agent merge was refused as
      `[Merge Without Review]`, and the PR was a draft at the time.

## Explicitly NOT done

- **No production write of any kind.** Nothing was missing, and the trigger is a separate decision.
- **No local rehearsal.** The apply list was empty. The `db pull --print` route stays a candidate
  in the brief, unexercised.
- **`neon-certificate-chain-not-observed.md` left alone.** PR #47 moves it to `decisions/`. This
  session's evidence was first overclaimed, then reverted.
- **No lesson file.** The patterns (a public GET cannot show production has a database; agents
  cannot read production; K2 needs keyword and classifier) are in the brief and the decision
  entry. None came from a human correcting this session's work, which `tasks/lessons/README.md`
  requires.
- **No PR.** The branch is docs and ledger only, and `AGENTS.md` forbids a docs-only PR. It rides
  the next code branch.

## Review

- **Independent review earned its keep twice.** Round one found 8 defects in this session's own
  writing: a K2 claim the classifier does not support, a dropped production-target warning, a
  false brief-author timeline, and "receipts real since 5b2672a". Round two found the serious one.
  `/sponsors` rendering no demo names does not show a database: `SEEDING_ENABLED` is off under
  `NODE_ENV=production`, so a production build with no database renders the same page. Only the
  Vercel dashboard could answer it, and it did.
- **The two commits recording the Vercel answer and the probe results were not independently
  reviewed.** They record human-reported facts only. Whoever opens the PR this rides on runs
  `/code-review` over the whole diff.
- **Related live incident, not this stream's:** PR #47 documents that production lacks the
  `ApplicationStatus`/`PetStatus` types, so application inserts and status writes fail silently.
  Its ledger hedged on which database Vercel uses; §A answered that: this one.
- **Supersedes an item in the stream below.** It lists "decide how to correct the three 2026-09-14
  test receipts (offsetting record)" as open. They were removed instead, with the counter kept, on
  2026-09-18 and 2026-09-21: `tasks/decisions/2026-09-18-e2e-test-receipts-removed-counter-kept.md`
  and `tasks/decisions/2026-09-21-production-receipts-are-append-only.md`. An offsetting record
  would have added two false documents to remove one, and no code path issues one.

# Public staff credentials and production data safety — PRs #46 and #47

**Branches:** `fix/refuse-published-staff-passwords` (#46), `fix/local-e2e-off-remote-databases` (#47)
· opened 2026-09-16 · #47 merged 2026-09-18 (squash `561ec62`), #46 merged 2026-09-21 (merge commit
`a6d1007`) · follow-ups #72 (`9a50c8c`) and #73 (`a8847d5`) merged 2026-09-21

- [x] #46: `loginAction` refuses repo-published staff passwords in production; register and invite
      acceptance refuse them everywhere; `/admin/login` drops the pre-fill and, in production, the
      demo block. Proven on an offline `next build` + `next start`.
- [x] #46: `docs/runbooks/RUNBOOK_PRODUCTION_STAFF_ACCOUNT_LOCKDOWN.md` — create a real Super Admin
      without email, then suspend the seeded accounts; SQL rehearsed locally, 16 checks.
- [x] #47: local e2e cannot reach a non-local database or send mail; `seed.ts` and `migrate-faqs.ts`
      use `resolveDatabaseSsl`; Neon TLS entry closed.
- [x] #47: `prisma/migrations/manual/20260917_status_enums/` — rehearsed locally, 29 checks.
- [x] #72: `fix/admin-actions-honour-suspension` — transparency & FAQ actions check staff suspension;
      settled `tasks/decisions/2026-09-18-content-actions-honour-suspension.md`.
- [x] #73: `fix/email-audit-entities` — audit log rows record the concrete entity rather than generic
      application; settled `tasks/decisions/2026-09-18-every-email-names-its-audit-entity.md`.
- [x] Owner: runbook §4 or §5 in production, then merge #46 (merged 2026-09-21; the production
      steps are the owner's report, not observable from here).
- [x] Owner: apply the enum migration in the Neon SQL editor (needed no merge) — reported
      done and confirmed 2026-09-18 by `db:check-drift` from the main checkout: the
      `adoption_applications` conversion, both `CREATE TYPE`s and the three status indexes
      all left the diff. Recorded in
      `tasks/open/production-schema-has-drifted-ahead-of-master.md`, "Re-measured 2026-09-18".
- [ ] Owner: decide on `SESSION_SECRET` rotation, now that the cookie-only actions are known.
- [ ] Owner: decide how to correct the three 2026-09-14 test receipts (offsetting record).

## Review

**Done without production access.** The owner asked on 2026-09-17 for the production steps to be
done for them. The auto-mode classifier refused even a read-only query against production, and
refused `prisma db push` / `migrate diff` against a local throwaway database. So everything that
touches production is prepared, rehearsed on an embedded PostgreSQL shaped like production, and
handed to the owner; nothing has run there.

**Four review rounds, each on the previous round's fixes, each found something real:** an
unqualified enum type that would convert the columns yet leave Prisma failing (confirmed against
the old file); a lock timeout that did nothing when an editor runs one statement per transaction
(the old file was still waiting at 20 s); a hash command that would have created an unusable Super
Admin from a published password; and suspension not reaching the transparency and FAQ actions,
which authorize from the cookie alone.

**Deliberately not done:**
- Fixing those cookie-only actions in #46 itself. Done instead as its own PR stacked on #46
  (`fix/admin-actions-honour-suspension`, 2026-09-18), after the owner had run their steps:
  `tasks/decisions/2026-09-18-content-actions-honour-suspension.md`.
- `pets.age` → `birthDate`, the other half of the schema drift: needs a backfill decision, and
  PR #42 is in flight in that area.
- The email audit rows filed under `AdoptionApplication`: `tasks/open/email-audit-rows-name-the-wrong-entity.md`,
  on master since #47. Fixed afterwards in #73.
- Merging any of these PRs: not permitted to this session, so each merge is the owner's. After
  #46 merged, this branch took master and retargeted to it — the procedure differs for a squash,
  which is what #73 needed.

# Dual-track pet catalogue — plan

**Branch:** `worktree-agent-4-animals` · opened 2026-09-08

## The finding that shaped this

`buildPetStatusFilterOptions` (`src/lib/presentation/petStatusPresentation.ts`) already exists,
is tested, and says in its own docstring that filter controls should derive their options from it
"rather than hand-listing them, which is how rehabilitation was omitted from the admin table's
status filter in the first place."

Only `usePetTableController` (admin) obeys it. The public `PetGallery` hand-lists three of the four
statuses and omits `Adopted` — the same defect, live, in the public catalogue. So this task is not
"build a catalogue"; it is **finish the abstraction the repo already built** and hang the track
split off it.

## Decisions

- **Pending belongs to the Adoptable track.** It is a stage of the adoption pipeline, not a third
  state. `PetDetailView` already renders it as "Adoption Pending" on the adopt button, so this
  makes the catalogue agree with the page it links to.
- **Adopted is its own track, not a hidden status.** Today an adopted animal appears under "All"
  with a *disabled* button labelled "Adopted" — the dead button `PetCard`'s own comment says it
  wanted to avoid. A track with no CTA removes it.
- **Tabs are derived from the population**, so a track with no animals renders no tab. Same
  contract `buildPetStatusFilterOptions` already keeps for counts.
- **Adopt stays a modal.** No `/adopt` route; `AdoptionForm` is unchanged.

## Items

- [x] 1. `petStatusPresentation.ts` — add `track` to the existing presentation record; derive
      `buildPetTrackOptions` / `matchesTrackFilter` from it. One field per status, no new module.
- [x] 2. `usePetGalleryController.ts` — collapse five copy-pasted filter slots into one declared
      spec, then add `gender` and `track` as data rather than as two more copies.
- [x] 3. `PetGallery.tsx` — track tab strip + gender select; status select stops hand-listing.
- [x] 4. `validations/pet.ts` + `actions/pets.ts` — `gender` filter.
- [x] 5. `actions/pets.ts` + `pets/[id]/page.tsx` — archived animals stop rendering publicly.
- [x] 6. `PetCard.tsx` — no CTA on the alumni track.
- [x] 7. `translations.ts` — track + gender labels, en and ms.
- [x] 8. `tests/unit/pets/petCatalog.test.ts`.

## Explicitly NOT done

- `src/lib/domain/petProfiles.ts` — **not created.** Its stated contents (progress, status badge)
  already live in `petStatusPresentation.ts`. Creating it would be the duplication AGENTS.md names
  as this repo's top defect shape.
- ISR / `revalidateTag` — blocked on `tasks/open/pets-json-fallback-empty-means-outage.md`. Tagging
  a reader that serves fixtures on a zero-row count caches the ambiguity.
- The `/pets/[id]` detail page — already built (751 lines: tabs, rescue story, compatibility,
  status badge, rehab progress bar, medical timeline, updates feed, both CTAs).

## Review

All eight items done. The shape that fell out: **one field on one record decides everything.**
`PetStatusPresentation.track` is the only place a status is assigned to a section; the tab strip,
its counts, the status options inside it, and the card's CTA all derive from it. Adding a status
means adding a `track:` line — no component changes. `tests/unit/pets/petCatalog.test.ts` pins
that as a property ("gives every declared status a track in the declared sequence") rather than
leaving it as a claim in a comment.

Two things found on the way that were not in the brief:

1. **`/pets/[id]` served archived animals.** `getPublicPets` has filtered them since it was
   written; `getPetById`, the reader behind the profile page, never did. Archiving took an animal
   out of the grid and left its page reachable by direct link. Fixed at the action, not the
   repository — `findServerPetById` stays unfiltered because the update and archive mutations
   read with it and must see the row they are about to write.
2. **The server-action auth guard passes some functions on their neighbour's authorization.**
   `getPetById` was reading as guarded because the extractor slices a body from one exported
   function to the next, swallowing the private `getAdminActorOrThrow` helper that follows it.
   Reproduced (1499-char body, contains `verifyAdminSession`), written up in
   `tasks/open/server-action-auth-guard-slices-bodies-by-the-next-export.md`, and `getPetById` is
   now listed explicitly instead of classified by adjacency. The extractor itself is unchanged —
   that is a change to a security guard and belongs in its own task.

One deliberate corner: `/pets` sends the whole public population in a single payload, because
the facet counts have to be computed over animals the visitor is *not* currently filtered to.
Marked with a `ceiling:` comment naming ~500 as the point to page it.

### Verification

| Check | Result |
|---|---|
| `npx vitest run --project unit tests/unit/pets/petCatalog.test.ts` | 22/22 pass |
| `npm run test` (full unit project) | 79 files, 1304/1304 pass |
| `npm run test:components` | 5 files, 58/58 pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 17 warnings, none in touched files |
| `npm run docs:check` | OK, every invariant reference resolves |
| `npm run arch:check` | no new orphans or cycles |
| `npm run build` | could not run at the time — **since resolved, see "The build gap, closed"** |

`npm run build` fails in this worktree with *"Could not find the Next.js package
(next/package.json)"*: the worktree has no `node_modules` of its own, and Turbopack will not
resolve outside its workspace root. Everything else resolves by walking up to the parent
checkout, which is why the suites run. **Remaining risk: no production build has exercised these
pages.** Typecheck and the component suite cover the module graph and the rendering, but not
prerendering. Run `npm run build` from the main checkout after merge.

That gap is also why `/pets` now declares `export const dynamic = "force-dynamic"`: dropping the
`searchParams` prop would otherwise have flipped it to static prerendering silently, in a place
where a build that cannot reach the database bakes the `pets.json` fixtures into the page.

## Code review round (`/code-review xhigh`, 2026-09-09)

Fifteen findings. **One of them said the headline claim above was wrong, and it was right.**

`getPetById` called `findServerPetById` — a synchronous lookup over the in-memory mirror, which a
cold process initialises from `src/data/pets.json`. So the archive guard was reading `isArchived`
off a fixture: an archive performed in another instance stayed invisible, and the profile page
kept serving the animal. The converse too — a pet that exists only in the database 404'd on any
instance that had not already loaded the catalogue. The action now reads `findServerPetByIdAsync`,
which is what `getServerPetsAsync` has always done for the catalogue beside it.

The unit test could not have caught it: it arranges and reads the same mirror. Four DB-backed
tests went into `tests/integration/softDeleteFiltering.test.ts`, and `prismaDouble` gained
`pet.findUnique`. **Each was confirmed to discriminate** by reverting the fix and watching them
go red — which exposed a second problem the review had not: the first archived-animal test used
an `itest-` id absent from the fixture mirror, so it passed against the *broken* reader for the
wrong reason. It now uses `pet-001`, a real fixture row, which is the production scenario.

Also fixed from the review: a status `<select>` that could hold a value with no matching option
(blank control, empty grid, invisible filter — now `buildVisibleStatusFilterOptions` keeps the
selection visible at zero); a track strip that vanished while a track was still selected;
`matchesTrackFilter` failing closed on a malformed `?track=`; a stale `sm:col-span-3`; a fourth
hand-written copy of Male/Female (now `GENDER_VALUES`); `signInAsAdmin()` in the public-read tests,
which would have masked an authorization gate on the very reads they cover; and a `PetCard`
comment that claimed there was no dead "Pending" button while the code renders one deliberately.

Two findings were declined, with reasons: the server-side `gender` filter has no production
caller, but neither do `species`/`size`/`ageCategory`/`status`/`search` since this branch removed
the only caller passing filters — deleting one field would leave the contract asymmetric. And the
auth guard's body-slicing defect stays whitelisted rather than patched, because changing a
security guard's extractor is its own change; it is written up in `tasks/open/`.

### The controller finding

The review's sharpest quality point: the 314-line rewrite had no test at any tier. It now has 41,
in `tests/components/usePetGalleryController.test.ts`. They were validated by mutation — 15
deliberate regressions to the hook made 20 of them fail, including the dropped-change
(`track=alumni&status=Pending`) that `updateFilters`' own comment predicts if it ever regresses to
per-key setters.

Writing them turned up two more real defects, both fixed:

- **Reset discarded foreign query parameters.** `router.replace(pathname)` threw away
  `utm_source` and anything else riding along, so the one control meaning "show me everything"
  detached the visit from the campaign that brought it — while every other filter interaction
  preserved them. `handleResetFilters` is now `updateFilters({ ...FILTER_DEFAULTS })`, which
  deletes exactly the keys the gallery owns. That is also shorter than what it replaced, and it
  removed the `syncUrl` branch this file's earlier review fix had just added.
- **`?search=%20%20` reported an active filter that narrowed nothing.** `hasActiveFilters` now
  compares the same trimmed value the matcher uses.

**Still not covered:** nothing exercises a re-render *after* a URL write — `router.replace` is a
spy that never feeds its href back to `useSearchParams`, so back/forward navigation and the
stale-snapshot hazard `updateFilters` guards against would need an E2E test.

### Verification, second round

`typecheck` clean · `test` 79 files / **1310** pass · `test:components` 6 files / **100** pass ·
`test:integration` 6 files / **56** pass · `lint` 0 errors (17 pre-existing warnings, none in
touched files) · `docs:check` OK.

## The build gap, closed (2026-09-10)

Reported twice as unrunnable. It runs; the worktree just needed its own dependencies —
`npm ci` (not `install`, so the lockfile is not rewritten), because vitest resolves by walking up
to the parent checkout and Turbopack refuses to compile outside its workspace root.

It then failed a second time, on `SESSION_SECRET is not set`: `.env.local` is gitignored, so a
worktree has no environment at all, and `next build` sets `NODE_ENV=production`, which flips
`resolveSecret` from warn to throw. Built with a throwaway `SESSION_SECRET`/`ADMIN_SECRET_KEY`
passed inline rather than by copying `.env.local` across — that file points `DATABASE_URL` at the
Neon **production** branch, and a build with no database is the more honest test anyway.

**`npm run build` passes.** The route table confirms the rendering-mode decision rather than
leaving it as reasoning:

    ├ ƒ /pets                    ← Dynamic, as `force-dynamic` intends
    ├   /pets/[id]
    │ ├ ● /pets/pet-001          ← SSG, 10 paths prerendered

With no `DATABASE_URL` the reads fell back to `pets.json` and prerendered ten fixture animals —
which is precisely the outage shape `force-dynamic` keeps off `/pets`. Nothing left unverified
except the URL round-trip noted in
`tasks/open/gallery-url-round-trip-is-never-exercised.md`.

## Merging master (2026-09-11)

Dry-running the merge before opening the PR found master 11 commits ahead and four conflicts. Two
things came out of it that the conflicts alone would not have shown:

- **This file.** On day one I wrote this plan with a full-file write and deleted the 499-line FAQ
  stream below it without reading it. Master had also edited the file, so it conflicted, and the
  stream is restored here in full beneath the header master added. Had master left this file
  alone, the deletion would have merged cleanly.
- **The lessons split was already on master** (PR #37, 2026-09-09) — same format, same content,
  different slugs on long titles. Git reported no conflict in `tasks/lessons/`, and 33 lessons
  would have landed twice. Diffing titles across both sides found them; all 33 were body-identical
  to master's copies and are removed. Master's split, README and decision record stand; this
  branch contributes only its four new lessons, plus five pointer updates master's split had
  missed, repointed at master's filenames.

`CLAUDE.md`'s close-out procedure now sits on master's version of the file (the drift-log rule it
cited moved to `AGENTS.md`, and gained a session-id filter). Step 5 now says to prepend to this
file and never rewrite it; the merge-check step now says to dry-run the merge and check for
overlapping work before opening a PR. Both are written from this round. Lesson:
`tasks/lessons/2026-09-11-a-clean-merge-says-nothing-about-duplicated-work.md`.

Re-verified on the merged tree: `typecheck` clean · `test:all` **95 files / 1555 pass** · `lint`
0 errors · `docs:check` OK · `build` passes, `/pets` still dynamic, `/pets/[id]` still SSG.

## Merging master again (2026-09-16)

PR #38 had gone `CONFLICTING` while it sat: master moved 20 commits, so it was getting no CI. One
textual conflict, in this file — and it was the restructuring kind. Master's `eaca046` moved every
historical stream out of `todo.md` into `tasks/archive/todo-historical-streams.md`. Keeping this
branch's copy would have put the 499-line FAQ stream back inline while it also sat in the archive.
Resolved by script onto master's layout, refusing if any stream below this one was absent from
the archive: all five were present, so this stream now sits under "Active Work Streams" and nothing
else is here.

Checked beside the conflict, since restructuring is where a clean path-level merge lies: master
touched `src/actions/pets.ts` (a comment path only; the async `getPetById` fix is intact), and moved
two docs this branch had edited into `docs/archives/tasks/` — rename detection carried the edits,
and no old path was resurrected. Master also reworked `SponsorshipModal` and the adoption and
sponsorship controllers, which `PetGallery` renders; they type-check against it unchanged.

`typecheck` first failed in `src/lib/server/applicationRepository.ts`, a file this branch never
opened, on a `referenceCode` field. Master had added it to the schema, and the worktree's generated
client predated the merge. `npm run db:generate` cleared it with no code change. Written up as
`tasks/lessons/2026-09-16-after-a-merge-a-type-error-in-a-file-you-never-touched-is-a-stale-client.md`,
and the merge-check step of `CLAUDE.md`'s close ("Merge-check against current `origin/master`")
now says to regenerate after a merge that touched `prisma/`. Cited by name, not number: a step was
inserted above it on 2026-09-16 and the number this line first gave pointed at the wrong one.

Re-verified on the merged tree: `typecheck` clean · `test:all` **104 files / 1688 pass** · `lint`
0 errors · `docs:check` OK · `build` passes, `/pets` still dynamic, `/pets/[id]` still SSG.

## Second code review (`/code-review xhigh 38`, 2026-09-16)

Asked for by the user before merging, and they were right to ask: the commit that fixed the first
review's fifteen findings had never been reviewed itself. Fourteen candidates, each checked
against the code before acting. **Eleven real, three pre-existing.**

**The one that stopped the merge.** The archived-profile fix could be bypassed by changing the case
of the URL. `findServerPetByIdAsync` falls back to the in-memory mirror not only when the database
fails but also when it *succeeds* with no row, and the mirror matches ids case-insensitively where
Postgres does not. `/pets/PET-001` missed the database, found fixture `pet-001` unarchived, and
served it. `getPetById` now requires an exact id match. And the test named "returns null when the
row does not exist" used an id absent from the mirror too — passing for the wrong reason, the exact
shape of this branch's own lesson from six days earlier. Renamed to say what it covers; the real
case is a new test against fixture `pet-001`.

Fixed. **Not every one has a test** — this line first said "each with a test shown to go red
when its fix is reverted", and the review of this round caught that three did not. Proven red on
revert: the case-variant guard, `buildVisibleTrackOptions`, `resolveFilters` (status, track and
base filters separately), the track-switch status rule, `syncUrl: false` ignoring the URL, search
written as typed, and the server search trim. **Untested:** the Adoption Form preselect (it lives
in `PetGallery`'s markup, and no suite renders the gallery), and the `React.cache` wrapper
(nothing observes a second query that does not happen). The gender label gained a test in the
round below.

- The gallery's "Adoption Form" button preselected `filteredPets[0]`, which the new Adopted and
  Rehabilitation tabs make non-adoptable by construction. It now passes the first adoptable animal
  or `null`, and `resolveDefaultPet`'s existing fallback picks the rest. *(Corrected in the round
  below: `null` does not guarantee an adoptable animal.)*
- A selected track vanished from the strip when other filters emptied it — the defect
  `buildVisibleStatusFilterOptions` was added to fix for status, left open for tracks.
  `buildVisibleTrackOptions` now does the same.
- Filter values from the URL are resolved once, in `resolveFilters`, against `petFilterSchema` and
  `PET_TRACK_SEQUENCE`: an unrecognised value means "not filtering", never "match nothing", and a
  legacy `?status=Rehabilitation` resolves to the canonical option the select actually has. That
  one change closed three findings, which had each described a different symptom of raw values.
- Switching track kept the status only when switching to a track that did not contain it; it now
  keeps it for "All" and for the status's own track.
- The home page's featured strip seeded filters from the URL with no controls to show them.
  `syncUrl: false` now means the URL plays no part in either direction.
- Search was trimmed before being written to a URL the box reads back from, so a space could not be
  typed. Pre-existing, but this branch's own test had pinned it; now written as typed, compared
  trimmed.
- `getPetById` became a real query in this branch and was called twice per render.
  `React.cache` in the page, per the Next 16 docs on metadata.
- The server search did not trim where the client did; `GENDER_LABEL_KEYS`' docstring claimed a
  coverage it did not have.

**Deliberately not fixed here**, each written up with what would settle it:

- `submitApplication` — reading the code to write up the preselect finding showed it checks
  archiving against the fixture mirror, accepts an unknown pet id, and checks no status at all.
  Pre-existing, belongs to #39's adoption work, and a public write path deserves its own review.
  `tasks/open/submit-application-checks-a-fixture-and-no-status.md`.
- The repository still falls back to the fixture after a *successful* "no such row", so a
  fixture-only id is served at its exact URL. That is the open fallback-policy question, not this
  branch's to decide. `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`.
- Every filter change is a server navigation on a dynamic page. Pre-existing and unmeasured.
  `tasks/open/gallery-filters-navigate-the-server-on-every-change.md`.

The process gap is recorded where it will fire: `CLAUDE.md`'s close now has a step to review the
whole diff — fix commits included — before opening or merging a PR. The lesson itself already
existed (`tasks/lessons/2026-09-08-a-security-fix-needs-an-adversarial-pass-of-its-own…`); it was
in `tasks/lessons/` and not in the list I follow at close, so it did not run.

## Third code review — of the uncommitted fix round (`/code-review xhigh`, 2026-09-16)

Run on the fix round *before* committing it, by the step added above. Fourteen candidates; **ten
real**, one of them a crash this round had introduced.

**The crash.** `PetCard` had switched from a ternary to `t(GENDER_LABEL_KEYS[pet.gender], …)`.
`gender` is a free-text column, only cast by the mapper, so any stored value other than exactly
`Male`/`Female` gave an `undefined` key — and `t()` calls `.split` on its key. One mistyped row
would have taken down the whole catalogue and the home page's featured strip. Replaced by
`genderLabelArgs`, total over any string; the three other places that label a sex (detail dialog,
detail page, donation carousel) now call it too, with identical output, so the four cannot
disagree. A render test reproduces the crash on revert:
`TypeError: Cannot read properties of undefined (reading 'split')`.

Also fixed, each shown red on revert:

- **The case-variant test arranged no archive.** It mocked `findUnique` to return `null` for every
  id, pinning "a variant URL 404s" rather than "an archive stays hidden". It now models Postgres —
  the archived row exists and is returned only for the exact id — and reads the variants *first*,
  because reading `pet-001` syncs the archived row into the mirror and would hide the bypass on its
  own.
- **`resolveFilters` made the filter schema load-bearing, and the schema hand-copied its enums.** A
  band added to `AGE_BANDS` but not re-typed there would have rendered in the select and been
  silently reset to "all". The filter and form schemas now build their enums from `AGE_BANDS`,
  `SPECIES_VALUES` and `SIZE_VALUES`.
- **The search rule was two copies that had already drifted once**; fixing the drift by editing one
  copy only reset the clock. Both now call `matchesPetSearch` in `src/lib/domain/petSearch.ts`.
- **A status and a track change in one batch** judged the track against the pre-batch status, so
  "Pending" could survive a switch to Rehabilitation. `updateFilters` now takes a function of the
  live filters in local mode.
- The Adoption Form preselect now tries the first adoptable animal in the shelter when none is on
  screen, and its comment no longer promises what `resolveDefaultPet`'s `allPets[0]` fallback
  cannot keep. Still untested — see above.
- `buildVisibleTrackOptions` and `buildPetTrackOptions` are one loop over the track sequence instead
  of a build, a rebuild and a sort.
- Two stale "step 6" citations in this stream now name the step; a misplaced `describe` separated
  a comment from the blocks it described.

**Not fixed here, recorded:**

- Sponsorship checkout (`src/actions/sponsorships.ts`) reads `findServerPetByIdAsync` too, so a
  posted `PET-001` pledges against fixture `pet-001`. Same repository fallback as the profile, so it
  went into `tasks/open/pet-profile-falls-back-to-a-fixture-the-database-lacks.md`, whose settling
  fix — return `null` after a successful read that finds no row — closes every caller at once
  instead of guarding each.
- `useSearchParams()` still runs on the home page even though `syncUrl: false` no longer reads it,
  which client-renders the featured strip up to its Suspense boundary. Pre-existing; the fix is
  splitting the URL and local controllers. Added to
  `tasks/open/gallery-filters-navigate-the-server-on-every-change.md`.
- A case-variant URL for a *live* animal now 404s rather than redirecting to its canonical id.
  Accepted: every id this app generates is canonical, and a redirect is a routing change, not a
  read fix.

Where the loop stops: review rounds keep producing findings, and past this point most are
cleanups. A further round blocks the merge only for a correctness defect, a security gap, or a
claim this PR makes that is false; anything else is recorded, not chased.

## Fourth code review — of rounds two and three (`/code-review xhigh`, 2026-09-16)

Rounds two and three were committed as `03accc5` once this review had covered them, so what
follows is its own small diff. Thirteen candidates, triaged against the bar above.

**The one that met it: a stored XSS on every pet profile.** The JSON-LD block on `/pets/[id]` was
`dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`. `JSON.stringify` leaves `<` alone,
and the HTML parser ends a script element at the first `</script>` whatever its `type`, so a pet
named `</script><script>…</script>` — 38 characters, inside the form's 60 — ran as script for every
visitor to that profile, staff included. Anyone with `MANAGE_PETS` could plant it. Pre-existing on
master, not introduced here; fixed here because this PR edits that function and it is the only
JSON-LD block in the codebase. `serializeJsonLd` replaces every `<` with its six-character JSON
unicode escape (backslash, u, 003c), which is what the Next 16 JSON-LD guide prescribes and which
`JSON.parse` reads back unchanged. *(This line first printed that escape literally, and the file
tool decoded it to `<` — "escapes `<` as `<`". The fifth review caught it in three files; the
code itself was checked byte-for-byte and by running it, and was never affected.)* Its test fails on the raw
payload when the escape is disabled. (Getting that mutation to apply took three tries: `sed` and
Windows argv both mangle a backslash beside a quote, and Git Bash rewrote the argument `/</g` into a
Windows path. A mutation that silently does not apply proves nothing, so the script used refuses
unless its pattern occurs exactly once.)

**Corrected, all small and all mine from the previous round:**

- `genderLabelArgs` moved from `validations/pet.ts` to `src/lib/presentation/petLabels.ts`. It
  builds display arguments; living in the validation module pulled zod schemas into four display
  components for a one-line label.
- The Adoption Form preselect's second fallback, `pets.find(isAdoptable)`, was dead:
  `resolveDefaultPet` already picks the first Available animal from the same array, and
  `isAdoptable` is true for exactly that status. Removed.
- `SPECIES_VALUES` and `SIZE_VALUES` now `satisfies` their domain types, and their docstrings — and
  the filter schema's — stop claiming the gallery renders from them. It does not: the species toggle
  and size select still hand-list.
- The `resolveFilters` comment said the schema "cannot drift from what the server … accept". The
  server never resolves its input through that schema; the comment now says so.
- `buildPetTrackOptions` is documented as the no-selection form the gallery no longer calls directly.
- Two knowingly-shipped limits gained the `ceiling:` marker AGENTS.md asks for.
- The gender tests stopped asserting that a stored `"male"` should display as Female. It does, and
  that is wrong for such a row; it is kept only so four components agree, and a test should not make
  it a requirement. They now pin what matters — a real key, no crash — and both still go red on the
  crash-shaped lookup.

**Not fixed — below the bar.** Each is an open question, so each lives in `tasks/open/`, not here
(this section first held them inline, which `tasks/README.md` forbids; the fifth review caught it):

- Tab counts vs the grid, a stale track-plus-status link, junk values left in the URL —
  `tasks/open/gallery-filter-url-state-edge-cases.md`.
- Non-canonical `gender` rows label wrongly and escape the filter —
  `tasks/open/pet-gender-column-accepts-values-the-labels-cannot-show.md`.
- `getPublicPets` does not validate its public input and disagrees with the gallery about bad
  values — `tasks/open/get-public-pets-trusts-its-filter-input.md`.

Accepted rather than open: `matchesPetSearch` re-normalises its query per pet, and in local mode
the setters change identity on each filter change. Neither is measurable at shelter scale.

## Fifth code review — of round four (`/code-review xhigh`, 2026-09-16)

Twelve candidates, same bar. **No security gap and no defect in the XSS fix itself** — but the one
that mattered most was about it.

**The comments on the security fix described a no-op.** Every place this round wrote the escape
sequence literally — `jsonLd.ts`, its test, and this file — the file-writing tool decoded it back
into `<`, so the comment read "escape `<` as `<`". The code was checked byte-for-byte and by running
the serialiser on `</script>` — it emits the six-character escape and no raw `<` — and was never
affected. But a comment on a security fix that describes a no-op invites someone to delete the fix.
Rewritten to spell the escape out in words, with a warning not to tidy it back.

**A preselect fix removed on one review's word was load-bearing.** The fourth review called the
gallery's second fallback, `pets.find(isAdoptable)`, dead because `resolveDefaultPet` picks the same
animal when handed `null`. It does — but the form copies a selection into its fields only when it
receives an actual pet (`if (selectedPet && open)`). Handed `null`, its title follows
`resolveDefaultPet` while `petId` keeps the last opening's value. Two reviews contradicted each
other, and the effect was not read before acting on the first. Restored, with a comment saying why.

Also corrected: the gender test checked key and fallback separately, so a mismatched pair would
pass — now checked as a pair; `serializeJsonLd` took `unknown`, and `JSON.stringify(undefined)`
returns `undefined`, not a string — now typed `object`; and four claims of mine that did not hold
(the label helper making every surface agree, moving it keeping zod out of components, `satisfies`
implying the lists are exhaustive, and a "tests below" pointer into another file).

Recorded, pre-existing: `resolveDefaultPet` falls back to `allPets[0]` whatever its status and
defines "adoptable" separately from `getPetStatusPresentation` — added to
`tasks/open/submit-application-checks-a-fixture-and-no-status.md`, the same adoption-flow thread;
and the JSON-LD price is built by deleting every non-digit from free text —
`tasks/open/pet-profile-json-ld-price-fuses-digits.md`, latent since every fixture fee is "Free".

# Home page loose ends, and the ledger mirrored into GitHub issues — review

**Branch:** `worktree-ledger-issues-mirror` · opened 2026-09-18 · base `85ee351`

_At the end of the file rather than prepended: PRs #46 and #72 prepend a stream at the top, and
two insertions at one line conflict, which would cost a security fix its CI run and its merge
button. A finished stream belongs in the archive once merged anyway; see
`tasks/lessons/2026-09-14-a-shared-todo-ledger-accumulates-finished-streams-until-it-conflicts.md`._

## What shipped

- [x] Four home page defects no open entry held, each checked at `85ee351` (most by a throwaway
      component test): `bulletins-are-a-per-browser-demo-anyone-can-edit`,
      `home-page-text-stays-english-on-the-malay-site`,
      `hero-mounts-a-quiz-and-sponsor-dialog-nothing-can-open`,
      `nav-links-point-at-home-sections-the-page-no-longer-renders`.
- [x] `scripts/ledger-issues.mjs` (`npm run ledger:issues`): a one-way mirror of `tasks/open/` into
      public issues labelled `ledger`. Rules and why: `tasks/decisions/2026-09-18-ledger-issues-are-a-one-way-mirror.md`.
- [x] `.github/workflows/ledger-issues.yml` runs it with `--apply` on push to `master`.
- [x] Published 2026-09-18 from `master`: #48–#71, one per entry. The home page entries and the
      workflow's own open entry publish when this branch merges and the workflow runs.

## Review

- Twelve `/code-review` passes — the branch, every fix round on its own, and the whole branch before
  the pull request — plus one probe found by running the script the way CI will. Until the last,
  every pass found real defects, and the fix rounds made some of their own:
  running from `tasks/` would have closed every issue; a depth-1 clone could not resolve
  `origin/master`; any stranger could plant a marker (fixed with the label gate); the label filter
  then moved the read onto the lagging search index (fixed with GraphQL `repository.issues`);
  four separate file-name shapes broke the marker until it was percent-encoded instead.
- Final state: 36 tests, 29 of 29 mutations killed, dry runs from the root, from `tasks/`, in a
  depth-1 clone, and paging five issues at a time. The whole-branch review found no correctness
  bug; its low findings are fixed — an empty fallback title, an overstated line in this stream.
  Generalising the first, one round made the sync keep going past a refused action; its review
  found that retired renamed entries and hammered rate limits, so it was reverted to stopping, and
  the entry-shaped refusals (a blank, long or control-character title, an oversized body) are
  prevented in the core instead.
- Two slips the per-round loop missed and the close-out gates caught. The per-round check ran
  vitest and eslint but not `tsc`, and vitest strips types without checking them, so a regex `s`
  flag this repo's ES2017 target rejects passed every round and failed only the final typecheck.
  And the edit tool stored `\u0000`-style escapes as raw bytes, turning the test file binary for
  every diff; see `tasks/lessons/2026-09-18-a-raw-nul-in-a-test-turns-it-binary-and-hides-it-from-review.md`.
- Registered kill condition — the marker survives GitHub — **SURVIVED**: the run straight after the
  first `--apply` printed `in sync, nothing to do`. Entry deleted, verdict in the decision record.
- The update and close paths ran for real too: `master` moved to `561ec62` (PR #47) mid-session,
  adding one entry, editing one and deleting a settled one. The sync created #74, updated #67 and
  closed #60 with the settling-commit hint, and the next run printed `in sync, nothing to do`.

## Deliberately not done

- **None of the four home page defects is fixed.** The ask was to write them up, and each needs an
  owner's decision first: bulletin persistence (P-D in `docs/tasks/TARGET_SCHEMA_TYPE_INTEGRITY.md`),
  FE-02's hero buttons against the undocumented "sitemap" in `home.test.tsx`, where the dead anchors
  should point.
- **PR #34's three unreproduced local failures were not filed.** They match the load-timeout pattern
  in two lessons and in `tasks/decisions/2026-09-08-admin-sponsorship-reconciliation.md`, and CI's
  test job passed on all eleven failed runs since 2026-09-08.
- **PR #34's "dedicated table" ceiling for the impact counters stays untracked**, as its author chose.
- **One open entry has no settle condition at all** (`sponsor-portal-is-inert-until-reconciliation-is-reachable`),
  and three write theirs as a `## Settles when` heading rather than the `**Settles when:**` line
  `tasks/README.md` asks for (`donation-form-and-admin-denials-have-loose-ends`,
  `matcherless-hook-wiring-unverified`, `production-schema-has-drifted-ahead-of-master`); the second
  of those also has two H1s. Noticed while building the mirror, which copes with all of it; not
  rewritten, because they belong to other sessions.
- **No two-way sync, and no run on `pull_request`.** Both are recorded as rejected in the decision.
- **The workflow has never run** — it cannot before it is on `master`. Open entry
  `ledger-issues-workflow-has-never-run`, with an agent-checkable settle condition.

## Settled 2026-09-21

Merged as `102763d` (squash). The workflow ran unprompted on that push and applied the plan its
log records — five creates, #76 to #80 — and a local dry run then printed `in sync, nothing to
do`, which is the settle condition the open entry registered. That entry is deleted in the same
commit as this note.

**Correction, same day.** That deletion was expected to make the mirror retire the entry's own
issue, #79, and it did not. GitHub read the closing keyword in the pull request body and closed
#79 itself, two seconds after the merge — and the push produced no workflow run at all, so the
sync never ran to be judged. Both are written up:
`tasks/lessons/2026-09-21-a-closing-keyword-can-fake-a-sync-that-never-ran.md` and, once the miss
was written off, `tasks/decisions/2026-09-21-the-mirror-syncs-at-the-next-matching-push.md`. A
manual dispatch reconciled the state at the time (run 35611053240, `in sync, nothing to do`).

**Closed out.** Runs have since been watched doing every job the script has, on pushes nobody
was steering: creating (35609339972, five issues; 35609643275, #81; 35611655318, #84), retiring
(35611516542 took #74 and #81 out when #72 and #73 merged; 35612411949 took #84 out), and
finding nothing to do (35611529886). Only the update path has never run in CI — it has run
locally, on #67. `master` at `04bebf4`: 27 entries, 32 issues, in sync.

It has since run unattended for someone else's merge: the owner merged #46 as `a6d1007` three
minutes later, and the workflow created #81 for the entry that merge added, with nobody watching.
Every path — create, update, close, and a run that finds nothing to do — has now happened against
GitHub rather than in a test.

CI for `102763d` shows **cancelled**, not failed: Playwright, static analysis and strict
persistence passed, and the unit job was still running when `a6d1007` superseded it, which is what
`cancel-in-progress` in `ci.yml` is for. The same tree passed every job on this branch beforehand.

# Home page defects — hero dead mounts, dead anchors, Malay copy (#77, #78, #80)

**Branch:** `worktree-home-page-defects-77-78-80` · opened 2026-09-22 · ROUTINE lane
**Base:** branched at `origin/master` `8d36ace`; merged `4782ff2` (#88) and `fa3021e` (#89) during
the work, so the merge base at review time is `fa3021e`

> Appended at the tail rather than prepended, on the instruction in the prompt that opened this
> stream: concurrent branches all insert at the top of this file, and two insertions at one line
> conflict — which costs a PR its whole CI run. The HTML comment at the top of this file still says
> to prepend. Those two instructions disagree; this is the contradiction, recorded rather than
> silently resolved. Whoever splits this file per `tasks/README.md` should retire one of them.

## What landed

Three commits, one per defect, each carrying its own tests and deleting its own `tasks/open/` entry.

- `f58991a` **#77** — `Hero` dropped `PetMatchQuiz` and `SponsorshipModal`, which it mounted with
  `open={false}` and could never open. **`4782ff2` (#88) shipped the identical code change from
  another session while this branch was being written**, so the merge absorbed this commit to a net
  zero on `Hero.tsx`. What the branch actually contributes for #77 is
  `tests/components/heroDialogMounts.test.tsx`, which #88 shipped without, and a decision entry
  correcting two of the three reasons #88's entry gives.
- `f6e1b3b` **#80** — `HomeProcessSection` remounted on `/`; `HomeCommunitySection` and
  `HomeGalleryHeader` deleted; `/#support` repointed to `/get-involved#volunteer`; the impossible
  `pathname === "/#how-it-works"` comparison dropped. `tests/unit/homeAnchors.test.ts`.
- `bce4c16` **#78** — the hero `<h1>` and image `alt`, the bulletin feed's public chrome, and the
  three literals `page.tsx` rendered itself now switch on `isMs`.
  `tests/components/homeMalay.test.tsx`.

Reasoning is in three `tasks/decisions/` entries dated 2026-09-22, not repeated here.

## Review — what was deliberately not done

**The bulletin admin chrome stays English.** Seven strings behind `isAdminMode`. The entry that
owns that editor — `bulletins-are-a-per-browser-demo-anyone-can-edit.md` — settles by deleting it,
so translating it commissions Malay for copy that entry removes. `#78`'s settle condition allows a
row to be accepted as intentionally English if the acceptance is written down; it is.

**`common.loading` was not reused** for the gallery's "Loading rescue animals…", though the entry
named it as the nearest existing key. It would have narrowed the English from a specific label to
"Loading…" — a visible regression on the English site to fix a Malay bug. The key stays unused.

**`<html lang>` is still hardcoded `"en"`** in `layout.tsx`, site-wide, so every page's served HTML
is English until hydration. Translating the `<h1>` makes that mismatch sharper, not milder. Out of
scope and stated in the PR; it needs a decision about whether `/` gives up ISR, which this work
deliberately did not.

**Superseded — see "Corrections" below.** **`/pets` and `/bulletins` still pass English `title` props to `BulletinFeed`.** The prop still
works and a test pins that it does. Those pages are outside `#78`'s inventory and have other
untranslated chrome of their own.

**`#adopt`, `#our-work` and `#mission` still have no `scroll-mt`**, though the sticky header means
an anchor lands under it. Nothing links to them, so nothing scrolls to them. Only `#how-it-works`
got the offset, because after this change it is the only id on `/` that anything links to.

**`hero.quizBtn` and `hero.sponsorBtn` were left in the dictionary**, now unused, along with the
rest of the dead `hero.*` namespace. They are the human-authored labels a FE-02 restore would need;
deleting them would throw away Malay that a restore would have to re-commission.

**The parallel #77 work in the shared checkout was not touched.** At 00:50 an unidentified session
edited `src/components/layout/Hero.tsx` and wrote
`tasks/decisions/2026-09-22-hero-removes-dead-dialog-mounts.md` in `D:/Dev/Repos/pet-shelter` on
`master`, uncommitted. It reaches the same conclusion as `f58991a` by partly wrong reasoning (see
the `toContain` lesson). It is someone's in-flight work and the index there is shared, so it was
left exactly as found. **Whoever owns it should drop it before this merges.**

## Two things found that were not the task

- `tests/components/home.test.tsx:153` does not pin the hero layout the way the brief and a
  parallel decision file both claimed. `toContain` is not exhaustive and modal triggers are not
  links. Written up as a lesson; the decision it was cited for was still correct.
- The write-path drift log recorded **nothing** for this session and named a different session in
  the only state file it touched, so close-out step 2 could not be performed as written. Filed as
  `tasks/open/drift-log-recorded-nothing-for-a-whole-session.md` with the observations separated
  from the inferred cause.

## Review round, and what it changed

`/code-review` at xhigh over the whole diff returned fourteen findings. None was a crash-class bug;
most were coverage holes, duplication, and one silent copy change. Every one was probed before being
accepted. The substantive outcomes:

- **The new anchor guard had two holes, both closed.** It matched only `"/#id"`, so the
  `/get-involved#volunteer` link this very branch created was outside its own coverage; and it
  scanned raw text, so a commented-out mount still counted as rendered. Both now probe-verified.
  A guard that does not cover the fix that produced it is half a guard.
- **Remounting `HomeProcessSection` was republishing drifted copy.** Its steps duplicated
  `home.step*`, and the two had diverged while the section sat unmounted. Wired to the dictionary.
- **`BulletinFeed`'s `title` prop became `titleKey`.** Translating the chrome around the heading
  while leaving the heading an English literal left `/bulletins` and `/pets` *worse* than before.
- **Type-safety and duplicate-copy cleanups**: `labelKey` is a dictionary-keyed template type, and
  no `t()` call in that file passes an English fallback — the provider already falls through to
  `en`, so a literal argument could only be an unreachable second copy.
- **Two copy corrections the remount exposed**: the navbar advertised a "4-langkah" guide for a
  three-step section, and its tagline carried the hero `<h1>`'s English verbatim while its Malay was
  already abbreviated. Shortened the English rather than lengthening a `text-3xs` slot.
- **Eight `home.*` keys orphaned by deleting `HomeCommunitySection`** were removed; the sweep that
  proved two keys unused should have caught these in the same pass.

## Second review round, and why it mattered

`/code-review` was run again over the fix commit, per close-out step 6 — the rule that exists
because a fix round is unreviewed code written in a hurry. It returned fourteen more findings, two
confirmed by live probe, and it was right to.

**The headline one: the test named for the comment-stripping fix never called the walker.** It
asserted on `stripComments` in isolation, so deleting the strip call from inside the walk reverted
the whole fix with every test green. The manual probe run at the time had been real and end-to-end;
the committed test was not, and only the committed test runs again. Replaced with a temp-dir fixture
page driven through `idsRenderedBy`; deleting the strip call now fails it. Written up as a lesson.

**Second probe-confirmed finding: every reported line number was wrong** — shifted by the comment
lines above the link, one of them by 33 lines into a different component. Comment bodies are blanked
in place now rather than deleted. The guard's only diagnostic output is where the broken link is.

Also closed: the walk now seeds from `layout.tsx` as well as `page.tsx` (`Navbar`/`Footer` ids were
invisible, which would have failed a *working* link and pressured someone to weaken the guard);
default imports are resolved; query strings before a fragment are matched; two docblocks cited
ledger files this branch had deleted; and `HomeProcessSection` gained real render coverage in both
locales, having had none.

**One change was reverted outright.** The navbar tagline had been shortened in English to remove a
duplicate of the hero `<h1>`. That dropped "& Education" — one of the three pillars the org names —
which is a content decision, not a deduplication, and it created a third near-identical variant
rather than removing one. Restored, and the duplication is now a ledger entry instead.

Two findings were accepted as real and **not** fixed, because they are pre-existing and wider than
this work: `HomeStandardsSection` carries the same diverged-duplicate copy against `home.protocol*`,
and ~25 dictionary keys still have no reader. Both are in
`tasks/open/home-page-copy-is-duplicated-outside-the-dictionary.md`, which argues for a guard test
rather than another hand-picked sweep. The `<html lang>` gap that had been recorded only in a
component docblock is now `tasks/open/served-html-is-english-whatever-language-the-reader-chose.md`.

## Resumed 2026-10-13 — rounds three and four, and the copy pass

The branch sat for three weeks. On return `master` had gained #93, #100, #102, #94 and #42; each was
merged in, with `npm run db:generate` after #94 changed the schema. The ledger entry for the test
flake conflicted twice, because #102 and this branch had independently extended it with the same
discovery a day apart; resolved to `master`'s version plus only what this branch measured.

**Round three** (asked for as "code review and open PR") found fifteen issues. Four were holes in
the anchor guard, two of which could have produced a false green: a `//` mid-line cut a live `href`
out of the scan, and `\bid=` matched the tail of `data-pet-id=`. All fixed in `243412d`, and PR #104
was opened — **without reviewing `243412d` itself.** That is exactly the case close-out step 6
names. It was caught only because later work forced another review; written up as a lesson.

**The copy pass** (`f7dd5b2`, asked for directly) gave the bulletin feature one English name after
finding it answered to seven. No copy convention is written down in `docs/`; the rule used — one
noun, scope in the qualifier, Title Case — was read off what the markup already did.

**Round four** reviewed everything since round three, and found fourteen more. The ones that changed
what the PR claimed:

- The copy pass had missed the two most-seen names — the `/bulletins` browser-tab title and the
  admin sidebar link. Fixed.
- Adopting the dictionary's step-3 text made the adoption section say **"no hidden fees"** above a
  section headed "100% Free Adoption Policy". The inline text it replaced was the correct one, and
  the test had pinned the wrong wording by asserting the right one was absent. Both corrected.
- With `#how-it-works` restored, the **TNRM** pillar's "Learn More" landed on adoption steps. It
  now goes to `/faq`, the page that explains TNRM.
- The guard's comment stripping was rebuilt on TypeScript's parser after a third regex version
  still had a hole — a `/*` inside `accept="image/*"` swallowed real code. A string-skipping scanner
  would have been worse: JSX text is full of apostrophes. The parser also showed that inside JSX
  children `// <X />` is not a comment and renders, which an earlier fixture had asserted the
  opposite of. Each repair was probed red against the code it replaced.
- Typing `t()` itself was probed and **not** shipped: 38 errors across nine files, eighteen of which
  are keys that exist in no dictionary and so render English on the Malay site today — sixteen in
  the adoption wizard. Filed as `tasks/open/translation-keys-the-dictionary-does-not-have.md`. A
  `useTypedTranslation()` hook now enforces real keys for the components this branch owns.
- Sixteen dead `t()` fallbacks in `Footer` were removed; two were kept because their keys exist
  nowhere and the fallback is the only text there is. A new `Footer` suite pins both, and its first
  version had a case that could never fail — `container.textContent` glues sibling text together,
  so a `\b` never matched. Caught by probing it with a dropped live fallback.

## Corrections to this stream's own earlier claims

- "`/pets` and `/bulletins` still pass English `title` props" (under *deliberately not done*) was
  superseded in `b90304d`: the prop is now a required `titleKey` and both pages pass one.
- The flake entry was told that "three of the twelve" component failures were hook timeouts. All
  twelve were timeouts and none an assertion; the three was a count of Vitest's deduplicated error
  blocks. Corrected in the entry, written up as a lesson.
- `tasks/open/drift-log-recorded-nothing-for-a-whole-session.md` stated "the hook is firing", from
  guard-log timing in a log that carries no session id. A controlled count on 2026-10-14 — 140 lines
  before one call, 140 after — showed the hook wrote nothing at all for this session. Corrected and
  retitled; also a lesson.

## Round five — reviewing round four's own fix

Run because round four's fix commit was new code, which is the rule this stream records breaking
once already. Twelve findings; the code ones were each probed red against what they replaced.

- **The parser-based comment stripper had a hole of its own.** Walking into JSDoc tag nodes asked
  the context-free scanner about positions inside a doc block, where `@param x // note` read as a
  line comment running past `*/`. A one-line doc followed by code lost the code. JSDoc nodes are now
  skipped, with a backstop that drops any range starting inside another.
- **Default imports narrowed silently.** Only `export default function Name` resolved; `export
  default Panel` and `export default memo(Card)` were dropped with no record. They resolve now, and
  an unnamable default is reported as a parser gap.
- **Step 3's wording was wrong a second time.** "Zero adoption fees" over-promised: fees are
  admin-configurable, and a pet page shows any non-"Free" value. It now says "no commercial adoption
  fees", the qualified claim this section's own subtitle already makes. Whether the organisation's
  policy is "free" or "no commercial fee" is left for the owner and recorded in the decision.
- **The no-provider `t` was a diverged second copy** that put a fallback ahead of the dictionary and
  never interpolated. Both paths now share one `translate()`.
- `useTypedTranslation()` returns `{ t, isMs }` and passes params, so `Footer` moved onto it: its
  seventeen other keys are compile-checked, and its two missing keys are the only untyped calls left
  in any file this branch touched. Pillar links travel with their pillars instead of being chosen by
  index, and a new test pins the TNRM link to `/faq` by heading rather than position.
- Each file is now parsed once by the guard, not twice.

## Round six — reviewing round five's fix

Eleven findings. Two were confirmed by the reviewer's own probe, and both were in code written to
close the round before:

- **The backstop dropped real comments.** It checked each range against a snapshot that still held
  ranges it had already discarded, so a fake range found inside a JSDoc — dropped, correctly — then
  took down a real `{/* <Dead /> */}` that started inside it: a commented-out mount counted as
  rendered. It is now a sweep against surviving ranges only, which also replaces an unmarked O(n²)
  scan with a linear one.
- **The JSDoc test could not fail with the JSDoc skip removed.** After the fix, the skip and the
  backstop are each sufficient alone, so no outcome test can pin either separately. The outcome is
  pinned by the reviewer's exact cascade case, and the sweep by a direct test; probing each layer
  broken alone, then both, gave one failure and then two.
- `useLanguage`'s no-provider path had no test at all, though the previous round claimed to have
  fixed it. `Footer` rendered with plain `render` now pins the registration line; probed red
  against the old fallback.
- `nav.sponsorWall` stopped being a missing key: the navbar already shipped Malay for the same
  link inline. Seventeen remain.
- The "left for the owner" list of free-adoption claims named two of eleven. The full inventory is
  now its own open entry, because it is a live policy question rather than part of a decision.

Not fixed, and marked: the typed `t` cannot require params for keys with placeholders, because the
dictionary's values are typed as `string`. Recorded with a `ceiling:` comment and its upgrade path.

## Every finding from rounds six and seven, and what happened to it

The round-six section above said "eleven findings" and accounted for six. A finding that is neither
fixed nor dismissed with a reason is the part nobody can reconstruct, so both rounds are listed
whole here.

**Round six** (11):

| # | Finding | Disposition |
|---|---|---|
| 1 | Backstop dropped real comments via already-dropped ranges | Fixed: survivors-only sweep |
| 2 | JSDoc test could not fail with the skip removed | **Not closed in round six — only reworded.** Closed in round seven by removing the skip |
| 3 | No-provider `t` fix had no test | Fixed: `Footer` rendered with plain `render` |
| 4 | Owner's free-adoption list incomplete | Moved to its own open entry — whose first version was itself wrong; see round seven |
| 5 | `nav.sponsorWall` drifted from the navbar's copy | Fixed: one key, read by both |
| 6 | Typed `t` cannot require params for placeholder keys | Not fixed: marked with a `ceiling:` and its upgrade paths |
| 7 | Unmarked O(n²) scan in the backstop | Fixed: the sweep is linear |
| 8 | Stale line numbers in the missing-keys entry | Fixed |
| 9 | Escaped backticks and a duplicated paragraph in this stream | Fixed |
| 10 | Blocks recomputed per visit; two per-file caches | Fixed: one cache entry per file |
| 11 | `Footer` reads the context twice | **Deliberately kept.** It needs one untyped call for `nav.sponsorPortal`, a key that does not exist; the second read is named `untypedT`, commented as that defect, and goes when the key is added |

**Round seven** (14). Its verdict on the code was that it "looks right"; most findings were about what
the round claimed and recorded.

| # | Finding | Disposition |
|---|---|---|
| 1 | JSDoc skip still untested | Fixed by deleting it; disabling the sweep now fails both JSDoc cases |
| 2 | Free-adoption inventory missing four promises | Fixed: rebuilt from each source line read in context |
| 3 | Decision still described the pre-fix backstop | Fixed |
| 4 | `adoptionFeeDog`/`Cat` are read by nothing public | Fixed: the entry now points at the per-pet field, the only one that reaches a page |
| 5 | Wrong counts — emails, a conditional wizard line, a medical-records line | Fixed: twelve places, two emails, one to applicants |
| 6 | "Nothing contradicts on screen" was unobserved | Fixed: scoped to seed data and marked ASSERTED |
| 7 | Round six's dispositions were missing | This table |
| 8 | Provider docs still said eighteen missing keys | Fixed: seventeen |
| 9 | `nestedRanges`' doc sat on `stripComments`' doc | Fixed: each doc above its own function |
| 10 | JSX-text filter was the same unmarked pairwise scan | Marked with a `ceiling:` and its upgrade path |
| 11 | Navbar half of the shared key unpinned | Fixed: a test opens the menu by hover; probed against a drifted label |
| 12 | A cheaper way to catch missing params: detect a leftover `{name}` | **Not implemented.** Recorded in the ceiling as the cheaper upgrade path. It changes runtime behaviour for every key and would fail any existing test that renders a placeholder without params — a site-wide change, made at the end of a review loop, would itself need another round |
| 13 | `visit` looked up the same cache entry three times | Fixed; the now-unused `readStripped` went with it |
| 14 | `decisions/` entries rewritten in place, against `tasks/README.md` | **Answered, not changed.** These entries exist only on this unmerged branch; nothing has been decided until it merges, and revising a draft is not reversing a record. The README states no exception for drafts. Whether it should is the owner's call |

## Round eight — reviewing round seven's fix

Reviewed `4744020` alone. No correctness bug in the code. It confirmed that deleting the JSDoc skip
was safe (eight edge cases, identical output). Ten findings were about tests and claims, all
confirmed by reading the cited lines:

| # | Finding | Disposition |
|---|---|---|
| 1 | The navbar test works around a real defect: hover opens the desktop menu, click toggles it shut | **Recorded, not fixed:** `tasks/open/desktop-nav-menus-close-on-the-click-that-hover-opened.md`. A site-wide menu behaviour change, and keyboard users depend on the toggle |
| 2 | The navbar test checked a literal, so English drift passed | Fixed: both languages compared against `translations[lang].nav.sponsorWall`. Probed: an inline `"Sponsor Wall"` now fails the `en` case |
| 3 | A test comment still described two layers after the skip was deleted | Fixed |
| 4 | The navbar and footer label three other links differently | **Recorded, not fixed:** added to `tasks/open/home-page-copy-is-duplicated-outside-the-dictionary.md`. Choosing wording is a copy decision |
| 5 | The provider doc still kept a missing-key count by hand | Fixed: the count is gone, the doc points at the ledger entry |
| 6 | The leftover-`{name}` upgrade path was oversold | Fixed: the ceiling now states its limits (rendered keys only, test-only, misfires on braces in a value) |
| 7 | `importMap` re-read the cache entry `visit` already held | Fixed: `visit` passes the entry |
| 8 | The JSX-text ceiling's sizes were off by about ten times | Fixed: the measured figures (about 400 nodes, at most 42 ranges) |
| 9 | A `length > 0` assertion that could never fail | Deleted; `getAllByRole` is the presence check |
| 10 | A navbar test living in the footer file | Moved to `tests/components/navbar.test.tsx` |

Round eight found no correctness defect and nothing that changes what the PR claims. Its own fixes
are still new code, so round nine reviews them.

## Round nine — reviewing round eight's fix

Reviewed `131bf8c` and the ledger in `ea724d3`. No product-code defect. It confirmed the ledger's
menu claim by probe (swapping hover for click fails both language cases), and the ceiling's sizes as
an upper bound. Three findings, each confirmed against the source:

| # | Finding | Disposition |
|---|---|---|
| 1 | The navbar/footer table listed three drifting links; five drift, and `/donate`'s English matches | Fixed: all five, with the mobile labels. **`ea724d3`'s commit message still says three**, and history is not rewritten for it — this row is the correction |
| 2 | The footer half of `nav.sponsorWall` was pinned only in Malay, against a literal: the gap round eight closed in the navbar | Fixed: both languages against the dictionary. Probed: an inline English `"Sponsor Wall"` in the footer now fails the `en` case |
| 3 | `importMap`'s new default parameter was never used | Fixed: the entry is a required parameter |

Each of these was the same shape: a fix applied to the case in front of it and not to its twin. That
was the lesson the review loop kept teaching, so it is written down —
`tasks/lessons/2026-10-14-a-fix-for-one-half-of-a-pair-must-be-checked-against-the-other.md`.

## Round ten — reviewing round nine's fix

Reviewed `6a92009` and `72a0fd3`. The code is correct: the footer test fails on an inline English
label, as claimed, and the `importMap` change is safe. The ledger rewrite was wrong again, in the
commit that wrote the lesson against exactly this. The rewrite claimed to have enumerated every
`href`, but the enumeration was done from memory. It missed `/bulletins`, a seventh shared link,
which matches. It left "the other three" one paragraph below a table of five. It listed three of the
five labels the navbar gives `/pets`, and its English summary named one partial match out of two.
Round nine's row 1 above repeats that summary and is superseded here.

Fixed by doing what the lesson says: `grep` every `href` literal in both files, intersect the lists,
and read each label at its line. Seven shared, two match (`/sponsors`, `/bulletins`), five drift;
every navbar label for each is in the table. Round ten's findings were ledger text only, and this
fix changes no code, so no round eleven was run on it. **That is a stated gap:** the corrected table
has been checked only by the grep it came from.

## Round eleven, and the first check against a served build (2026-10-15)

The gap above did not stay open: round eleven reviewed `9c0bebe` the next morning, re-deriving the
`href` sets from source on its own. Every factual claim held — seven shared, two matching, five
drifting, every label and key value exact. Two wording nits, both fixed: `/pets` has five labels
but only three distinct English wordings, and the mobile labels render behind an emoji, so an
accessible name is not the source string alone.

Until now every claim in this stream was checked by unit, component and integration tests, a build,
and CI's Playwright golden paths, none of which target these three defects in a browser. The Vercel
preview is behind Vercel's login, so the production build was served locally with `next start`
(throwaway secrets — the startup guard also requires `STAFF_INVITE_SECRET`; no `.env.local`, so no
database) and driven with Playwright from a script outside the repo:

- **#77:** `/` mounts **0** elements with `role="dialog"` or `aria-modal`.
- **#80:** every same-site link carrying a fragment, collected from `/`, `/pets`, `/bulletins`,
  `/get-involved`, `/faq` and `/donate`, resolves: `/#how-it-works` and `/get-involved#volunteer`,
  each linked from all six. Clicking the footer's Adoption Process link on `/pets` lands with the
  section 96px from the top, below the sticky header.
- **#78:** with Malay chosen the way the language switch stores it, `/` shows 32 Malay dictionary
  values and `/bulletins` 16, and **no** English dictionary value of 12 characters or more whose
  Malay differs. The dictionary was loaded from `translations.ts`, not typed into the script.
- `<html lang>` read `ms` in the browser and `en` in the served HTML, even with the Malay cookie
  sent. That is what `tasks/open/served-html-is-english-whatever-language-the-reader-chose.md`
  says: the provider corrects it after hydration.

The same script at a 390px phone viewport with touch gave identical results. The mobile menu stayed
closed there, so its links were not collected; none of them carries a fragment (read from
`Navbar.tsx`), and all but its bulletins link (`nav.bulletins`) use inline ternaries the dictionary
comparison cannot see. *(From "and all but" to the end of the `#volunteer` sentence, this was
rewritten after round eleven by the fixes for rounds twelve, thirteen and fourteen.)*
Four of those are in the drift table above (`/pets` twice, `/donate`,
`/applications/track`). `/faq` and the `/get-involved` page are not: the footer has no `/faq` link,
and links that page only at `#volunteer`, which is a table row of its own. What
this does not cover: a real screen reader, and
production data — with no database, the bulletin and pet content is whatever the fallback serves.

## Round twelve, and why the loop stops

Round twelve reviewed `457b791` and confirmed every source claim — the `/pets` labels, no fragment in
the mobile menu, `lang` set client-side, `STAFF_INVITE_SECRET` required by the startup guard, the
storage key. Two overstatements in my wording, both fixed: the mobile menu's "Browse All Animals"
button has no emoji (its six text links do), and its bulletins link reads `nav.bulletins` rather
than an inline ternary. Both re-checked by listing every emoji-bearing line of `Navbar.tsx` with a
Unicode-property match — `grep -F` on an emoji returned 0 under Git Bash, a false negative.

**Corrected 2026-10-15.** The paragraph that stood here stopped the loop on a false premise, and
`deea461`'s commit message repeats it; history is not rewritten. The owner then asked for round
thirteen, and review continued. Rounds ten to seventeen:

| Round | Reviewed | Findings | Disposition |
|---|---|---|---|
| 10 | `6a92009` (tests), `72a0fd3` (ledger) | Tests correct. Drift table missed the shared `/bulletins` link and two of `/pets`' five labels, said the other three under a table of five, and named one English partial match out of two | Table rebuilt from a grep (`9c0bebe`) |
| 11 | `9c0bebe` (ledger) | Five `/pets` wordings claimed, three in English; mobile emoji prefix not mentioned | Fixed (`457b791`) |
| 12 | `457b791` (ledger) | Said each mobile label renders behind an emoji, but one button has none; said its labels are inline ternaries, but bulletins reads its key | Fixed (`deea461`) |
| 13 | `deea461` (ledger) | Loop-stop premise false, also in its commit message; a sentence implied every inline mobile label is in the drift table | Two fixed (`3d455db`); commit message recorded only |
| 14 | `3d455db` (ledger) | Round twelve misdescribed; an unmarked in-place edit; a finding count that called a recorded item fixed; an ambiguous sentence about footer links | Fixed (`0fff8b5`) |
| 15 | `0fff8b5` (ledger) | The table sorted rounds eleven and twelve by different standards; an in-place edit marker omitted round twelve and the `#volunteer` sentence; round fourteen had no dispositions; the code-defect sentence did not say only round ten had code in scope | Fixed (`5b149c3`) |
| 16 | `5b149c3` (ledger) | A causal sentence omitted the owner's request; a motive claim; a claim the record no longer labels rounds; row 15 misdescribed; the lesson labelled findings and paraphrased inside quotation marks; long lines | Fixed (`78aa18c`) |
| 17 | `78aa18c` (ledger) | Each round since was said of rounds ten to sixteen; row 15 misdescribed again; the lesson quoted a phrase not in the record; a rewrap dropped two words; row 16 had no hash; that commit's message counts four rewrites where the record shows three | Fixed by the commit after `78aa18c`; the commit message recorded only |

Only round ten had code in scope, and that code was correct.

## Round thirteen, and an accessibility-tree check

Reviewed `deea461`. No code defect; every Navbar claim held when re-derived (six emoji lines, the
button without one, bulletins on its key, no mobile fragment). Three findings: two fixed — the false
loop-stop premise above, and a sentence implying every inline mobile label is in the drift table —
and one recorded but not fixed, the same premise in `deea461`'s commit message.

A real screen reader was not available, so the production build was served locally again and
Playwright's accessibility snapshot — what assistive technology is handed — was read on `/` and
`/bulletins` with Malay chosen. `lang` is `ms` after hydration on both. Every heading is Malay, in
order (`/`: one h1, then h2/h3 sections; `/bulletins`: h1 "Buletin Pusat Perlindungan", h2 "Semua
Buletin"), except the bulletin's own title — content, which has no Malay column, already out of
scope. No English dictionary value is in either tree, and no link lacks an accessible name. This is
the tree a screen reader reads from, not a screen reader's behaviour: announcement order, and how a
pre-hydration `lang="en"` is spoken, remain unverified.

**What still needs the owner:** the Vercel preview is behind Vercel's login, and no browser tool
here carries that login, so the branch has not been seen against real data.

## Merged with #109, #103 and #113 (2026-10-15)

#109 merged cleanly (`940f6d7`); none of this branch's ledger line citations moved. Then, as the
owner asked for the PR to be merged, #103 and #113 landed and the PR went conflicting, so it was not
merged; `master` was merged in first (`2a618b6`).

#103 rebuilt the bulletin feed this branch had translated: a read-only Server Component fed by a
server store, no admin controls, category labels lifted into a shared presentation table. The
resolution keeps all of that and translates through it — a `Translated` client leaf per fixed
string, `labelKey` added to #103's table rather than a second map, master's server-read
`bulletins` plus this branch's `titleKey` on each page, master's admin sidebar unchanged, #103's
outage-safe empty-state wording in both languages, and the removed toggle's two keys deleted. The
Malay test of that toggle now pins its absence. Two probes: an English chip label fails five cases,
an added button fails two.

Records corrected for it: the bulletin admin-chrome decision (its named exception no longer
exists), two open entries describing the old feed, and the same drift-log entry filed by both
branches, now one entry with the second session's observation kept. Bulletins now store Malay text
(#103) that the public feed does not yet render, by #103's decision; the out-of-scope note says so.

On the merged tree: `npm run check` 0 errors and 13 warnings, the new one in #103's
`BulletinFormDialog.tsx`; unit 104 files, 1820 tests; components 18 files, 228; integration 92;
build compiled with `/` and `/bulletins` static. The served-build browser checks passed unchanged,
plus a new one: `/pets`' feed heading in both languages, with no button in the feed.

## Review of the merge resolution

Reviewed `2a618b6` and `95679b7`: nothing from #103 or #113 lost or altered — every conflicted file
was compared with `master`'s. Three findings, each confirmed and fixed:

| Finding | Disposition |
|---|---|
| #103 handed the render side of the Malay bulletin columns to the entry this branch settles and deletes. The delete merged silently, leaving four pointers to a missing file and no owner | New entry `tasks/open/bulletin-malay-text-is-stored-but-not-rendered.md`; the four pointers in `schema.prisma`, `bulletinRepository.ts` and #103's decision now name it. The two mentions in other sessions' streams are left as written |
| The no-staff-control test checked buttons only; an "Edit notices" link passed it | Also asserts no link. Probed: that link now fails both languages |
| The admin's English category `label` and the dictionary's English could drift apart | `tests/unit/bulletinPresentation.test.ts` pins them equal and the Malay distinct. Probed: relabelling one fails it |

Its fixes were reviewed in turn. One finding: the no-link case rendered only a text notice, so a link
added inside the video or image branch passed it. It now renders one notice of each media type;
probed with a link in each branch, and both fail. That review also confirmed every claim in the new
open entry and that the schema change is comments only (`prisma validate` passes).

## Verification

As of round seven, on the tree merged with `master` at `187593c` (current figures are in the
section above):

- `npm run check` — 0 errors, 12 pre-existing warnings, one fewer than at the base.
- `npx vitest run --project unit` — 100 files, **1614 tests**; 0 assertion errors, 0 timeouts.
- `npx vitest run --project components` — 15 files, **213 tests**; 0 assertion errors, 0 timeouts.
- `npm run test:integration` — 9 files, **92 tests**.
- `npm run build` — compiled; `/` and `/bulletins` both still `○ (Static)`.

Both full tiers were green on this run and timeout-red on others; that is
`tasks/open/unit-suite-is-order-dependent-in-both-directions.md`, and one green run is a data
point, not a fix. Each new suite was run against the unfixed code first and observed failing, and
every repair to the guard was re-probed by breaking it again afterwards.

Two gaps in the record, stated so nobody infers more than happened. `f7dd5b2`'s commit trailer
named only a subset of the component suite and no unit run, for a change to the dictionary; the
parity test was run afterwards and passes, so the gap is in the record rather than the code. And
one `homeMalay` run on 2026-10-14 reported a single failure whose error was not captured, because
its output had been filtered to the summary line; three runs immediately after were green, and it
is recorded as unexplained rather than attributed to the flake.
