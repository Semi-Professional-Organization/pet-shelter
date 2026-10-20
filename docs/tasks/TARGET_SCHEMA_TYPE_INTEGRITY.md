# Target — Schema Type Integrity

**Date**: 2026-08-27
**Branch**: `feat/tnrm-rehabilitation`
**Baseline**: 40 test files / 517 tests green · `npx tsc --noEmit` clean · `npm run lint` 0 errors
**Predecessor commit**: `f75de27 refactor(lib): split serverStore into per-domain repository modules`

> **Scope**: the remaining findings from the 2026-08-26 schema review. The review asked whether the
> database should be normalised to 5NF. It should not — and the reasoning is worth keeping, because
> it determines what this target *is*.
>
> 5NF concerns **join dependencies**, which only arise from genuine ternary-or-wider relationships.
> This schema has **no many-to-many relationships at all**: every relation is 1:N (`Pet →
> AdoptionApplication`, `Pet → PetUpdate`, `Pet → MedicalTimelineEvent`, `Pet → Donation` is not even
> modelled). A schema with no multi-way relationships is *trivially already in 5NF*. Pursuing it
> further would mean inventing decompositions to satisfy a form nothing violates, at the cost of the
> type safety CLAUDE.md names as a core value.
>
> Normalisation is a tool for removing **update anomalies**. The right question is not "what normal
> form are we at" but "where can this schema contradict itself?" Everything below answers that. Only
> P-C is a normalisation fix; the rest are **typing and lifecycle** defects, which is where the real
> damage is.

---

## 1. 🔴 Why this is the next target

Every line number below was read from the source on the date above.

The schema stores four things as `String` that are not strings: an **age** that silently rots, two
**statuses** the database cannot constrain, and **money** (now fixed — see §2). It also stores a
**derived label** on every row, and leaves four typed domain concepts with no persistence at all.

None of these produce a type error, a test failure, or a runtime crash. That is precisely why they
are worth a target: the tree is green and the defects are all in the "quietly wrong data" category.

---

## 2. ✅ What already landed — do not redo

The **donation ledger** (2026-08-26, in commit `6c6d6d5`) closed the highest-severity finding: the
donation action minted an LHDN receipt number, emailed it, and persisted **nothing**.

| Landed | Where |
|---|---|
| `Donation` + `ReceiptSequence` models | `prisma/schema.prisma:218`, `:252` |
| Gapless receipt numbering (counter row in the insert's transaction) | `src/lib/server/donationLedger.ts` |
| Exact integer-sen money with a branded `Sen` type | `src/lib/domain/money.ts` |
| Declared-mode persistence (no silent fallback for event records) | `donationLedger.ts`, `docs/architecture/LAYERS.md` L-B2 |
| Statutory identifiers single-sourced | `src/lib/domain/shelterIdentity.ts` |
| Opt-in append-only DB trigger | `prisma/sql/donation_append_only.sql` |

Read **"The ledger exception"** in `CLAUDE.md` before touching any of it. The key idea generalises to
everything below: *the dual-layer fallback is correct for reference data and wrong for event
records*, because there is no committed fixture for an event that has not happened yet.

⚠️ **`npm run db:push:local` is required** — `Donation` and `ReceiptSequence` have no tables until it
runs, and this path deliberately does not fall back.

### 2.1 The Postgres verification gap — harness landed, run still outstanding

**Status (2026-08-28): the probes exist and are wired; they have not yet been run green, because
this machine has no working Docker engine.** See §2.2.

The original instruction here was `docker compose up -d && npm run db:push && npm run db:seed`.
**Do not run that pair.** Executing it as written would have pushed schema changes to a hosted Neon
branch, for two compounding reasons that have since been fixed:

1. `prisma.config.ts` loaded `.env.local` before `.env`, and `.env.local` on a developer machine
   holds a Neon `DATABASE_URL` with `NEON_BRANCH=production`. So `db:push` never targeted localhost.
2. `prisma/seed.ts` used `import "dotenv/config"`, which loads `.env` **only** — a file this repo
   does not have. So `db:seed` fell through to its hardcoded `localhost:5432` default.

The two commands therefore resolved **different databases**, and both exited 0. The pair looked like
an end-to-end verification while the halves had never met, and the half that ran against Neon was a
schema mutation on shared infrastructure.

| Fix | Where |
|---|---|
| Single env/URL resolver shared by the CLI and the seed | `prisma/env.ts` |
| Seed refuses a non-local target (`ALLOW_REMOTE_SEED` to override) | `prisma/env.ts`, `prisma/seed.ts` |
| Localhost-pinned commands that never read `.env.local` | `db:up`, `db:push:local`, `db:seed:local`, `test:db` |
| Tier 3b: the only suites that talk to real Postgres | `tests/integration/db/`, `vitest.config.mts` |
| Probes refuse a non-local host before opening a connection | `tests/integration/db/support/database.ts` |

`tests/integration/db/donationLedger.postgres.test.ts` is what actually closes the gap this section
describes. It asserts the properties that belong to **PostgreSQL rather than to the module**, which
is precisely what the hand-built fake in `tests/unit/donationLedger.test.ts` cannot do: transactional
rollback of the counter row, the `@@unique([sequenceScope, sequenceValue])` index, row-level locking
under eight concurrent issuers, and exact integer-sen round-tripping.
`schemaIntegrity.postgres.test.ts` covers the other half — that the `rehab*` columns and the two new
tables were actually *pushed*, not merely declared, and that the seeded fixtures round-trip unchanged.

Tier 3b **fails rather than skips** when `DATABASE_URL` is unset, and is deliberately excluded from
`npm run test:all`. A skip reads as a pass in the summary line, which is how "verified against
Postgres" became a claim nobody had tested.

**To close it, on a machine with a working Docker engine:**

```
npm run db:up
npm run db:push:local && npm run db:seed:local
npm run test:db
```

### 2.2 Blocker — no working container engine on this machine

`docker compose up -d` cannot run here. Docker Desktop 29.3.1 is installed and its backend processes
start, but every `wsl` invocation fails with `Wsl/CallMsi/Install/REGDB_E_CLASSNOTREG`, and the only
Docker context is `desktop-linux`, which requires WSL2. There is no native Postgres on the host
either (nothing listening on `:5432`, no service, no `psql`).

Repair needs an **elevated** shell — `wsl --update`, or `wsl --install --no-distribution` — followed
by a Docker Desktop restart. Windows 11 **Home** rules out the Hyper-V backend as an alternative.

**Also landed since the review**: `PLAN_LIB_RESTRUCTURE` (`f75de27`) split the 883-line
`serverStore.ts` into `src/lib/server/{petRepository,applicationRepository,petMappers,
rehabNeedsCatalog,faqCatalog,fallbackState}.ts` (`fallbackState.ts` was removed on 2026-10-20:
each store now registers its own reset with `src/lib/stateResets.ts`). File references below use the new layout, and
`tests/unit/layerBoundaries.test.ts` now also guards that no `"use client"` module imports
`src/lib/server/`. `donationLedger.ts` deliberately sits *outside* that directory — it is repository
layer, but not dual-layer.

---

## 3. The work, ranked

### P-A — `Pet.age` rots, and `ageCategory` cannot be derived from it 🔴

```prisma
prisma/schema.prisma:37   age           String
prisma/schema.prisma:38   ageCategory   String // puppy_kitten, young, adult, senior
```

`ageCategory` *looks* like a 3NF violation — derivable from `age`, therefore redundant. It is not
derivable, because `age` is prose (`"2 years"`, `"4 months"`), and that is the worse problem:

**A pet stored as `"2 years"` is still `"2 years"` three years later.** Nothing recomputes it. The
adoption catalogue, the match engine, and the age filter all read a value that was true on intake day
and has been drifting ever since. `ageCategory` drifts with it — a `puppy_kitten` stays a puppy
forever.

The fixtures make the fix tractable: all 10 pets use a `N years` / `N months` form, and every pet has
an `intakeDate` (`prisma/schema.prisma:50`). **Age is as-of-intake**, so:

```
birthDate ≈ intakeDate − age
```

**Blast radius** (measured, not estimated):
- `ageCategory` — 42 occurrences across 11 files
- `age` — 36 occurrences across 17 files

Heaviest: `src/hooks/usePetGalleryController.ts` (8), `src/components/admin/PetFormDialog.tsx` (6+5),
`src/lib/server/petMappers.ts` (4+4), `src/actions/pets.ts` (3+1), `src/lib/validations/pet.ts` (3+1).

This is the widest change in this document. Do it alone, on its own branch.

### P-B — Both statuses are unconstrained strings 🟠

```prisma
prisma/schema.prisma:42    status  String @default("Available")  // + a legacy alias
prisma/schema.prisma:105   status  String @default("SUBMITTED")
```

The legal values live in a **comment**. Postgres will accept `"Availabe"` without complaint.

You are already paying for this: `"Rehabilitation"` vs `"In Rehabilitation"` required
`normalizePetStatus()` in `src/lib/domain/stateMachine.ts`, plus a standing rule in CLAUDE.md telling
every future contributor never to compare raw status strings. **14 raw `status === "…"` comparisons
survive across 9 files** — each one a place the rule can be forgotten.

There are **no migrations** (`prisma/migrations/` does not exist; the project uses `db push`), so
adopting Postgres enums is cheap *now* and expensive after a migration history begins. `Role` at
`prisma/schema.prisma:12` is already an enum — the precedent exists in this very file.

### P-C — Category labels are a stored transitive dependency 🟠

```ts
src/types/faq.ts:13-14      categoryLabel: string;  categoryLabelMs: string;
src/types/rehab.ts:15-16    categoryLabel: string;  categoryLabelMs: string;
```

**The one textbook 3NF violation in the codebase.** The label depends on `category`, not on the row's
key. Forty FAQs in the `tnrm` category means forty copies of the same two strings, free to drift.

The fix is *not* a category lookup table. These are **user-facing copy**, and CLAUDE.md is explicit
that copy belongs in `translations.ts`. Derive the label from the category enum at render time and
delete the fields — normalise them out of the data model entirely rather than into a second table.

**Time-critical**: `src/data/faqs.json` and `src/data/rehabNeeds.json` have no Prisma models yet
(see P-D). Fix this *before* those fixtures become tables, or the violation is baked into columns.

### P-D — Four typed concepts have no persistence 🟠

`Bulletin`, `FaqItem`, `RehabNeed`, and `SponsorshipTier` have TypeScript types and JSON fixtures but
**no Prisma model** (confirmed: `prisma/schema.prisma` declares 9 models, none of them these). The
dual-layer store's fallback is therefore the *only* path — an admin edit cannot survive a restart.

Bulletins are the worst case: `src/data/bulletins.json` is read **only** by
`src/lib/bulletinStore.ts:5`, which is a `"use client"` localStorage store. There is no server path
at all — no action, no repository reader under `src/lib/server/`. Bulletins exist purely in the browser.

Related, and worth folding in: **`ShelterSettings` is a Prisma model that the seed writes and nothing
reads.** `src/actions/settings.ts:10` is a module-level `let serverSettings = {…}`. Settings edits
are lost on restart, and the table is dead weight.

### P-E — The intentional denormalisations are undocumented 🟡

`AdoptionApplication.petName` / `petBreed` duplicate `Pet`, and a reviewer will eventually "fix" them
into a join. They are **correct**: `petId` is nullable with `onDelete: SetNull`, so these are the
historical snapshot that survives the pet row — the same point-in-time capture an invoice uses for a
line-item price. `Donation` now documents exactly this pattern in its model comment; copy that
treatment onto `AdoptionApplication`.

Same for `AuditLog.details` / `metadata` (`prisma/schema.prisma:179-180`): deliberately schemaless,
because an audit log's value is being an immutable record of what the schema looked like at write
time. Normalising it is an anti-pattern.

---

## 4. ⚠️ The real decisions

**1. Does `birthDate` replace `age`, or sit alongside it?**
Recommended: **replace**. Keeping both re-creates the drift. Rescues rarely have exact DOBs, so pair
it with `birthDateIsEstimate Boolean` and format as "about 2 years" when true. Derive `ageCategory`
in a `src/lib/domain/petAge.ts` module, tested independently — do not scatter the thresholds.

**2. Postgres enum, or `String` + check constraint?**
Recommended: **enum** for `ApplicationStatus`; **enum for `PetStatus` only if the legacy
`"Rehabilitation"` alias is dropped at the DB boundary** — an enum with both spellings encodes the
bug into the type. Normalise on write, keep `normalizePetStatus()` for reading legacy rows, and let
the enum hold only canonical values. Prisma enums generate TS unions, so `src/types/pet.ts` and the
schema stop being able to disagree.

**3. Do the four missing models get real tables, or stay fixtures?**
Deliberate, not automatic. `SponsorshipTier` is arguably *correct* as code — it is a catalogue that
changes with a deploy, and `src/lib/domain/sponsorshipTiers.ts` already documents why it is
directive-free. `Bulletin`, `FaqItem`, and `RehabNeed` are admin-editable content and want tables.
Decide per type; record the decision.

**4. `intakeDate` and the history `date` columns stay `String`.**
Already argued in the `PetUpdate` model comment: these are dates with no time component, and
`@db.Date` round-trips through a JS `Date` that reintroduces timezone drift. Do not "fix" this while
doing P-A. Note the contrast: `Donation.issuedAt` *is* a `DateTime`, correctly — it is an instant,
not a calendar day.

---

## 5. Step plan

Each item is independently shippable. Suggested order — P-C first because it is time-critical and
small, P-A last because it is the widest:

1. **P-C** — delete the four label fields, derive from the category enum via `translations.ts`,
   update `faqs.json` / `rehabNeeds.json`, update the FAQ/rehab suites.
2. ~~**P-E** — model comments only. No behaviour change. ~20 minutes.~~ ✅ **Landed 2026-08-28.**
   `AdoptionApplication` and `AuditLog` now carry model-level comments explaining why their
   duplicated columns are point-in-time snapshots rather than 3NF defects, matching the treatment
   already on `Donation`. Field-level comments mark `petName`, `petBreed`, `actorEmail`, `actorRole`,
   `details`, and `metadata` individually, so the rationale survives someone reading one field in
   isolation. Stale `src/lib/donationLedger.ts` / `src/lib/userStore.ts` paths were corrected in
   `prisma/schema.prisma`, `prisma/sql/donation_append_only.sql`, `src/actions/donations.ts`, and
   `docs/architecture/LAYERS.md` — the modules moved under `src/lib/server/` in `f75de27`/`d554edb`.
3. **P-B** — enums for both statuses; normalise `"Rehabilitation"` on write; `db push`; sweep the 14
   raw comparisons. Consider a source-tree guard like the one in
   `tests/unit/shelterIdentity.test.ts:78` to keep raw status literals out of `src/`.
4. **P-D** — per-type decision, then models + `src/lib/server/` readers + actions for those that get
   tables. Fold in the `ShelterSettings` read path.
5. **P-A** — `birthDate` + `birthDateIsEstimate`, a `petAge.ts` derivation module, a fixture
   migration using `intakeDate − age`, then the 17-file sweep.

## 6. Acceptance criteria

- `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npm run test:all` green at **≥ 517 tests**.
- `npm run db:push:local && npm run db:seed:local` succeeds against real Postgres, and the seeded
  fixtures round-trip unchanged — asserted by `npm run test:db`, not by eyeballing the output. This
  is the standing gap flagged in §2; the harness landed 2026-08-28, the run is blocked on §2.2.
- `npm run db:seed` with no local database configured **refuses to run** rather than seeding
  whatever `.env.local` points at.
- P-A: no `age`/`ageCategory` column remains; `ageCategory` is computed and unit-tested at its
  boundaries (a pet turning 1 crosses `puppy_kitten → young` on the right day).
- P-B: an invalid status is rejected **by the database**, demonstrated by a test.
- P-C: `categoryLabel` / `categoryLabelMs` appear nowhere in `src/`; `i18n.test.ts` key parity holds.
- Every deliberate denormalisation carries a comment saying why, in the model itself.

## 7. Out of scope

- **5NF / further normalisation** — see the scope note at the top. The schema is already trivially
  in 5NF; there is nothing to decompose.
- **P2, the ROS registration number** — still blocked on the physical certificate. Do not guess.
  `tests/unit/shelterIdentity.test.ts` guards the divergence deliberately.
- **A `Donation → Pet` foreign key.** `targetPetName` is a free-text dedication; the pledge form
  never collects a pet id. Adding an unpopulated column is speculative. Revisit if sponsorship
  attribution ("how much went to Tuah's rehab") becomes a real requirement.
- **Replacing `Sen` with Prisma `Decimal`.** Considered and rejected — `Decimal` does not survive
  the `"use server"` boundary as a class instance. The rationale is in `src/lib/domain/money.ts`.

## 8. ⚠️ Coordination — this branch has a concurrent writer

At the time of writing, `feat/tnrm-rehabilitation` has **uncommitted work from another session**:
P8 shelter-identity adoption, touching `Footer.tsx`, `HomeSections.tsx`, the donate / privacy /
terms / get-involved pages, `SponsorshipModal.tsx`, `DonationWidget.tsx`, `translations.ts`,
`sponsorshipStore.ts`, `.env.example`, and `TARGET_SHELTER_IDENTITY_ADOPTION.md`.

Commit `6c6d6d5` also swept the entire donation ledger into a commit whose message describes only
UI work ("tabbed animal profiles and personalized sponsorship with pet chooser carousel"). Nothing
was lost, but the ledger is not findable from the log.

**Before starting P-A or P-B**, confirm the other session has landed or stopped. Both sweep files
that P8 is actively editing, and a 17-file `age` refactor colliding with an in-flight UI change
produces conflicts rather than progress.

**Update 2026-08-28** — the concurrent writer is still active. During the §2.1 work it landed
`00692eb`, `fdf851f`, `0bf5e09`, `71687c1`, and `1597a43`, and was simultaneously editing
`package.json`, `tests/setup/componentSetup.ts`, `tests/setup/integrationEnv.ts`,
`src/lib/presentation/`, and `src/app/globals.css`. Two practical consequences:

- It independently added `test:db` and the project-scoped `test:all`, converging on the same design
  from the other direction. Its `test:db` was **not** pinned to localhost; that has been corrected,
  because `tests/setup/integrationEnv.ts` loads `.env.local` into the Tier-3b lane and would
  otherwise aim the destructive probes at the Neon branch.
- `npm install` churn makes `package.json` and `package-lock.json` transiently unreadable. Re-read
  before patching, patch scripts key-by-key rather than rewriting the file, and check `git diff
  --cached` separately before committing — this session's index is shared.

P-A and P-B remain unstarted and should stay that way until the writer stops.
