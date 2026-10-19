# TARGET — Make the reconciliation queue and sponsor portal work on production

**Written:** 2026-09-11, at the close of PR #36 · **Revised:** 2026-09-16, after running it against
`origin/master` 5b2672a · **Lane:** GRAVE (production schema is a one-way door)

## Status — 2026-09-16

**Steps 0–5 and 7 are closed. Nothing was applied, because production already had every object.**
§A, which database Vercel serves, was answered by the human the same day. What remains is step 6,
the end-to-end proof, which was always a separate human decision.

- Inventory, raw drift output, and why absence from the diff is presence:
  `tasks/decisions/2026-09-16-sponsor-portal-activation-applies-nothing-to-production.md`
- `/sponsors` and `/sponsor/login` return 200 on production, where this brief predicted a 500.
  That rules out production reading a database without `sponsors`. It could not show production
  reads a database at all; §A did.
  §2 of `tasks/open/sponsor-portal-is-inert-until-reconciliation-is-reachable.md` is resolved.

---

## What the 2026-09-11 version got wrong

Kept because each one will recur in the next brief written the same way.

1. **Its premise was 36 minutes stale, on a branch that could not show it.** The "Recorded state"
   column quoted entries from 2026-09-03/04. The 2026-09-09 re-measure, which lists no statement
   for `sponsors`, `donations` or `receipt_sequences`, reached master through #37 at
   2026-09-10T23:54+08:00. This brief was committed at 00:30 on the #36 branch, which lacked it,
   and still counted "12 destructive drift lines". Write "recorded state" from `origin/master`'s
   ledger, fetched at the time of writing.
2. **Its inventory predated #39.** `2026-09-08_adoption_application_milestones_additive.sql` adds
   nine `adoption_applications` columns and a unique index that every application read and write
   selects. Missing, they would have broken the application form and tracking since #39 deployed.
   Measured present.
3. **It predated 5b2672a.** Public pet checkout now writes `pet_sponsorships` including
   `displayOnWall`, so a missing account column would have failed every pet checkout since
   2026-09-14. Real pending pledges may therefore exist, which changes three things:
   - a Neon branch cut from production copies real supporter PII;
   - the `pet_sponsorships_userId_fkey` validation runs against real rows;
   - step 6 no longer needs a staff test pledge (below).
4. **Its rehearsal and apply commands are denied to agents.** `.claude/settings.json` has denied
   `npx prisma db execute*` and `npx prisma migrate*` since 2026-09-05. An agent prepares, measures
   and verifies; **a human types every `prisma db execute`, rehearsal included.** Ad hoc production
   SQL is a human's too, reads included: on 2026-09-17 the auto-mode classifier refused an agent's
   `BEGIN TRANSACTION READ ONLY` probe as `[Production Reads]`. `npm run db:check-drift` was allowed.
5. **Its K2 was a text match, and neither obvious fix works.** A plain-text `DROP` fires on a
   comment in the milestones file. `isDestructiveStatement` alone passes every file in
   `prisma/sql/`, `UPDATE`s and `DROP TRIGGER` included. A bare keyword list fires on every
   foreign key's `ON DELETE` clause. Step 2 below has the version measured to discriminate.
6. **Its inventory had a blind spot.** Prisma's diff cannot see triggers, so it cannot say whether
   `donation_append_only.sql` guards the receipt rows `/donate` writes whenever a database is set,
   as it has since before 5b2672a. Filed as
   `tasks/decisions/2026-09-21-production-receipts-are-append-only.md`. A human-run probe on
   2026-09-17 found no trigger and 3 receipts; both were settled on 2026-09-21.
7. **Its "master is red" prerequisite** was closed by #41, and step 7 named a "Still outstanding"
   block that the drift entry does not have.

---

## A. Which database Vercel serves — answered 2026-09-16

**Result, from the human in the Vercel dashboard:** `DATABASE_URL` is present, ticked for
Production, and names the `ep-broad-band-…` endpoint, the branch step 1 measured. Two sub-checks
were not reported. First, the variable's "Updated" date against the running deployment
(2026-09-15 00:51 +08): a change made after a deploy is not in it. Second, whether the URL carries
`sslmode=disable`. The Vercel project sits under the team `isaiahs-projects-8abdd4ed` (read from
its deployment URL), which is why it was hard to find.

The check, kept for re-use. The inventory measured the branch `.env.local` names,
`ep-broad-band-b36iq50r`. **A public GET cannot show that Vercel production uses a database at
all.** A production build with no `DATABASE_URL`
serves the same 200 and the same empty sponsor wall: `SEEDING_ENABLED` in
`src/lib/server/sponsorRepository.ts` is false under `NODE_ENV=production`, and the ledgers fall
back to memory. Open the Vercel project → Settings → Environment Variables → Production →
`DATABASE_URL`:

- **Absent:** production runs on in-memory ledgers. Every pledge and receipt is lost when an
  instance recycles. That is a live incident, unrelated to schema, and outranks everything below.
- **Present:** compare the **endpoint id** only, `ep-broad-band-b36iq50r`; the pooled and direct
  hosts reach the same database. If it matches, record it in the sponsor portal entry's §2. If it
  does not, every measurement here describes a database no visitor uses: re-run step 1 against
  the right one.

## Step 6 — end to end, a second human decision

The only real proof is one pledge travelling the whole chain: pledge → confirm in `/admin/donations`
→ a real `HFS-DON-…` number → a portal account claimed with it. On production that **writes a
statutory receipt and sends real email**, so it needs its own yes. Since 2026-09-21 that receipt
is append-only in the database too, so a mistake cannot be edited away
(`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`). Do not fake it with a test
row — a receipt is a statutory document.

Since 5b2672a there are two ways to get it:

- **Wait for a real supporter.** A genuine pending pledge confirmed by a coordinator once the
  transfer shows on the bank statement proves the chain, with no synthetic receipt at all.
  **As of 2026-09-17 there is none:** `pet_sponsorships` has no rows (human-run probe).
- **A small real pet sponsorship from a staff member,** transferred for real. The floor is
  **RM 10** (`MIN_SPONSORSHIP_SEN` in `src/lib/domain/petSponsorship.ts`), not the RM 5 on `/donate`.

§A is answered: production has a database. Provided the variable predates the running deployment,
a confirmation writes a real receipt row.

---

## Re-running this when an additive file *is* missing

The procedure as revised. It was not exercised on 2026-09-16, because the apply list was empty.

### 0. Claim, base, and fences

- In a new worktree, `git fetch`, then `git merge-base --is-ancestor HEAD origin/master` must
  succeed and `git rev-parse HEAD origin/master` should print one hash twice.
  `.claude/settings.json` pins `worktree.baseRef: head`, so the worktree starts at the main
  checkout's HEAD, which on 2026-09-16 was a feature branch beside master, and `git status -sb`
  cannot see that. See
  `tasks/lessons/2026-09-16-a-worktree-cut-from-a-feature-branch-is-not-behind-master-it-is-beside-it.md`.
- `ls tasks/open/CLAIM-*.md`, then write `tasks/open/CLAIM-<task>.md` with kill conditions **before
  step 1**, and commit it so the registration time is in history.

### 1. Read-only inventory, from the main checkout

A worktree has no `.env.local` and silently measures localhost. A worktree-isolated session can
run the step as one command, `cd <main checkout> && npm run db:check-drift`. The `cd` persists,
and the harness refuses every later command there until the session re-enters its worktree.
Never copy `.env.local` anywhere.

- Hash `prisma/schema.prisma`, `scripts/check-drift.ts` and `scripts/lib/sqlSafety.ts` in the main
  checkout against master's. The diff is taken against whatever branch that checkout holds.
- Inventory every object that live code touches, not only the portal's: `sponsors`,
  `pet_sponsorships` (with `displayOnWall`, the `userId` index and FK), `donations`,
  `receipt_sequences`, `audit_logs`, #39's `adoption_applications` columns, and anything added since.
- A missing object shows as its own statement, or as a clause of its table's `ALTER TABLE`. Prisma
  grouped column changes one `ALTER TABLE` per table in the 2026-09-16 output (observed, not
  tested). Statements print truncated at 160 characters, so a truncated `ALTER TABLE` can hide
  clauses; the full SQL is `npx prisma migrate diff … --script`, typed by a human.
- **K1.** Anything missing that a public or staff request touches today is an incident
  (`midwife` §4), not a rollout. Tell the human in the same turn.

### 2. The apply list

- Map each missing object to an existing file in `prisma/sql/`; write a new additive file only if
  none exists, never edit an applied one.
- **K2:** over `parseStatements` output, `isDestructiveStatement` **and** this keyword test, which
  skips foreign-key referential actions:
  `/\b(DROP|TRUNCATE)\b|(?<!\bON\s+)\b(DELETE|UPDATE)\b|\bALTER\b[\s\S]*?\bTYPE\b/i`.
  Measured 2026-09-16 over all ten files. It scores 0 on the seven purely additive ones. It fires on
  `donation_append_only.sql` (`DROP TRIGGER`), the rbac backfill's `UPDATE`s, and
  `ALTER TYPE … ADD VALUE`, which is additive but irreversible, so a human judges it. The classifier
  alone scored 0 on all ten. Any hit stops the list.
  **K2 is a tripwire, not an oracle.** Three known ways it misreads a file, all found by review
  rather than by a run, so check a hit by reading the statement before acting on it:
  - `parseStatements` (`sqlSafety.ts`) drops only lines whose trimmed text *starts* with `--`. A
    trailing `-- … DROP …` on a statement line survives and fires the keyword test. That is the
    same false positive this K2 was written to remove; the ten current files simply have none.
  - `ON CONFLICT … DO UPDATE` fires, because the word before `UPDATE` is `DO`, not `ON`. For an
    upsert that is arguably right — it writes rows, so it is not additive — but a human, not the
    regex, should make that call.
  - The splitter has no dollar-quote awareness: it cuts on every `;`, including those inside a
    `$$ … $$` body. `donation_append_only.sql`'s 3 statements come out as 5 fragments, and a
    `DO $$ … $$` block fragments further. Any statement-level count over such a file is nonsense.
- **K5:** every file enclosed in one `BEGIN; … COMMIT;`, so a failed statement aborts it whole. A
  single `DO $$ … $$;` block satisfies the same requirement by being one statement, and must be
  checked by reading, since the splitter shreds it (above).
- Name each statement's **data** precondition, such as a foreign key validated against existing
  `pet_sponsorships.userId` values. A schema-only rehearsal cannot see rows.

### 3. Rehearse

Prefer a local database to a Neon branch now that production holds real supporter data.
`tasks/lessons/2026-09-14-a-missing-docker-is-not-a-missing-database-tier.md` stands one up without
Docker. **Unexercised:** building a local copy faithful
to production is the open question. `npx prisma db pull --print`, run from the main checkout, is
not on the deny list. Nobody here has run it, so neither its output nor whether it writes a file
is known. It is a candidate only, until a local copy built from it passes **K3**: `db:check-drift`
against the rehearsal target matches step 1 byte for byte, apart from the `Target:` line.

> **A bare `npx prisma db execute --file …` applies to production.** Both it and `db:check-drift`
> resolve their target through `resolveDatabaseUrl()`, which loads `.env.local` in the main
> checkout. A shell-exported `DATABASE_URL` beats both env files, so **every** rehearsal command
> carries the target inline:
>
>     DATABASE_URL="$REHEARSAL_URL" npm run db:check-drift
>     DATABASE_URL="$REHEARSAL_URL" npx prisma db execute --file prisma/sql/<file>.sql
>
> `prisma db execute` prints no `Target:` line, so the only proof of where it went is the
> `db:check-drift` run with the same inline URL immediately before it.
>
> **Read that line's host, not only its label.** The 2026-09-11 version of this brief said: *"The
> host must be the rehearsal branch's. If it names production, stop — that is the one line
> standing between this step and an unreviewed production write."* That still governs, and it is
> the only check that works on a Neon rehearsal branch, which prints `(remote)` exactly as
> production does. The label is a second check, not a replacement: `(local)` appears only for
> `postgresql://postgres:postgrespassword@localhost:5432/pet_shelter?schema=public`, the exact
> string `check-drift.ts` compares against. A different port, `127.0.0.1`, another database name,
> or a missing `?schema=public` all read `(remote)` while being perfectly local. The additive
> files' own headers still show the bare command. See
> `tasks/lessons/2026-09-11-a-rehearsal-that-resolves-its-target-from-config-rehearses-nothing.md`.

Apply each file (a human types it, prefixed as above), re-run drift, apply again, re-run drift. **K4:** the
destructive list is unchanged, the applied objects left the additive list, and the second apply
changed nothing.

### 4. HALT — the one-way door

> Apply `<files>` to production? Rehearsal: `<before/after drift>`, idempotent on second apply.
> Data preconditions: `<each, measured or not>`. Vercel's `DATABASE_URL` host: `<confirmed | not>`.
> If no: `<what stays broken>`.

Only an explicit yes in the current prompt, and the human types the command.

### 5. Verify — GET-only

`npm run db:check-drift` again from the main checkout. Then against
`https://pet-shelter-phi.vercel.app`, not the per-deployment URL (it is behind Vercel SSO and
returns 302). A 200 on `/sponsors`, with no `digest` or `__next_error__` in the HTML and no
`loading.tsx`/`error.tsx` on the route, rules out one thing: a database missing `sponsors`. It
**cannot** tell a database-backed production from one with none. Production seeds no demo
sponsors, so both render the same empty wall, and a unit test's offline demo names run under
`NODE_ENV=test`, not production. That distinction is §A's, not a GET's.

`/admin/donations` needs a Volunteer Coordinator login, so a human loads it. It also falls back to
memory without a database.

### 7. Close the ledger (step 6 is above)

Resolve the open entries with raw output copied into a `tasks/decisions/` entry. A squash merge
drops the branch commits a deleted claim file lived in. Add a dated re-measure to
`production-schema-has-drifted-ahead-of-master.md`, then delete the claim. (That drift entry was
closed and deleted on 2026-10-19, when `db:check-drift` read zero; record any new re-measure in a
`tasks/decisions/` entry instead.)

---

## Scope

**Write:** `tasks/open/*.md`, `tasks/decisions/*.md`, `tasks/lessons/*.md`, this file. `prisma/sql/`
only for a missing object with no additive file.
**Read-only:** `src/**`, `prisma/schema.prisma`, every existing `prisma/sql/*.sql`, and production.
**Never run:** `npm run db:push` or `db:seed` against the default target.

## Verification & commit

- `npm run check` and `npm run test:all` green. This task changes no product code, so if either
  moves, something rode along.
- Commit per `docs/reference/COMMIT_MESSAGES.md`, message via `-F`, checked with
  `node scripts/commit-msg.mjs`. The PR title is linted too.
- Never a docs-only PR (`AGENTS.md`). Ledger-only results ride the next branch that carries code.

## Out of scope

- The 3 destructive drift lines — the `ApplicationStatus` conversion, the `pets.age` → `birthDate`
  migration, and the `notification_preferences` default. They need data-preserving casts and an
  owner's decision.
- Sponsor portal §3 and §4, and `tasks/open/donation-form-and-admin-denials-have-loose-ends.md`.
- Adopting `prisma migrate`.
