# Production Postgres carries objects master does not declare, and `db push` would drop them

**Status:** open, re-measured 2026-09-09 · measured against the production branch, not inferred

> **12 destructive statements → 3.** The 2026-09-03 list is superseded. `faqs`,
> `FaqCategory` and `notification_preferences` are no longer proposed for
> dropping, because `origin/master` now declares all three — the branches that
> held them merged. `pets.customQrUrl` and the four `shelter_settings` QR
> columns had already come off the list on 2026-09-03.
>
> What remains is the half this note always said needed a human: the
> `ApplicationStatus` conversion and the `pets.age` → `birthDate` migration.
> Both still destroy data. **`db push` remains unguarded and still destructive.**
>
> **2026-09-16: the drift is losing data already.** Without the two enum types, every
> application insert and every status write or filter fails in production, silently. See
> "The missing types are losing writes now" below.

> **Re-measured 2026-09-16 against `origin/master` 5b2672a: unchanged.** Same 3 destructive and
> 6 additive statements as the 2026-09-09 record below. That record is reformatted, so this is a
> statement-by-statement match, not a byte comparison. The main checkout's `schema.prisma` and
> checker working copies hash identically to master's. Everything master's schema added since
> 2026-09-09 is present on production: #39's nine `adoption_applications` columns and their unique
> index, alongside the sponsor and donation tables. Raw output, now kept rather than paraphrased:
> `tasks/decisions/2026-09-16-sponsor-portal-activation-applies-nothing-to-production.md`.

> **2026-10-19: the `pets` half is applied, both halves, and the catalogue reads the database
> again.** The owner ran expand on 2026-10-16 and contract on 2026-10-19, and a live probe
> confirmed `/pets` serving real rows. Details and what is still open are in the last section,
> "Applied: the `pets` conversion". The 2026-09-22 note below is history.

> **2026-09-22: the remaining pet drift is losing reads, not just blocking a push.** The deployed
> client asks for `pets.birthDate` on every catalogue read, production has no such column, and the
> failure is swallowed — so the public pet list is being served from `src/data/pets.json`, not from
> the database. Same shape as the application-insert finding below, one table over. See "The pet
> catalogue is being served from the fixture" at the end of this file. The migration that fixes it
> now exists as an expand/contract pair, rehearsed, unapplied:
> `prisma/migrations/manual/20260922_pets_birth_date/` (expand, on
> `fix/pets-birth-date-production-migration`) then
> `prisma/migrations/manual/20260922_pets_birth_date_contract/` (archive and drop).

`npm run db:push` resolves through `prisma.config.ts` → `resolveDatabaseUrl()` → `.env.local`,
which holds `NEON_BRANCH=production`. Unlike the seed, **push has no local-only guard**:
`prisma/env.ts` protects `db:seed` with `assertSeedTargetIsLocal`, and nothing protects push.

## Measured 2026-09-09

`npm run db:check-drift`, run from the main checkout against the production Neon branch
(`ep-broad-band-b36iq50r-pooler...neon.tech`, reported `(remote)`). Read-only.

**3 destructive statements.** Two of them lose data; the third does not, and the difference
matters when someone reads the headline count:

    ALTER TABLE "adoption_applications"
      DROP COLUMN "status", ADD COLUMN "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED'

    ALTER TABLE "pets"
      DROP COLUMN "age", DROP COLUMN "ageCategory",
      ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01',
      ADD COLUMN "birthDateIsEstimate" BOO…          ← truncated, see below

    ALTER TABLE "notification_preferences" ALTER COLUMN "updatedAt" DROP DEFAULT

- **The application one resets every decision.** A `DROP COLUMN` followed by `ADD COLUMN ...
  DEFAULT 'SUBMITTED'` does not migrate values. Every `APPROVED` and `REJECTED` application
  becomes `SUBMITTED`. It needs a data-preserving `USING` cast, not a drop-and-recreate.
- **The pets one loses ages and invents birthdays.** `age` and `ageCategory` are dropped, and
  every existing row gets `birthDate = '2024-01-01'` — not null, not unknown, but a specific
  wrong date that the UI will render as a real age. Backfill has to come first. Related:
  `tasks/open/pet-form-has-no-birth-date-field.md`.
- **The `DROP DEFAULT` destroys nothing.** `scripts/lib/sqlSafety` classifies it as destructive
  because it is an `ALTER ... DROP`, which is the right default for a classifier to take. It
  removes a column default, not rows. Counting it alongside the other two overstates the danger
  by a third.

**6 additive statements**, safe to apply: `CREATE TYPE "PetStatus"`, `CREATE TYPE
"ApplicationStatus"`, new `shelter_settings` columns (`cloudinaryCloudName`, `emailFrom`, …),
and three indexes — `adoption_applications_petId_status_idx`,
`pets_species_status_isArchived_idx`, `pets_isArchived_status_idx`.

Both enum *types* being additive means production does not have them yet; it is the *column*
conversions above that are destructive.

### What this measurement does not establish

`scripts/check-drift.ts:73,88` prints `s.replace(/\s+/g, " ").slice(0, 160)`, so the `pets` and
`shelter_settings` statements above are **truncated at 160 characters**. In particular, whether
the `pets.status` → `PetStatus` conversion is still inside that first statement is *not* answered
by this run — the 2026-09-03 list had it, and its absence here may be truncation rather than
resolution. Do not read it as resolved.

For the full SQL, run the underlying command rather than the summary:

    npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

A human types that one. `.claude/settings.json` denies `npx prisma migrate*` and
`npx prisma db execute*` to agents (since 2026-09-05), including the read-only `diff`. An agent's
route to this measurement is `npm run db:check-drift`.

## A worktree cannot take this measurement

Observed 2026-09-09. `.env.local` is gitignored, so it does not exist in a `git worktree`.
`resolveDatabaseUrl()` then falls back to `LOCAL_DATABASE_URL` and the check silently targets
localhost:

    ◇ injected env (0) from .env.local
    Target: postgresql://postgres:***@localhost:5432/pet_shelter?schema=public (local)
    Error: P1001 Can't reach database server at `localhost:5432`      → exit 2

The script is honest — it prints `(local)` — but exit 2 reads as "could not run" rather than
"measured the wrong database", and several sessions work this repo from worktrees.
**Run drift checks from the main checkout.**

## Why the database is ahead of the branch

Both directions have contributed, and the 2026-09-09 re-measure shows the first direction
largely resolving itself as branches land:

- **Objects master had not caught up to.** `faqs`, `FaqCategory`, `notification_preferences`,
  `pets.customQrUrl` and the four `shelter_settings` QR columns existed in production because
  branches that declared them had pushed and not merged. Those branches have now merged, and
  every one of those statements has left the destructive list.
- **Objects master declares that production predates.** The `PetStatus` / `ApplicationStatus`
  enums and `birthDate`. This is the branch being ahead of the database, and it is what remains.

So this is not one team member's mistake to undo. It is the expected end state of a shared
database with no migration history, several concurrent branches, and a push command that takes
its target from whatever `.env.local` happens to contain.

## What was done on 2026-09-03, and what was deliberately not

The sponsorship feature needed three additive objects. Rather than push:

1. `prisma migrate diff --from-config-datasource --to-schema ... --script` — read-only,
   which is how the drift was found at all.
2. The three sponsorship statements were extracted by hand into
   `prisma/sql/2026-09-03_pet_sponsorships_additive.sql`, made idempotent
   (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, drop-then-add on the FK).
3. Rehearsed on a Neon branch cut from production — the diff there was byte-identical, so it was
   a faithful copy — then applied, verified, and applied twice more to prove idempotence.
4. Applied to production. The diff went 265 → 220 lines and sponsorship references 7 → 0.

The destructive statements were left pending on purpose, and the two that remain are still
pending for the same reason: each needs someone who knows whether the object is wanted, and the
status conversion needs a `USING` cast rather than a drop-and-recreate.

## The missing types are losing writes now, not only blocking a push (established 2026-09-16)

The two additive `CREATE TYPE` statements above were treated as safe-to-apply-later. They are not
optional: master's generated client already depends on them.

- **What Prisma sends, captured with no database.** Prisma 7.9.1, generated from master's schema,
  over a `pg` pool whose `query` records the SQL and throws:

  | Operation | Enum cast sent |
  |---|---|
  | `adoptionApplication.create` | `CAST($12::text AS "public"."ApplicationStatus")` |
  | `adoptionApplication.update` setting `status` | `CAST($1::text AS "public"."ApplicationStatus")` |
  | `adoptionApplication.findMany` filtered by `status` | `CAST($1::text AS "public"."ApplicationStatus")` |
  | `pet.update` setting `status` | `CAST($1::text AS "public"."PetStatus")` |
  | notes-only update, unfiltered `findMany`, pet archive/restore | none |

  Production lacks both types, so every row in the first four fails there.
- **Swallowed.** `insertServerApplication` (`src/lib/server/applicationRepository.ts:202-247`)
  catches the failure and calls `handlePersistenceError(…, "write")`, which rethrows only a unique
  violation or under `STRICT_PERSISTENCE=true` — set only by the integration tiers. Otherwise it
  `console.warn`s, keeps the application in the process's memory, writes the
  `APPLICATION_SUBMITTED` audit row (which casts nothing), and the applicant sees success and gets
  both confirmation emails.
- **Observed in production data.** A masked summary of the 2026-09-16 export: the four
  applications local e2e submitted on 2026-09-14 (13:34–16:01 UTC; `app-1789392875319`,
  `app-1789392933730`, `app-1789400500650`, `app-1789401656866`) each have an
  `APPLICATION_SUBMITTED` audit row, none is in `adoption_applications`, and no deletion of any of
  them was audited. Donations from the same runs did persist.

  **Correction, 2026-09-22.** This line previously also claimed pet archive/restore persisted. It
  did not establish that. The export it rests on covered `audit_logs`, `donations` and
  `adoption_applications` only — not `pets`
  (`tasks/decisions/2026-09-16-neon-verifies-under-strict-tls.md:12-19`) — so the three
  `PET_ARCHIVED` and three `PET_RESTORED` rows are audit rows, and
  `src/lib/server/petRepository.ts:226-247` writes the audit row whether or not the
  `prisma.pet.update` before it succeeded. That is the same shape this very section calls silent
  loss for applications. Donations is supported; pets was not, and is now believed false for the
  reason in the 2026-09-22 section below.

So if the Vercel deployment uses this branch, real adoption applications, approve/reject decisions,
status filters in the admin list, and pet status changes are failing behind a success screen. If it
has no `DATABASE_URL`, they live only in serverless memory, which is lost too. Only the Vercel
dashboard says which.

**Do not fix this with `db push`.** The conversion still needs the reviewed migration described
above: create the two types, then convert each column with a data-preserving `USING` cast. That is
a production change for a human to apply, and it was deliberately not applied here.

**2026-09-17: that migration now exists, rehearsed, not applied.**
`prisma/migrations/manual/20260917_status_enums/migration.sql` (with `rollback.sql`) converts both
columns in one transaction, aborts naming any value the types lack, and is safe to re-run. It was
rehearsed on a throwaway local PostgreSQL shaped like production. After two rounds of code review,
which added schema qualification and a lock timeout that holds however the editor runs it, it
passed all twenty-nine checks. They include Prisma's own casting statements failing before and
succeeding after. It has not touched
production: the session that wrote it was refused access to the production database. The owner
applies it in the Neon SQL editor, following the file's header. Once applied, the
`ApplicationStatus` half of "Settles when" below is met; the `pets.age` → `birthDate` half is not.

## Settles when

Either a single reviewed migration reconciles the two remaining conversions with data preserved
(`USING` cast for `ApplicationStatus`, backfill before `pets.birthDate`), or the repo adopts
`prisma migrate` with a migrations directory so the reconciliation is recorded rather than
re-derived each time.

**As of 2026-09-22 the only thing left is the applying.** The `ApplicationStatus` cast was applied
by the owner on 2026-09-18. The `pets.birthDate` backfill and the additive remainder are written
and rehearsed (see the two sections above); nothing further can be authored from here, because an
agent cannot reach the database. This entry settles when the owner has run both files and
`npm run db:check-drift` from the main checkout reports zero destructive and zero additive
statements — which, per the note above, requires `cleanup.sql` as well as the two migrations.

**Until then, treat `npm run db:push` as destructive against production.** The safe loop is
`migrate diff` → read the SQL → apply only what you intended with `prisma db execute` — the apply
typed by a human, per the deny above.
`npm run db:push:local` remains safe: it pins localhost.

## Re-measured 2026-09-18, after the owner applied the status-enum migration

The owner reported applying PR #47's `prisma/migrations/manual/20260917_status_enums/migration.sql`
in the Neon SQL editor. `npm run db:check-drift` from the main checkout confirms it. The checkout's
`schema.prisma` and `check-drift.ts` hash, line endings normalised, to `origin/master`'s. Exit 1,
raw SQL lines:

    Target: postgresql://<user>:***@ep-broad-band-b36iq50r-pooler...neon.tech/... (remote)   ← redacted as elsewhere in this file
    !! 2 DESTRUCTIVE statement(s). `prisma db push` WOULD DESTROY DATA:
       ALTER TABLE "notification_preferences" ALTER COLUMN "updatedAt" DROP DEFAULT
       ALTER TABLE "pets" DROP COLUMN "age", DROP COLUMN "ageCategory", ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01', ADD COLUMN "birthDateIsEstimate" BOO
    1 additive statement(s) — things this branch's schema has that the database lacks:
       ALTER TABLE "shelter_settings" ADD COLUMN "cloudinaryCloudName" TEXT, ADD COLUMN "emailFrom" TEXT DEFAULT 'Hope for Strays <onboarding@resend.dev>', ADD COLUMN 

Against 2026-09-16's 3 destructive and 6 additive statements, the following are gone:

- the `adoption_applications.status` drop-and-recreate;
- both `CREATE TYPE` statements;
- the three status indexes.

The `pets` statement is truncated at 160 characters, so whether `pets.status` still converts
inside it is not answered by this run. The indexes on `pets(…status…)` being present suggests it
does not. The `pets.age` → `birthDate` migration and the `shelter_settings` columns remain.

## 2026-09-22: the `pets` half now has a migration, rehearsed, not applied

`prisma/migrations/manual/20260922_pets_birth_date/` (with `rollback.sql` and the `rehearse.mjs`
that produced its checks) adds `birthDate` and `birthDateIsEstimate`, backfills them from the
prose `age` production still carries, and relaxes the `age`/`ageCategory` NOT NULLs. Ninety-two
checks on a throwaway embedded PostgreSQL 18.4, all passing. **It has not touched production; the
owner applies it in the Neon SQL editor, following the file's header.** Rationale and the full
check list: `tasks/decisions/2026-09-22-pets-birth-date-backfills-from-intake-date.md`.

**It does not close this entry.** The file deliberately does not drop `age`/`ageCategory` — that
half destroys the only record of what staff typed and cannot be rolled back — so after it is
applied, `db:check-drift` will still report one destructive statement for `pets`. That is correct.
The drop is the contract half of an expand/contract pair and gets its own file once this one is
applied and the catalogue is confirmed serving real rows.

### This drift is not only blocking a push; it is very likely breaking reads now

Established here, and stronger than the 2026-09-16 enum finding because it was reproduced rather
than reasoned. Master's own generated client, run against a throwaway `pets` carrying the shape
this entry measures production to have, answers:

    prisma.pet.findMany()   ->  The column `pets.birthDate` does not exist in the current database.
    prisma.pet.create(...)  ->  The column `birthDate of relation pets` does not exist ...

`src/lib/server/petRepository.ts:65` runs `findMany` with `include` and **no `select`**, so every
scalar is requested, `birthDate` included. `handlePersistenceError(…, "read")` swallows the
failure — `src/lib/persistenceMode.ts:67-81` rethrows only `P2002` or under `STRICT_PERSISTENCE`,
and its warn is gated on `NODE_ENV === "development"` — and returns `serverPets`, which
`petRepository.ts:38-44` initialises from `src/data/pets.json`.

So if the deployed build carries this schema, the public catalogue has been answering from the ten
bundled demo animals since **2026-08-28** (`6108d82`, which swapped the columns), silently, and
every admin pet edit has been failing behind the same swallow.

**ASSERTED, not observed** — the chain is reproduced locally, the production end of it is not. The
cheap probe nobody has run, and the one worth running before applying anything: **open `/pets` on
the live site.** Exactly the ten fixture animals at fixture ids (`pet-001` … `pet-010`) confirms
the fallback. Anything else means the read works and the measurement above wants re-reading first.

### A second failure the add alone would not fix

`age` and `ageCategory` were declared `String` — NOT NULL, no default — in the schema production
was built from (`6108d82^`), and the running release writes neither. Adding `birthDate` alone
restores every read and leaves every `prisma.pet.create` failing, reported by Prisma as `Null
constraint violation on the (not available)`, naming no column. The migration relaxes both.
Whether production's copies are still NOT NULL is **not measured**: a `migrate diff` `DROP` clause
does not report nullability.

### Related entries that this makes suspect

- `tasks/archive/pets-json-fallback-reach-unverified.md` was settled 2026-08-28 as "verified that
  production Neon DB runs populated with live pets". That phrase appears in exactly one commit,
  `eaca046` (2026-09-14), a 35-file docs move whose message cites test runs and no database
  observation. It cites no measurement and is contradicted by three `migrate diff` runs. Treat it
  as unsettled until the `/pets` probe above is taken.
- `tasks/open/pets-json-fallback-empty-means-outage.md` was narrowed on 2026-09-22 by #89 and its
  pet half is settled: an empty result is now an answer, and the reader falls back only on a
  thrown error. That is what makes the missing column the live trigger rather than a hypothetical
  one — under today's code the *only* way the catalogue serves fixtures is a throw, and a column
  the client selects and the database lacks is exactly that.

**Corroborated independently on 2026-09-22 by #89's own review**, which opened
`tasks/open/an-outage-serves-and-bills-fixture-animals.md`: `handlePersistenceError` rethrows only
under `STRICT_PERSISTENCE`, and that flag is set in `package.json`'s `test:integration` script and
`vitest.config.mts` and nowhere a deployment sets it. That entry reaches the same conclusion about
the swallow from the by-id path, and adds what it costs — a sponsorship pledge recorded against a
fixture animal. It is also marked ASSERTED for the same reason this section is: nobody has
provoked the outage against a running instance. Two sessions reasoning to the same place from
different code paths is not a measurement, and the `/pets` probe above is still the thing that
would settle it.

## The contract half now exists too, so the whole sequence is authored (2026-10-13)

The section above says the drop "gets its own file once this one is applied and the catalogue is
confirmed serving real rows". That file now exists:
`prisma/migrations/manual/20260922_pets_birth_date_contract/`. Both halves and the additive
remainder are on one branch, rehearsed, **not applied** — agents are denied production access and
`npx prisma migrate*`/`db execute*`. The owner applies them in the Neon SQL editor, in this order:

1. **Expand** — `prisma/migrations/manual/20260922_pets_birth_date/migration.sql`. Adds
   `birthDate` / `birthDateIsEstimate`, backfills every row from that row's own intake date and age
   prose, and relaxes the `age` / `ageCategory` NOT NULLs. **This is the step that stops the
   outage**, and it destroys nothing.
2. **Soak.** Read the derived birthdays against the prose that produced them, in production, while
   both still exist — and take the `/pets` probe the section above asks for, which is what turns
   this entry's ASSERTED outage into a measurement either way:

       SELECT "id","name","age","ageCategory","intakeDate","birthDate" FROM pets ORDER BY "birthDate";

   Nothing after step 1 is urgent. This window is the only chance anyone gets to compare a derived
   birthday against the prose it came from, with both in front of them, on real rows.
3. **Contract** — `prisma/migrations/manual/20260922_pets_birth_date_contract/migration.sql`.
   Copies `age`, `ageCategory`, `birthDate` and `birthDateIsEstimate` to
   `pets_age_archive_20260922`, then drops the two old columns. It derives nothing: the expand half
   owns that rule alone. It refuses outright if expand has not run, which it tells from `age` still
   being NOT NULL rather than by re-deriving anything. `rollback.sql` and `cleanup.sql` sit beside
   it.
4. `prisma/migrations/manual/20260922_settings_and_defaults/migration.sql` — the seven
   `shelter_settings` email and storage columns, and the `notification_preferences.updatedAt`
   `DROP DEFAULT`. The remainder; nothing here is urgent.

Rationale, the rejected alternatives and the rehearsal record:
`tasks/decisions/2026-09-22-the-pet-birth-date-conversion-splits-into-expand-and-contract.md`. It
supersedes `tasks/decisions/2026-09-22-pet-birth-date-backfill-derives-from-intake-and-age.md`
(a single file that did both halves, removed before merge) and sits alongside the expand half's own
`2026-09-22-pets-birth-date-backfills-from-intake-date.md` and
`2026-09-22-expand-stores-only-what-the-app-computes.md`.

**Expect drift to read one statement, not zero, immediately after step 3.** The archive table is
not declared in `prisma/schema.prisma`, so `db:check-drift` will offer
`DROP TABLE "pets_age_archive_20260922"`. That is the price of a rollback that can restore the
original prose. `cleanup.sql` drops it and takes drift to zero — and is the point at which the
conversion stops being reversible, so it goes last and only after the archive has been read.

## Applied: the `pets` conversion (2026-10-16 and 2026-10-19)

The owner ran steps 1 and 3 above in the Neon SQL editor, against the production branch, using
the files as merged on master (expand as of #113, `1b6dbbc`).

1. **Expand, 2026-10-16.** The header pre-check came first, and every row read `ok`. The file
   committed with its `backfilled N pets from "age"` NOTICE. It prints that only after checking
   that every row was updated, and otherwise aborts.
2. **The `/pets` probe, 2026-10-19 — the outage this entry ASSERTED is now measured as over.**
   The public list cannot tell the database from the fixture: production holds the seeded demo
   animals, and Tuah and Comel are "In Rehabilitation", so both paths show the same 8 names. So
   the owner renamed `pet-001` to `Bella (db check)` in Neon, and the live `/pets` page (which is
   `force-dynamic`) showed it on the next request. The name was then reverted, and the page showed
   `Bella` again. The catalogue reads the database.
3. **Contract, 2026-10-19.** The owner ran it after a three-day soak, by choice. Neon printed
   `BEGIN`, `SELECT 1`, `DO`, `COMMIT`. `SELECT count(*) FROM pets_age_archive_20260922` returned
   8. Afterwards `/`, `/pets`, `/pets?species=dog` and `/sponsors` all returned 200. The deployed
   `Pet` model on master declares no `age` or `ageCategory`, so nothing reads the dropped columns.
4. **`cleanup.sql`** was handed to the owner the same day, with the warning that it makes the
   conversion irreversible. Whether it ran is not recorded here. If it has, `rollback.sql` can no
   longer restore the age prose.

**Not to be confused with this:** on 2026-10-19 `/pets` and `/sponsors` returned 500 for a few
minutes. The Vercel log showed `SecretConfigurationError`: the build before #128 refused a
`STAFF_INVITE_SECRET` shorter than 16 characters. It cleared when the #128 build took the
production domain. Pages that were pre-built kept returning 200 throughout. It was not this
migration.

**Still open, so this entry stays open:**

- **`db:check-drift` has not been re-run since.** This section is a record of what the owner
  ran, not a drift measurement. Expect the `pets` statement to be gone, and expect one
  `DROP TABLE "pets_age_archive_20260922"` until cleanup runs.
- **Step 4, `20260922_settings_and_defaults/migration.sql`, has no record of being applied.** The
  `shelter_settings` columns and the `notification_preferences.updatedAt` default may still drift.
- **`npm run db:push` is still unguarded against production.** Treat it as destructive until
  drift reads zero.
