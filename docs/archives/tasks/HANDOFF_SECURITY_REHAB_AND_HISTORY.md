# Engineering Handoff — Auth Hardening, Rehabilitation UI, and Pet History

- **Status as of**: 2026-08-26
- **Branch**: `feat/tnrm-rehabilitation` — 25 commits ahead of `master`, **not pushed**, working tree clean
- **Quality gates**: `npm test` **410 passing / 32 files** · `npx tsc --noEmit` clean ·
  `npm run lint` 0 errors, 4 warnings · `npm run build` compiles, 25/25 static pages
- **Fast-forward**: `git checkout master && git merge --ff-only feat/tnrm-rehabilitation`

This session closed **P1** (authentication secrets), **P3** (nested pet history), **P4** (rehab needs & FAQs data layer), and **P5**
(no UI for rehabilitating animals) from the
[TNRM sprint handoff](HANDOFF_TNRM_REHABILITATION_SPRINT.md). **P6** (dead barrels) was closed
in parallel by a second session. **P2** remains open (blocked on stakeholder).

Three sessions were writing to this tree concurrently. §5 records what that cost.

---

## 1. 📦 What Shipped

| Commit | Scope |
|---|---|
| `3b43293` | `feat(security)`: fail fast on unsafe authentication secrets |
| `4e9bdf4` | `feat(ui)`: surface rehabilitating animals across the catalog |
| `f64e216` | `feat(data)`: carry pet history through the write paths |

Landed alongside, by a concurrent session — Tier 1/2 test infrastructure, `STRICT_PERSISTENCE`,
and the P6 barrel removal: `b48d712`, `f358a8a`, `7d1436a`, `c198a99`, `93e6d3d`, `f031b93`,
`94543a5`, `0d238d9`.

---

## 2. 🧭 Decisions Worth Knowing

### `src/instrumentation.ts` is not an orphan — do not delete it

It is a **Next.js file convention**: the framework loads it by filename and calls its `register()`
export. Nothing imports it and nothing ever will. It is also the only thing standing between a
production deploy and forgeable session cookies, because it calls `assertSecretsConfigured()`.

`docs/architecture/layer-graph.mjs` reported it under *"Orphans: files nothing imports"* until it
was explicitly excluded. Anyone who "cleans up an orphan" here removes the secret fail-fast, and
**every gate stays green while they do it** — no test covers a file the framework loads by name.
The exclusion list now covers `instrumentation.ts` and `instrumentation-client.ts`; extend it if
`middleware.ts` is ever added.

### Secrets fail at boot, not at build — verified, not assumed

`assertSecretsConfigured()` is not in [`TARGET_SECRET_HARDENING.md`](TARGET_SECRET_HARDENING.md);
it was added because that document's §3 left a gap. Only `SESSION_SECRET` was validated at boot
(resolved at module load by `crypto.ts`). `ADMIN_SECRET_KEY` and `STAFF_INVITE_SECRET` were read
lazily per request, so a deploy missing either **started clean and failed on the first upload or
registration** — the "runtime check per call" failure mode §2 of that document explicitly rejects.

The target document also contradicted itself: §1 asks for a throw *"immediately at startup"* while
§3 asks for *"dynamic / rotated lookups at call time"*. Both are satisfied — accessors still read
`process.env` per call so rotation needs no redeploy, and the startup hook validates all three and
reports **every** failure at once, so one deploy cycle fixes them all.

`register()` was confirmed **not** to run during `next build`: a production build succeeds with
`STAFF_INVITE_SECRET` unset. CI can build without runtime secrets.

### The invite code minimum is 16 characters, and 4 was rejected

> **Superseded 2026-10-17.** The owner made the invite code's length their own call: a short
> code now boots with a warning, and the test described below was replaced. See
> `tasks/decisions/2026-10-17-the-staff-invite-code-length-is-the-operators-call.md`.

A 4-character minimum was proposed and declined. `registerAction`'s rate limit is keyed
`register:${email}` — **a value the caller supplies** — so varying the email defeats it entirely,
and the in-memory limiter does not survive a restart or scale horizontally. That leaves a short
shared code enumerable, and it is the only gate on an account authorized for `getApplications()`,
which returns applicant name, email, phone and home address (PDPA 2010). `tests/unit/secrets.test.ts`
pins the decision by asserting `"1234"` is rejected.

### A universal master password existed and was not in any document

`loginAction` accepted `"1234"` for **any** existing user regardless of their stored hash, ADMIN
included. It was found by reading the code around the documented defect, not from the backlog.
Worth remembering that the target document catalogued the *registration* bypass thoroughly and
missed the *login* one sitting nine lines away.

### P3 is complete, but split across three commits

`prisma/schema.prisma` and `src/lib/serverStore.ts` carried a concurrent session's
`STRICT_PERSISTENCE` work in the same files, so the schema and mapper half of P3 landed inside
`7d1436a` / `f358a8a`, and `f64e216` holds the remainder. **Do not read `f64e216` alone and
conclude the feature is half-finished.** The tables, row types, mappers and payload builders are in
`HEAD`; verify with `git show HEAD:prisma/schema.prisma | grep "model PetUpdate"`.

### Only the rehabilitation status has an alias

`normalizePetStatus()` maps `Rehabilitation` → `In Rehabilitation`. No other status is aliased,
so `status === "Available"` is safe, while comparing a *user-selected* status against `pet.status`
is not — that was a real defect in the gallery filter, silently dropping animals stored under the
other spelling. Status presentation now lives in `src/lib/petStatusPresentation.ts`; use
`matchesStatusFilter()` rather than comparing raw strings.

It sits in `lib/` deliberately: Vitest runs in a node environment with no DOM, so logic reachable
only through a component **cannot be tested at all** in this repo.

### An animal in rehabilitation is not adoptable, and the UI must not imply otherwise

`PET_TRANSITION_GRAPH` permits no path from rehabilitation to `Adopted` — clearance returns the
animal to `Available` first. So the card offers *Sponsor Me* and the detail page omits the adoption
button rather than disabling it, and the "Free Adoption" badge is withheld **only** while under
care (an earlier revision keyed it on `isAvailable`, which wrongly stripped it from `Pending` and
`Adopted` animals that are still being rehomed free of charge).

---

## 3. ⚠️ Traps That Cost Time

1. **Green tests proved nothing about the database.** Before `db:push` was applied, every
   `prisma.pet.findMany()` threw on the missing `pets.rehabStage` column, `serverStore` swallowed
   it, and the app served fixtures for 100% of pet traffic while returning `200`. The suite was
   green throughout, because the fallback is what the tests exercise. **The migration has since
   been applied to the live Neon instance** and `/pets` now serves database rows with no fallback
   notices — but the general lesson stands: the test suite cannot tell you whether a migration ran.

2. **Vitest never loads `.env.local`.** That is a Next.js behaviour, not a Vite one.
   `vitest.config.mts` contains no `dotenv`/`loadEnv`, so `DATABASE_URL` is absent from the test
   process and `src/lib/prisma.ts` falls back to a hardcoded `localhost:5432` that refuses
   instantly. **Consequence for Tier 3**: a `STRICT_PERSISTENCE` integration test today asserts
   against a refused connection, throws, goes green, and has proven nothing about the real schema.
   Task 03 must *prove* the integration project reaches Neon before trusting any result from it.

3. **`git worktree remove --force` recurses through directory junctions.** A session verifying its
   commits in a throwaway worktree junctioned `node_modules` into it with `mklink /J`; the teardown's
   `rmdir` of the junction silently failed and the forced worktree removal deleted **through** the
   junction, emptying the real `node_modules`. Recovered with `npm ci`. Never junction a shared
   `node_modules` into a disposable worktree.

4. **`tests/unit/petHistory.test.ts` string-matches `prisma/schema.prisma`.** It reads the file and
   asserts on `model PetUpdate {` and similar. Deliberate — it is the only way a node-environment
   unit test can catch schema/mapper drift — but **renaming a model breaks a unit test in a way
   that looks unrelated to the schema**.

5. **`scratch/` is now excluded, not fixed.** `tsconfig.json` and `eslint.config.mjs` exclude it, so
   the pre-existing `@ts-ignore` lint error there is silenced rather than repaired. Sanctioned by
   `AGENTS.md` ("keep it compiling or exclude it"), but do not read `0 errors` as "scratch is clean".

6. **Zod omits absent optional keys.** `{...existing, ...validated}` means a payload that *leaves
   out* a key does not clear it. This previously let a stale `rehabStage` survive on a cleared
   animal, and it applies identically to history collections — removing an event by omitting it must
   actually delete the row. Covered three ways in `petHistory.test.ts`, including
   `delete form.medicalTimeline`.

---

## 4. 🎯 Open Items, Prioritized

### P2 — The ROS registration number is still inconsistent *(still blocked on stakeholder)*

Two digit-transposed variants remain in use, and the wrong one reaches statutory documents:
`PPM-012-10-18042016` (footer, donate, privacy, terms, README) versus `PPM-021-10-18082021`
(LHDN Section 44(6) tax e-receipts and ROS CSV exports). **Which is correct still needs the actual
ROS certificate, not a guess** — no value has been changed.

**What did change**: the architecture around it. Both variants now sit side by side in
`src/lib/domain/shelterIdentity.ts` as `STATUTORY_ROS_REGISTRATION_NO` and
`PUBLIC_ROS_REGISTRATION_NO`, and the receipt/export paths (`src/actions/donations.ts`,
`src/lib/exportCsv.ts` ×2) read from there instead of holding their own copies. Emitted output is
byte-identical to before.

To close it once the certificate is confirmed:

1. Set both constants in `shelterIdentity.ts` to the confirmed value and collapse them into one
   export. `ROS_REGISTRATION_NO` also overrides the statutory one at runtime, so a hotfix can ship
   as configuration ahead of the code change.
2. Delete the divergence guard in `tests/unit/shelterIdentity.test.ts`, which fails deliberately
   once the two agree.
3. Migrate the remaining public-facing copies (`Footer.tsx`, `HomeSections.tsx`, the donate /
   privacy / terms pages, `SponsorshipModal.tsx`, and the i18n dictionary) onto the constant.

Receipts already issued are unaffected: each `Donation` row snapshots the identifiers it was issued
under, so correcting the constant changes future receipts only — which is the legally correct
behaviour, not an oversight.

### Landed — the donation ledger (was: donations were never persisted)

`submitDonationPledgeAction` previously minted a receipt number, emailed it, wrote an audit log, and
stored **nothing**. The number existed only in the donor's inbox, so it could not back an LHDN claim
or an ROS annual return. There is now a `Donation` table, gapless receipt numbering via
`ReceiptSequence`, and exact integer-sen money. See "The ledger exception" in `CLAUDE.md` and L-B2 in
`docs/architecture/LAYERS.md` for the design and why it deliberately departs from the dual-layer
store. Run `npm run db:push` after pulling.

### P4 — Closed: Data Layer & Server Actions for Rehab Needs & FAQs

Both fixtures (`src/data/faqs.json` and `src/data/rehabNeeds.json`) now have complete, type-safe data
layers:
- Shared types: `src/types/rehab.ts` and `src/types/faq.ts`
- Zod contracts: `src/lib/validations/rehab.ts` and `src/lib/validations/faq.ts`
- Store readers: `src/lib/server/` (the `faqStore.ts` / `rehabNeedsStore.ts` wrappers were deleted as dead code; callers use `faqCatalog.ts` and `rehabNeedsCatalog.ts` directly)
- Server Actions: `src/actions/rehabNeeds.ts`, `src/actions/faqs.ts`, `src/actions/needs.ts`
- Tests: `tests/unit/rehabNeeds.test.ts` and `tests/unit/faqs.test.ts` (53 tests total)

This unblocks **FE-07** (Rehab Needs wishlist, 4 categories) and **FE-09** (FAQ accordion) for UI integration.

### P5 leftovers — two small gaps in otherwise-complete rehab UI

- `src/components/admin/PetDataTable.tsx` has no rehabilitation tab, so rehab animals appear in
  **no** status filter in the admin portal and fall through to a default badge.
- The `Free (RM 0)` adoption fee still renders on rehab detail pages, directly contradicting the
  "not yet available for adoption" notice beside it.

### Open — volunteer self-registration is currently foreclosed

Every role now requires an invite code. If the shelter wants open volunteer sign-up, the correct
shape is a `VOLUNTEER` path that grants **no** `assertAuthorized` role — not a return to the old
default-`STAFF` registration. Deferred to a later session by the project owner.

### Open — the FE rebrand has not started

The site still reads *"Adopt a dog or cat from your local shelter"* with no TNRM identity anywhere.
`Navbar` has no dropdowns (FE-01), `Hero` has no impact counters (FE-02), there is no "Our Work"
section (FE-03), and `src/app/needs/` and `src/app/get-involved/` do not exist (FE-07, FE-08).

### Deferred — the `admin_session` bearer token

`verifyAdminSession()` still accepts a static `admin_session` cookie equal to `ADMIN_SECRET_KEY`:
no expiry, no subject, no revocation, and it is the sole gate on `/api/upload`. Hardening the secret
made it harder to guess, not sound. Removing the branch in favour of the signed session is the right
end state and was deliberately kept out of `3b43293` (see `TARGET_SECRET_HARDENING.md` §3.5).

Also unresolved and pre-existing: a **login timing side-channel** — a non-existent email skips
scrypt entirely, so account existence is distinguishable by response time.

---

## 5. 🤝 Working Alongside Other Sessions

Three sessions wrote to this tree at once. It worked, but only because of explicit coordination.

- **Check `ListAgents` and message peers before committing.** Two entanglements were found this way
  that file-level inspection alone would have missed: `serverStore.ts` carried two workstreams, and
  three component files depended on a fourth session's untracked `PetStatusIcon.tsx`.
- **Never commit another session's unapproved work.** Each session's user authorizes its own commits;
  a peer's say-so is not authorization, and neither is your own user's instruction to commit *your*
  files. The deadlock this created resolved correctly by waiting.
- **Re-measure baselines.** `npm install` and `git stash` from another session moved the ground more
  than once. Any number measured before a peer's change is stale.
- **Attribute foreign work in the commit body.** `4e9bdf4` records that `PetStatusIcon.tsx` came from
  a concurrent session; `f031b93` does the same in the other direction.

Neither agent session committed `.claude/settings.json` — local harness and permissions config is
not an agent's to land on someone's behalf. The project owner committed it directly in `bf941c5`,
which is the right way for that file to move.

---

## 6. 🚀 Picking This Up

```bash
npm install
npx prisma generate      # REQUIRED after pulling — new PetUpdate / MedicalTimelineEvent models
npm run dev

npm test                 # 357 tests / 30 files
npm run test:all         # 358 / 31 — includes the integration project
npx tsc --noEmit         # clean
npm run lint             # 0 errors, 4 pre-existing React Compiler warnings
npm run build            # compiles, 25/25 static pages
node docs/architecture/layer-graph.mjs   # layer report; framework entry points excluded from §G
```

`npm run db:push` has **already been applied** to the live Neon instance, including the three rehab
columns and both history tables. `npm run db:seed` round-trips all 10 fixtures — history rows keep
their fixture ids (`up-009-1`, `tl-001-1`) as primary keys, so a real round-trip either preserves
them exactly or fails loudly. That property makes `PetUpdate` / `MedicalTimelineEvent` the natural
first target for Task 03's first genuine strict-persistence test.

Read [`docs/architecture/LAYERS.md`](../architecture/LAYERS.md) first, then
[`CLAUDE.md`](../../CLAUDE.md). The
[sprint plan](SPRINT_PLAN_BACKEND_AND_FRONTEND.md) holds the remaining FE/BE breakdown, and
[`TESTING_STRATEGY_AND_MULTI_AGENT_PLAN.md`](TESTING_STRATEGY_AND_MULTI_AGENT_PLAN.md) holds
Tasks 02–04.
