# Bulletins get a Prisma model and a staff editor, not a removal

**Decided:** 2026-09-22

This is the answer to **P-D for `Bulletin`** in `docs/tasks/TARGET_SCHEMA_TYPE_INTEGRITY.md:193`,
which asked for a per-type decision on four typed concepts with no persistence and had gone
unanswered since 2026-08-27. It settles
`tasks/open/bulletins-are-a-per-browser-demo-anyone-can-edit.md` (issue #76).

## The choice

Three options were costed and put to the owner before anything was built:

- **(a) A real server-side store** — a `Bulletin` Prisma model, writes only through a
  `MANAGE_CONTENT`-guarded server action, a staff editor at `/admin/bulletins`.
- **(b) Take the feed off the public pages** until (a) happens.
- **(c)** — not in the brief, offered as a third path — **server-render the committed fixture
  read-only**: delete the client store, the modal and the toggle, read `src/data/bulletins.json`
  through a `src/lib/server/` reader, keep the feed on all three pages. This fixes all three
  observed defects with no schema change and no production risk, and staff post by deploy.

**The owner chose (a).** (c) was recommended on cost grounds and declined; the deciding factor is
the one thing (c) does not deliver — staff posting a notice without a deploy, which is the actual
job the feed exists to do. An urgent-foster notice that waits for a deploy is not an urgent-foster
notice.

Recording (c) here because it remains the cheap reversal: if the table turns out to be a
maintenance burden nobody uses, the way back is not (b) but (c) — keep the reader, drop the
writer.

## What the model does differently from `Faq`, and why

`Faq` was the template, but two departures are deliberate and a reviewer will ask:

- **No `displayOrder`.** FAQ answers have no natural sequence, so they need manual ordering. A
  bulletin feed has one: pinned first, then newest, which `isPinned` + `publishedAt` already
  express. A `displayOrder` column would be a second, conflicting ordering staff would have to
  keep in step with the dates by hand.
- **`publishedAt` is separate from `createdAt`.** The card prints a notice date, and an editor
  must be able to correct it or post-date a clinic announcement without lying about when the row
  was written. `ExpenseItem.date` splits the same way.

**`titleMs`/`contentMs` are added now although nothing renders them.** The public feed stays
English-only — that half belongs to
`tasks/open/home-page-text-stays-english-on-the-malay-site.md`, which owns the render side. The
columns exist now because adding them later means a *second* hand-run DDL migration against a
production branch with no Prisma down path, and P-C in the same target doc warns specifically
about baking a violation into columns. The editor writes them; **nothing reads them yet**, and
the repository does *not* resolve English into them — a first draft of this entry and three code
comments all claimed it did. Whoever settles the multilingual entry adds the fields to `Bulletin`
and the `titleMs ?? title` fallback together; adding the field alone ships a blank Malay title for
every untranslated row.

## The byline is taken, not given

`authorName` is set by the action from the verified session and is absent from the form schema.
An edit does not reassign it. Two reasons: a free-text byline lets any `CONTENT_EDITOR` publish
under a colleague's name, and correcting someone's typo should not silently put your name on
their notice. It is a point-in-time snapshot in the same sense as
`AdoptionApplication.petName` — it must survive the staff member's row being deleted and must not
change when someone is renamed. Accountability for who actually wrote it lives in the audit log,
which records `actorId`.

## Media URLs are checked on the way out, not just on the way in

`videoEmbedUrl` is interpolated into an `<iframe src>` on three public pages and had no allow-list
at all. `bulletinFormSchema` now rejects a non-allowlisted host on write, and
`src/lib/domain/bulletinMedia.ts` filters again on read.

**The read-side check is the enforcing one**, and it is not redundant: rows reach this table
without passing the action. `prisma/seed.ts` inserts fixtures and
`prisma/migrations/manual/20260922_community_bulletins` is applied by hand against a branch this
code never sees. A write-time check alone would be a guard on the one path already trusted.

The image allow-list is a deliberate copy of `next.config.ts` `images.remotePatterns` rather than
an import — build configuration should not enter the runtime bundle — and a test asserts the two
agree, which is what AGENTS.md "Boundaries and duplication" asks for when two copies must.

## The admin nav loses its ungated-tab escape hatch

`src/app/admin/layout.tsx` had `permissions: null` on exactly one tab — "Community Bulletins",
pointing at the **public** `/bulletins` page. That is how the tab was shown to every role
including Volunteer, and how staff were sent to a page whose "editing" wrote to their own browser.
The tab is now `/admin/bulletins` gated on `MANAGE_CONTENT`, and **the `null` opt-out is removed
from the filter** so a future tab must name a permission. Removing the shape of the mistake, not
just its instance.

## The rickroll

`src/data/bulletins.json`'s `bulletin-003` embedded YouTube `dQw4w9WgXcQ` under the title "Video
Update: Toby Settling into His New Home" — sample content live on the public `/bulletins` page.
It is now an image notice with the same copy and the same photo, and no fixture row carries an
embed URL. The embed path is exercised by tests rather than by shipped content. Nothing invented
a replacement video, because there isn't one.

## How this reaches production

**Not with `npm run db:push`.** That reconciles the whole schema, and
`tasks/open/production-schema-has-drifted-ahead-of-master.md` records three destructive statements
currently standing between master's schema and the production branch — two of which lose data and
have nothing to do with bulletins. Running push to add this table would execute those too.

The deliverable is `prisma/migrations/manual/20260922_community_bulletins/migration.sql`, applied
by `npm run db:migrate:bulletins`. It is purely additive — three `CREATE TYPE`, one `CREATE TABLE`,
one `CREATE INDEX` — so it cannot participate in that drift in either direction. Its `DROP`
counterpart is written into the file's header comment, because `db push` has no down path and the
undo has to exist somewhere a human can find it.

**It was rehearsed, not reasoned.** Against PostgreSQL 18.4 from `embedded-postgres`: the
hand-written SQL produces objects byte-identical to what `prisma db push` created, re-running it
is a no-op, and the database rejects an out-of-vocabulary category. See
`tasks/lessons/2026-09-22-a-published-npm-tarball-is-not-what-npm-extracted.md` for the one thing
that nearly stopped the rehearsal.

## The review round

`/code-review` against `origin/master` returned **fourteen findings**, and most were real. They are
recorded here rather than only in the commit because two of them changed a decision above.

**The admin-only index is gone, not fixed.** `@@index([publishedAt])` could not serve the query
its own comment named — `listBulletinRecords` sorts by `isPinned` first — so Postgres seq-scanned
and sorted regardless, and the index cost a write on every create, edit, pin and publish. At
shelter scale the scan is correct; the index was write amplification with a comment claiming
otherwise. A `ceiling:` on the model says when to add `@@index([isPinned, publishedAt])` back.

**The migration script inserts and no longer upserts.** It advertised itself as the safe way to
reach a hosted branch while its `ON CONFLICT DO UPDATE` would silently revert staff edits to any
seeded notice — through `pg`, so with no audit entry. The fixture is launch content; once a notice
exists the editor owns it. `prisma/seed.ts` keeps its upsert, because `assertSeedTargetIsLocal`
means it cannot reach anything but localhost, and refreshing a dev database is what a seed is for.

Three findings were **documentation lying about code**: the repository, the schema and the type all
claimed the English copy is resolved into missing Malay fields. It is not, and `Bulletin` has no
Malay fields at all. That one would have cost the next person real time — they would have added
`titleMs` to the interface, trusted the fallback, and shipped a blank Malay title for every
untranslated row, which today is all of them.

One finding was **declined**: `toDateString` duplicates a private `toDayString` in
`applicationRepository`. True, but the pattern has twenty pre-existing sites across `src/`, so
lifting a shared helper is a repo-wide refactor and does not belong inside a security change.
AGENTS.md asks for a third occurrence before abstracting; this is the note that it has arrived.

Every correction carries a test, and each of those tests was checked against a mutant of the code
it covers — see
`tasks/lessons/2026-09-22-a-mutation-probe-must-never-restore-over-uncommitted-work.md` for the
way that check went wrong the first time and what it now requires.

## The second review round, and why it mattered

The fix commit was reviewed on its own, per the standing order that a fix round is new code nobody
has read. It found **thirteen more**, and two of them defeated what the fix commit claimed:

**The tiebreaker was ascending.** `publishedAt` is a calendar day, so ties are ordinary rather than
exceptional, and an ascending tiebreaker resolves one to the *oldest* notice. A two-item feed
therefore dropped the notice written most recently that day — permanently, not intermittently. The
first fix turned an intermittent bug into a deterministic one and its comment claimed the opposite.
Every clause is descending now.

**Dropping the retired index left databases in drift.** Deleting the `CREATE` was not enough:
anyone who had run the earlier revision held an index the schema no longer declares, which
`check-drift` classifies as destructive and which blocks `npm run db:push` with guidance blaming
another worktree's branch. The migration now carries `DROP INDEX IF EXISTS`. Rehearsed on a
database seeded with the stale index: cleared by a re-run.

The ordering moved to `src/lib/domain/bulletinOrdering.ts` because it could not otherwise be
tested. The database path delegates ordering to Postgres and the committed fixture has no two
notices on one day, so the rule — the part that was wrong — was reachable by no test. `planFaqRenumber`
sets the precedent for pure ordering logic living in the domain layer. The query and the in-memory
path now share one exported declaration rather than two literals free to drift.

**The standing order earned its place here.** Ten of the first round's findings were fixed in one
commit, and that commit introduced two defects worse than several it repaired. Reviewing it caught
them before they reached master. Twelve mutants across both rounds, all killed.

## Rounds three and four, and the one rule that took four attempts

Reviewing each fix round found defects in the previous one, every time.

The feed's tie ordering is the whole story in miniature. Round 2 found the rule had no
tiebreaker, so a limited feed showed a different pair on each regeneration. Its fix made the
tiebreaker **ascending**, turning an intermittent bug into a permanent one — the newest notice of
a tied day was always the one dropped. Round 3 found that; its fix truncated `createdAt` to a day
"for consistency", so every row compared equal and the tiebreaker was dead again. Round 4 found
*that*; the restored instant was real but every fixture row carried the same epoch, so it was
still dead on the only path that runs it. The fixture now derives its instant from the notice
date, which is distinct wherever the notice dates are.

**Four commits, each claiming in a comment to have fixed one ordering rule.** That is what
`tasks/lessons/2026-10-13-a-comment-asserting-a-mechanism-is-a-claim-to-run.md` is for, and it is
the clearest evidence this repo has that CLAUDE.md step 6 — review the fix round too — is not
ceremony.

Round 4's other corrections worth recording as decisions rather than diff:

- **The notice date now has an upper bound of five years.** Post-dating is intended, but the feed
  has no `publishedAt <= now` predicate and sorts descending while `/` and `/pets` show two
  notices. So `2062` for `2026` published instantly, sorted above everything real, and would have
  held a home-page slot for thirty-six years with nothing on screen explaining why newer notices
  stopped appearing. A ceiling, not a rule against future dates.
- **All three enum selects in the editor handle a stored value this build does not carry**, not
  just `category`. And the mechanism is stated correctly now: it buys a readable message, nothing
  more — `zodResolver` is what refuses the write, and an earlier comment claiming the option
  prevented data corruption was describing something `z.enum` already made unreachable.
- **`Object.freeze` moved to the lists that decide.** It had been applied to the host list used
  for message text and withheld from the two that gate the checks.

Five of round 4's findings are in `master`'s adoption code, arriving here with the `#93` merge.
They are not fixed on this branch — a correction to a public submission path does not belong in a
PR about community notices — and they needed no entry from me: the session that wrote `#93` had
already filed them.

## Round five: the whole PR against current master

The final whole-diff review before merge found fifteen; none was probed by the reviewer, so each
was verified before being accepted or declined. Four change decisions recorded above.

**The public read no longer serves the fixture on just any failure in production.** This departs
from the FAQ and pet repositories on purpose. Their fixtures are content that stays roughly true;
this one is four launch notices staff will edit and delete, so on a transient failure it brought
back deleted notices, hid everything staff posted, and — `/` and `/bulletins` being ISR — cached
that as the good page for five minutes, with no log because production swallows the error. Now:
outside production, fixture as before; in production, fixture only for P2021 (the table does not
exist, i.e. the code deployed before the migration — where the fixture *is* the launch content);
otherwise no notices, and a `console.error`. Whether FAQ and pets should follow is their own
question; their fixtures do not go stale the same way. See
`tasks/lessons/2026-10-14-a-copied-fallback-copies-its-assumption-about-the-data.md`.

**A future notice date schedules the notice.** The feed had no date predicate and sorts newest
first, so a notice dated next month took the top unpinned slot above everything posted today.
`publishedAt` is now also the go-live day, compared against the **shelter's** day
(`Asia/Kuala_Lumpur`): UTC would hide an urgent notice posted between midnight and 08:00 local
for up to eight hours, since the form dates it today, local. The editor badges a published
future notice "Scheduled". The five-year ceiling stays, with a new reason: a slipped digit now
schedules a notice decades out, which is silent rather than loud.

**The migration script seeds only on the run that creates the table** (or with `--seed`).
`ON CONFLICT DO NOTHING` protected an edited notice but not a deleted one. Rehearsed on a real
Postgres: after a staff delete and edit, a re-run skipped the seed, the deleted notice stayed
deleted, and the edit survived.

**The target labels say every page a notice appears on.** `/bulletins` is the archive and reads
with no target filter, so "Home page" promised an exclusivity that did not exist. Behaviour is
unchanged; the labels and the schema comment now describe it.

Declined, with reasons:

- **Transactional audit on delete.** Every content type here audits fire-and-forget; making one
  of them transactional is a repo-wide durability decision. Marked with a `ceiling:` comment.
- **Fixing `FaqDataTable`'s identical transport-failure handling.** The bulletin table now catches
  a failed server action instead of letting React 19 send it to the error boundary; the FAQ table
  has the same pattern and is another feature.
- **Editing `src/lib/validations/pet.ts`'s date check**, which still refuses years 0000-0099. Filed
  as `tasks/open/three-calendar-day-validators-disagree.md`; that file was under active work by
  other branches.

Filed for the owner, not fixed: `tasks/open/bulletin-bylines-publish-staff-names.md` — every post
puts an editor's personal name on three public pages, and there is no way to post as a team.

## Round six: reviewing round five's fixes — and reversing one

**This reverses round five's seeding rule.** Round five made the migration script seed only on the
run that *creates* the table, to stop a re-run resurrecting deleted notices. That fixed the
resurrection and broke the launch. The migration's own header names `prisma db execute --file`
as a way to apply it; applied that way, the script finds the table already there and seeds
nothing — and because production stops serving the fixture once the table exists, every public
feed would have been empty from day one.

The rule is now **seed an empty table, leave a non-empty one alone**, in one transaction under the
migrations' advisory lock (so a failure mid-seed rolls back instead of leaving a half-seeded table
the next run refuses to touch). `--seed` is gone; npm swallowed it without `--` anyway. Rehearsed
on a real Postgres in both directions: the SQL applied alone, then the script — it seeded four;
then a staff delete and a re-run — the deleted notice stayed deleted. The residual case is stated
in the script: if staff delete *every* notice and someone re-runs it, the launch notices return.

Other corrections worth recording as decisions:

- **Whether to serve the fixture is now asked of the database first** (`isDatabasePersistent()`),
  not of `NODE_ENV`. With no `DATABASE_URL` the fixture is the only data, so a production build
  without a database no longer prerenders empty feeds. Production also logs the P2021 fallback,
  which was the one path with no trace.
- **"Today" for the form's default date is the shelter's day too**, not the browser's. The
  date decides when a notice goes live, so a browser-local default could schedule an urgent notice
  by accident for an editor outside Malaysia. The day is assembled from `formatToParts`, and the
  bound is `< start of the next shelter day` because the column defaults to `now()`.
- **A missing column (P2022) has its own editor message.** Sending it to the table migration was
  the wrong fix; that migration only creates what is absent.

Declined: moving `orNullIfMissing` to a shared module. There are two private copies now (this
repository and transparency's), and AGENTS.md says to wait for a third occurrence. The bulletin
copy collapses four try/catch blocks, which was the part of the finding that mattered.

Twenty-seven mutants across six rounds, all killed.

## Round seven: converging

Ten findings, smaller than any round before — fixed: a seed `ROLLBACK` that could mask the real
error and return a broken client to the pool; a production warning firing on every request to
the force-dynamic `/pets`; an ICU formatter built per row; a missing `ceiling:` marker; two
tests weaker than their names.

Declined, with reasons:

- **Inlining the seed into `migration.sql`** (`INSERT … WHERE NOT EXISTS`), so applying the file
  any way seeds atomically. It would put the launch content in a second place, free to drift from
  `src/data/bulletins.json`, which the offline fallback serves. The failure it guards against —
  the SQL applied on its own and the script never run — yields an empty feed, which this design
  treats as the safe answer. The migration header now says plainly what applying it alone does.
- **Locking the edit's `before` read.** Two editors saving the same notice at the same instant can
  make the audit's `before` slightly stale. A correct fix needs `SELECT … FOR UPDATE` inside a
  transaction; for audit precision in a rare race that is disproportionate, and the FAQ
  repository's update has the same shape.
- **Sharing `orNullIfMissing` with the transparency repository.** Still two copies; AGENTS.md says
  to wait for a third.

Filed for the shelter: `tasks/open/bulletin-launch-notices-are-dated-and-pinned.md`. The seeded
launch notices are from August and two are pinned. Once they are real rows the home page leads
with both until someone unpins or deletes them; the clinic notice, which targets every feed, also
leads `/pets`.

## Round eight: converged

The reviewer's own verdict: no correctness bugs serious enough to block. Eight low-severity
findings, seven fixed — one of them a factual error in the public open entry about the launch
notices (the urgent appeal targets the home page and never appears on `/pets`; the entry had it
leading every feed), and one the third instance on this branch of code inserted between a JSDoc
block and its declaration. The scheduling check now takes one "today" per pass, so a render that
crosses the shelter's midnight cannot badge a notice scheduled while counting it live.

Declined: decoupling the log-once flag from `resetBulletins`. That reset is test-only, and clearing
the flag there is what stops one test's warning from silencing the next.

## Round nine: round eight's fixes, reviewed properly

The first review of round eight's fixes returned nothing after one tool call, and the hand
review that stood in for it found nothing. Retried, it found seven. That gap is
`tasks/lessons/2026-10-15-an-empty-review-is-a-review-that-did-not-run.md`.

Fixed:

- `isScheduledForLater` now **requires** `today`. The default made the per-row call (the
  footgun round eight set out to remove) the easy one to write, so the compiler now refuses it.
- Round nine also made `getPublicBulletins` take one instant per request. **That was wrong,
  and round ten reverted it.** The query path and the fallback path are mutually exclusive:
  the fallback runs only after the query threw, so no response mixes their two days. I
  accepted the finding without checking that.
- A test now fails if "today" goes back into the per-row filter. Before it, reverting round
  eight's headline fix left the suite green. (Round ten rewrote it to check behaviour.)
- Console spies are restored in the file's `afterEach`, so a failing assertion can no longer
  leave `console` muted for the rest of the file.

Declined, with reasons:

- **The lazily built formatter "only moves" a missing-zone `RangeError`.** True, and the move
  was the point: one call fails instead of every importer. In production the read logs that
  error and serves an empty feed, which is the contained outcome. A Node runtime without full
  ICU is not one this app supports.
- Round nine declined the finding that **the admin table computed `today` per render**, so a
  server render and its hydration could straddle midnight. That decline was wrong, and round
  ten fixed it: under React 19 the mismatch is a recoverable error that discards the server
  HTML, not a warning, and the fix was one prop.
- **Destroying versus releasing the seed's client has no effect before `pool.end()`**, and a
  ROLLBACK on a half-open connection could hang. The first point is true and harmless. The hang
  applies to every query in the script, not just ROLLBACK, and the operator can interrupt it.

## Round ten: reviewing round nine's fixes

Eight findings. Round nine's own fix round had two of the defects. Fixed:

- **The one-instant change is reverted** (see above). It protected nothing, and it made the
  fallback judge against an instant taken before a query that may have spent seconds failing.
- **The admin table takes `today` as a prop** from the server page, so the server render and
  its hydration judge "Scheduled" against the same day. The `ceiling:` comment now covers only
  what remains: a tab left open past midnight keeps last night's badges until a write or reload.
- **The ninth-review test checks behaviour.** It pins the shelter's day to 2026-08-13, so
  `bulletin-001` (dated the 14th) is scheduled, and asserts that the fallback hides it and
  serves the other three. Before, every fixture row was in the past, so a dropped `!` in the
  fallback's date check passed. It keeps a single call-count assertion as the only observable
  stand-in for "one day per pass", with the reason in the test. Three mutants killed: a per-row
  day, an inverted check, and the check removed.
- The lesson's dates are now explicit.

Refuted: **"fake timers leak into every later test."** The sixth-review `describe` restores
real timers in its own `afterEach`, which the finding missed.

Round nine's count of three mutants is corrected. Two of them targeted the reverted instant
change. The total stays at 32 (29 + per-row day, inverted check, removed check), all of them
behaviour or the one stated stand-in.

## Round eleven: converged on the code, tightened the tests

The reviewer found no correctness bug in round ten and six weaker points. Fixed:

- **The `today` prop had no test.** `tests/components/BulletinDataTable.test.tsx` renders a
  notice dated 2030, so any day the table computed for itself would call it scheduled. Only a
  table that honours the prop can call it live.
- **The fallback test could not tell the shelter's day from UTC.** Its clock now sits where
  the two differ (16:30 UTC on the 11th of August is the 12th in Kuala Lumpur), so
  `bulletin-002` is live only under the shelter's zone.
- A comment that had drifted two statements from the `slice` it explains is back above it.

Two mutants killed: the zone swapped for UTC, and the table computing its own day.

Declined, with reasons:

- **The create dialog still takes its default date from the client's `shelterToday()`**, so
  in a tab left open past midnight it can disagree with the table's server-supplied day. That
  is deliberate. The dialog's date is what gets posted, and the server judges it at save time,
  so it should be the current day. The table's day is stale by design, which its `ceiling:`
  comment states.
- **The missing-zone `RangeError`**, as in round nine.
- **The call-count assertion depends on `startOfNextShelterDay` calling a module-local
  `shelterToday`.** True, and stated in the test beside the assertion.

## Round twelve: tests only

Round eleven's first review returned empty after one tool call. It was retried, per the lesson
from round nine, and the retry found no correctness bug and three test gaps, all fixed. The
table spec now has a boundary case (a notice dated the server's day is live, which kills a
`>=` mutant). Its row is dated 2099, so its stated reason holds past 2030. Round twelve also
claimed the fallback test pinned the served list in feed order. It did not, and round thirteen
corrects that.

## Rounds thirteen and fourteen: an assertion that claimed more than it tested

Round twelve's "exact list in feed order" could not detect a broken sort, because the
fixture's file order already *is* feed order. It also tied a scheduling test to the fixture's
whole contents. The fallback test now derives its expected set from the fixture (every
published row dated on or before the shelter's 12th) and compares it as a set. Extra or missing
rows still fail it, and a launch notice added to the fixture does not. It also names its two
load-bearing rows outright (`bulletin-002` served, `bulletin-001` hidden), so it keeps its
teeth if the fixture changes, and its clock instant and shelter day sit side by side as one
pair. **Fallback ordering is covered by two other tests, not by this one**: "sorts pinned
first, then newest, and applies the limit afterwards" and "breaks a same-day tie on the
fixture path". A probe that removed the fallback's sort failed exactly those two, and the
comment beside the assertion named them. (Round fifteen replaced the titles with a
description.)

The table spec freezes the clock in 2026, so a day the table computed for itself would be
2026 even after the real clock passes 2099.

All six scheduling mutants were re-run against the final assertions, and each failed its
target test:

| Mutant | Killed by |
|---|---|
| "today" computed per row in the fallback filter | the fallback test's call count |
| date check inverted | the fallback test |
| date check removed | the fallback test |
| shelter zone swapped for UTC | the fallback test (`bulletin-002`) |
| `>` replaced by `>=` | the table's boundary spec |
| table computes its own day instead of the prop | two of the three table specs |

Declined, with reasons:

- **The test's oracle restates the rule it tests.** It does, for the derived set. That is why
  the two named rows are asserted first, as facts independent of the rule.
- **Freezing `Date` does not freeze a bare `Intl.DateTimeFormat#format()`**, which reads the
  clock through an intrinsic. True. A mutant would have to reach the schedule module's private
  formatter from the table, and the table imports only `isScheduledForLater`. That is not a
  regression path worth a test.

*(Withdrawn: see "Round fifteen" below.)*

**Where the loop stopped, and why.** Rounds twelve to fourteen changed no product code. Each
review found no correctness bug and a new angle on the same assertion, and each fix invited
the opposite critique (pin the exact list, then don't tie it to the fixture). The loop ends at
round fourteen on that basis: no product code changed, no correctness finding, and every
scheduling rule has a named test that a recorded mutant fails. Round fourteen's own edits are
comments, one test's assertions, and this entry. They are covered by the mutant re-run in the
table above, not by a fifteenth review.

## Round fifteen: the round I tried to skip

The paragraph above, "Where the loop stopped, and why", is **withdrawn**. It treated a mutant
re-run as a stand-in for reviewing round fourteen's fixes, which contradicts CLAUDE.md "Closing
a session", step 6: every commit that fixes an earlier review's findings gets its own review.
PR #103 merged as `bd20b26` with round fourteen unreviewed. Round fifteen reviewed it after the
merge, and its fixes ship in a follow-up PR. The paragraph stays above as the record of what
round fourteen concluded. This section is the correction.

Fixed:

- **The derived set's comment claimed more than it does.** That half of the test restates the
  date rule, so it cannot check the rule. It catches extra or missing rows, and the named rows
  check the rule. The comment now says so. Two attempts on the way there were wrong, and the
  reviews caught both. Calling `isScheduledForLater` from the oracle made the set half blind to
  a mutated rule. Slicing the date "to match the product" guarded a case that cannot happen:
  "dates every notice as a plain calendar day" pins the fixture to `YYYY-MM-DD`. That test is
  the guard, and the only one: an earlier draft of this entry also said a timestamped row
  "would break `freshBulletins()` first", which is false, because it only concatenates the
  string and never parses it. The plain string compare is unchanged from `bd20b26`.
- **The mutant table above understates one row.** The `>=` mutant is also killed by the
  fallback test, through `bulletin-002`, which is dated the shelter's day. The table is left as
  round fourteen wrote it; this is the correction.
- The test comment now says what the test relies on in the fixture: `bulletin-002` published
  and dated exactly the shelter's day, and `bulletin-001` published and dated after it. It
  points at the ordering and format tests by what they cover, not by title, so it has no
  title to go stale.

Re-run against the final test. Each mutant failed its target test, and every file was
restored afterwards:

```
per-row today: KILLED — Tests  1 failed | 149 skipped (150)
inverted date check: KILLED — Tests  1 failed | 149 skipped (150)
date check removed: KILLED — Tests  1 failed | 149 skipped (150)
>= at the boundary: KILLED — Tests  1 failed | 2 passed (3)          (table spec)
UTC day instead of the shelter's: KILLED — Tests  1 failed | 149 skipped (150)
table computes its own day: KILLED — Tests  2 failed | 1 passed (3)
>= at the boundary: KILLED — Tests  1 failed | 149 skipped (150)     (fallback test)
```

## After round fifteen

Further rounds reviewed the follow-up branch. None found a product defect. Their findings were
about this entry's and the test comment's own claims, and each fix cut a claim down. An
attempt to tabulate every finding produced the next round's findings, so the table was
removed. The lesson
`tasks/lessons/2026-10-15-when-reviews-flip-flop-on-a-test-shrink-the-claim-not-the-loop.md`
records the pattern.

**When the review loop ends:** at a round where every finding, after verification, is refuted
or declined with a written reason. Not when I judge the remaining findings small.

The patterns worth taking to the next content type are in the rounds before fourteen: the
fallback copied from FAQ, the tiebreaker that took four attempts, and the seeding rule that one
round reversed. Each has its own lesson file.
