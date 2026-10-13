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
