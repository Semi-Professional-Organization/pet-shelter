# Application Layer Map — Backend vs Frontend

**Purpose**: Name every layer of the **Hope for Strays** codebase, state who owns it, define the legal dependency directions, and record where the code currently breaks them.

**Scope note**: this document describes **structure**, not sprint progress. Anything that changes week to week is delegated to a command in §7 rather than written down, so this file does not rot.

**Companion documents**
- [System Architecture Blueprint](ARCHITECTURE_BLUEPRINT.md) — the *why*: 5 core tenets, 5 pillars, scaling matrix. This document is the *where*: the same ideas mapped onto directories.
- [Cross-Team Architecture Contract](ARCHITECTURE_CONTRACT_BACKEND_FRONTEND.md) — the frozen FE/BE interface (§4 points at it).
- [Prisma & Neon Guide](GUIDE_PRISMA_AND_NEON_ARCHITECTURE.md) — depth on L-B1/L-B2, especially the fallback subsystem.

**Ownership legend**: 🟢 Backend Server Engineer · 🔵 Frontend UI Engineer · ⚪ Shared contract

**Verification**: every structural claim below was produced by [`layer-graph.mjs`](layer-graph.mjs) plus `npx tsc --noEmit` and `npm test`. Nothing here is inherited from prose. Re-run after any refactor — see §8.

---

## 🗺️ 1. The Map at a Glance

```
                        ┌──────────────────────────────────────────┐
  🔵 FRONTEND           │  L-F1  Design primitives (ui/, Tailwind) │
                        │  L-F2  Feature components                │
                        │  L-F3  Client controllers + providers    │
                        │  L-F4  Client localStorage stores        │
                        │  L-F5  i18n dictionaries                 │
                        └────────────────────┬─────────────────────┘
                                             │
                        ┌────────────────────┴─────────────────────┐
  ⚪ SEAM               │  L-S1  Routing / App Router pages        │
                        │  L-S2  Shared types + Zod schemas        │
                        └────────────────────┬─────────────────────┘
                                             │
                        ┌────────────────────┴─────────────────────┐
  🟢 BACKEND            │  L-B8  Transport (Server Actions, /api)  │
                        │  L-B7  Infrastructure adapters (storage) │
                        │  L-B6  Services & integrations (email…)  │
                        │  L-B5  Security (session, RBAC, limits)  │
                        │  L-B4  Validation & contracts (Zod)      │
                        │  L-B3  Domain rules (state machine)      │
                        │  L-B2  Data access / repository          │
                        │  L-B1  Persistence (Prisma + Postgres)   │
                        └──────────────────────────────────────────┘
```

**The one rule**: dependencies point **downward only**, and **no backend module may import a `"use client"` module**. These layers are a logical contract, not something the build enforces — §8 gives you the guard test that makes it mechanical.

### How this maps to the Blueprint

The [Blueprint](ARCHITECTURE_BLUEPRINT.md) organises the same system by *pillar*. The correspondence:

| Blueprint pillar | Layer here |
|---|---|
| Pillar 1 — Identity, Authentication & RBAC | L-B5 |
| Pillar 2 — Concurrency, Transactions & Idempotency | L-B5 (idempotency) + L-B2 (`atomicUpdateApplicationStatus`) |
| Pillar 3 — Domain Rules & FSM | L-B3 |
| Pillar 4 — Rate Limiting & API Defense | L-B5 + L-B8 |
| Pillar 5 — Audit Logging & Traceability | L-B3 (policy) + L-B2 (persistence) |

Blueprint **Tenet 3** ("fail-fast boundaries — validate all external inputs at the absolute perimeter") is L-B4's entire job. Blueprint **Tenet 4** ("eliminate split-brain architectures where state is duplicated across localStorage, client memory, and databases") is **currently violated by design** — see L-F4.

---

## 🟢 2. Backend Layers (your scope)

### L-B1 — Persistence

|  |  |
|---|---|
| **Files** | `prisma/schema.prisma` · `src/lib/server/prisma.ts` · `prisma/seed.ts` · `prisma.config.ts` · `docker-compose.yml` · `neon.ts` |
| **Owns** | Physical schema, connection pooling, seeding |
| **May import** | Nothing in `src/` |

PostgreSQL through Prisma 7's `@prisma/adapter-pg` driver adapter over a `pg.Pool` (`max: 10`, 30 s idle). The client **and** the pool are cached on `globalThis` so Turbopack hot reloads do not exhaust connections. TLS is decided from the host by `resolveDatabaseSsl` (`src/lib/server/databaseSsl.ts`), which every pool in the repo uses: a verified certificate for a public host, `pg`'s own behaviour for loopback and private ones.

Models: `User`, `Pet`, `AdoptionApplication`, `AuditLog`, `ShelterSettings`, plus the `Role` enum.

### L-B2 — Data access (repository)

|  |  |
|---|---|
| **Files** | `src/lib/server/petRepository.ts` · `src/lib/server/applicationRepository.ts` · `src/lib/server/userStore.ts` · `src/lib/domain/auditLog.ts` · `src/lib/server/donationLedger.ts` |
| **Also here** | `src/lib/server/petMappers.ts` (pure row ↔ domain projection) · `src/lib/server/rehabNeedsCatalog.ts` and `src/lib/server/faqCatalog.ts` (fixture-only, **no Prisma**) · `src/lib/server/fallbackState.ts` (`resetServerStore()`) |
| **Owns** | Every SQL call; row → domain mapping; the in-memory fallback |
| **May import** | L-B1, L-B3, L-B4, and L-B5 for the `SessionUser` actor type |

**Verified**: every importer of `@/lib/server/prisma` in `src/` lives inside `src/lib/server/`, with exactly one exception — `src/lib/domain/auditLog.ts`, which every repository calls and so cannot sit inside the layer it instruments without a cycle. That property is what makes persistence swappable and lets the test suite run with no database. `tests/unit/layerBoundaries.test.ts` now enforces this as a **path rule** rather than a filename list, so adding a repository needs no test edit — but adding a *second* exception outside the directory fails until this document is updated too.

Row mappers (`DbPetRecord` → `Pet`, `DbApplicationRecord` → `AdoptionApplicationRecord`, `DbUserRecord` → `UserRecord`) live here and nowhere else.

**The dual-layer fallback**: every Prisma call is wrapped in try/catch. On error — or when the table is empty — the store returns module-level arrays seeded from `src/data/*.json`. Writes mutate both the database and the in-memory array. Consequences to design around:

- The whole app, admin portal, and test suite run with **no `DATABASE_URL` at all**.
- **DB errors are swallowed** (a development-only `console.warn`). If a write reports success but does not persist, suspect the fallback path before suspecting the caller.

`atomicUpdateApplicationStatus` is the one transactional path; treat it as the template for any future multi-row mutation.

#### The ledger exception — `donationLedger.ts`

`donationLedger.ts` sits in L-B2 but **does not use the dual-layer fallback**, and the difference is a deliberate design boundary rather than an inconsistency to tidy away.

The fallback is coherent for **reference data** — pets, applications, FAQs, rehab needs — because each has an authoritative committed fixture in `src/data/`. Serving that fixture when the database is unreachable is degraded but truthful.

A donation is **not** reference data. It records that an external event occurred: money moved. There cannot be a fixture for an event that has not happened yet, so "fall back to the fixture" is meaningless, and swallowing the write would hand a donor an official LHDN Section 44(6) receipt number for a record that exists nowhere durable.

So the ledger replaces the implicit fallback with a **declared mode**, selected by configuration rather than by whether an exception happened to be thrown:

| `DATABASE_URL` | Authority | A failing write |
|---|---|---|
| set | Postgres | propagates — the Server Action reports failure and **no receipt is issued** |
| unset | in-memory ledger | cannot occur; this is the documented offline mode, still gapless per process |

Reads keep the familiar read/write asymmetry — a failed listing returns `[]` and warns, because an unavailable admin report is an inconvenience while an unrecorded donation is data loss.

Two further properties are enforced structurally rather than by convention:

- **Gapless numbering.** `ReceiptSequence` is a counter row incremented inside the same transaction as the `Donation` insert, so a number is consumed if and only if the receipt exists. A Postgres `SEQUENCE` cannot do this — a rolled-back transaction burns its value permanently, and a hole in a statutory receipt series reads to an auditor as a destroyed receipt. `@@unique([sequenceScope, sequenceValue])` is the guarantee; the transaction is only the mechanism.
- **Append-only.** No update or delete is exported, and `Donation` has no `updatedAt`. Corrections are issued as new offsetting records, as in any accounting ledger.

### L-B3 — Domain rules

|  |  |
|---|---|
| **Files** | `src/lib/domain/stateMachine.ts` · `auditLog.ts` · `sponsorshipTiers.ts` · `matchEngine.ts` · `medicalTimeline.ts` · `money.ts` · `shelterIdentity.ts` |
| **Owns** | Legal status transitions, `DomainValidationError`, the audit trail |
| **May import** | L-B4 (types only) |

Two finite state machines, both throwing `DomainValidationError` on an illegal move:

- `APPLICATION_TRANSITION_GRAPH` — `SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED`, with `APPROVED` and `REJECTED` both able to return to `UNDER_REVIEW` (re-evaluation, appeal).
- `PET_TRANSITION_GRAPH` — five statuses. `"Rehabilitation"` is a **legacy alias** of `"In Rehabilitation"`; `normalizePetStatus()` canonicalises before every comparison, and unknown values pass through unchanged so genuinely invalid input still fails. Animals in rehab leave care only via `→ Available` (veterinary clearance).

`recordAuditLog(...)` runs on every privileged mutation and surfaces at `/admin/audit`. Pets are **soft-deleted** (`isArchived` + `deletedAt`); public queries filter archived rows out.

`sponsorshipTiers.ts` is the odd one out here: reference *data*, not a rule. It lives in `domain/` because it is framework-neutral and must be importable from both the donation Server Action and the donation UI — see §5.1.

> **Known overlap**: `auditLog.ts` sits in both L-B2 and L-B3 — it defines a domain concept *and* writes it via Prisma. It is the only file that straddles two layers. If it grows, split the policy from the write.

### L-B4 — Validation & contracts

|  |  |
|---|---|
| **Files** | `src/lib/validations/{pet,application,applicationTracking,donation,settings}.ts` · `src/types/*` |
| **Owns** | The parse boundary for all external input |
| **May import** | Only `zod` and `src/types` |

Zod 4. The rule (Blueprint Tenet 3): **every value crossing into a Server Action or route handler is parsed here before any other layer sees it.**

`PET_STATUS_VALUES` is the canonical status tuple, and `PET_STATUS_FILTER_VALUES` is derived from it — extend the former and the filter follows automatically. `src/types/*` is shared with the frontend; see §4.

`petFormSchema` wraps `petBaseFormSchema` in a `superRefine` that rejects `rehabStage`, `rehabStageMs`, and `rehabProgressPercent` on any pet whose status is not a rehabilitation status, so a cleared animal cannot keep a stale progress bar. `isRehabilitationStatus()` delegates to L-B3's `normalizePetStatus`, which is the correct direction of dependency.

> **Layering judgment call**: "rehab fields are only meaningful under care" is arguably a *domain* invariant (L-B3) implemented in the *validation* layer (L-B4). It is fine where it is — it is a shape constraint on input, and it defers to L-B3 for the status semantics. But if a second such rule appears, that is the signal to move both into `stateMachine.ts`.

### L-B5 — Security

|  |  |
|---|---|
| **Files** | `src/lib/security/{session,crypto,rbac,rateLimit,idempotency,secrets,adminSession}.ts` |
| **Owns** | Authentication, authorization, abuse control |
| **May import** | L-B4 |

- **Sessions** — not JWT. `sealSession` produces `base64url(payload).hmac` (`createHmac("sha256", …)`) signed with `SESSION_SECRET`, stored in the HTTP-only `hope_shelter_session` cookie, 24 h expiry.
- **Passwords** — `crypto.scrypt`, 16-byte random salt, 64-byte derived key, compared with `timingSafeEqual`. *(The README says bcrypt. The code is scrypt — verified.)*
- **RBAC** — `ADMIN | COORDINATOR | STAFF | VOLUNTEER`; `assertAuthorized(user, roles)` throws `UnauthorizedError` / `ForbiddenError`. `verifyAdminSession()` additionally accepts a legacy `admin_session` cookie matching `ADMIN_SECRET_KEY`.
- **Rate limiting / idempotency** — in-memory `Map`, sliding window (login 5/min). Per-process only: does not survive a restart and does not scale horizontally. Externalize before any multi-instance deployment.

⚠️ **There is no `middleware.ts`.** `src/app/admin/layout.tsx` guards routes **client-side only**. Every admin Server Action must re-check authorization itself. Never rely on the layout.

### L-B6 — Services & integrations

|  |  |
|---|---|
| **Files** | `src/lib/email.ts` · `src/lib/presentation/exportCsv.ts` |
| **Owns** | Outbound I/O and computation that is not a domain invariant |
| **May import** | L-B3, L-B4 |

- **`email.ts`** — Resend. Five transactional senders: application confirmation, staff alert, status update, interview invitation, donation receipt. Silently simulates without `RESEND_API_KEY`.
- **`exportCsv.ts`** — *split residency*. `generate*CsvString` is pure and node-testable (RFC-4180 + formula-injection sanitisation) 🟢; the `export*ToCsv` wrappers trigger a browser download via `Blob` + `document.createElement("a")` 🔵.

### L-B7 — Infrastructure adapters

|  |  |
|---|---|
| **Files** | `src/lib/storage/index.ts` |
| **Owns** | Pluggable binary storage |
| **May import** | Nothing |

A textbook port/adapter: the `StorageProvider` interface with `LocalStorageProvider`, `S3StorageProvider`, and `CloudinaryStorageProvider`, selected by `getStorageProvider()` from `STORAGE_PROVIDER` with a graceful local default. Uploads land in `public/uploads/` (git-ignored).

> **Gap**: the S3 and Cloudinary `uploadFile` implementations compute and return a public URL but do **not** perform the actual PutObject, and their `deleteFile` returns `true` unconditionally. Only `LocalStorageProvider` genuinely persists. Real remote upload is the outstanding work in this layer.

### L-B8 — Transport / API surface

|  |  |
|---|---|
| **Files** | `src/actions/{pets,applications,auth,donations,settings,audit}.ts` (`"use server"`) · `src/app/api/upload/route.ts` |
| **Owns** | The app's entire public write/query API |
| **May import** | L-B2 through L-B7 |

**Server Actions are the API.** There is exactly one REST route, and only because it must accept `multipart/form-data`: `/api/upload` authenticates via `verifyAdminSession()`, enforces a 5 MB cap, an allow-list of four image MIME types, and **magic-number signature validation** to defeat MIME spoofing.

The canonical shape of an action — each step is a different layer:

```
"use server"
  → getCurrentSession()               // L-B5
  → assertAuthorized(user, [ROLES…])  // L-B5
  → checkRateLimit(...)               // L-B5
  → schema.parse(input)               // L-B4
  → validate*Transition(...)          // L-B3
  → repository mutation               // L-B2
  → recordAuditLog(...)               // L-B3
  → revalidatePath(...)               // Next cache
```

### Supporting concerns (🟢 yours)

| Concern | Location |
|---|---|
| **Tests** | `tests/unit/` — Vitest, **node environment, no jsdom**. Mirrors L-B2…L-B7. Test logic in `lib/`, never React rendering. |
| **Fixture data** | `src/data/{pets,applications,bulletins,faqs,rehabNeeds}.json` — the fallback dataset behind L-B2 |
| **Build & ops** | `next.config.ts` (incl. the `images.remotePatterns` allow-list) · `.env.example` · `.github/` · `vitest.config.mts` |

---

## 🔵 3. Frontend Layers (not your scope)

| ID | Layer | Location |
|---|---|---|
| **L-F1** | Design primitives | `src/components/ui/` (shadcn `base-sera`, `@base-ui/react`) · `src/app/globals.css` · Tailwind v4 / PostCSS · `components.json` |
| **L-F2** | Feature components | `src/components/features/{pets,adoptions,bulletins,donations}` · `src/components/admin/` · `src/components/layout/` |
| **L-F3** | Client controllers | `src/hooks/use*Controller.ts` (9 files) · `src/components/providers/` (Theme, Language) |
| **L-F4** | Client stores | `src/lib/client/{petStore,applicationStore,settingsStore,sponsorshipStore,adminAuth}.ts` — plus `imageOptimization.ts`. The directory means **browser-only**, not "localStorage hook" — the guard enforces *where code may run*, mirroring `src/lib/server/`, which likewise holds non-Prisma catalogs. `tests/unit/layerBoundaries.test.ts` forbids any non-client module importing them |
| **L-F5** | i18n | `src/lib/i18n/translations.ts` (`en` + `ms`) · `useLanguage` |

**Do not confuse L-F4 with L-B2.** `src/lib/server/` is the Prisma-backed repository layer; the L-F4 stores are browser-only React hooks that never touch the database. L-F4 is a standing violation of Blueprint Tenet 4 (single source of truth), tolerated because these stores drive admin/demo UI only. Treat any *new* use as a design error.

`bulletinStore.ts` left this list on 2026-09-22. It was the one store backing a **public** surface rather than admin/demo UI, so the tolerance above never applied to it: the feed on `/`, `/pets` and `/bulletins` was per-browser, editable by any visitor, and unreachable by anything staff posted. It is now `src/lib/server/bulletinRepository.ts` (L-B2) behind `src/actions/bulletins.ts` (L-B4), with the editor at `/admin/bulletins`. See `tasks/decisions/2026-09-22-bulletins-get-a-server-side-store.md`.

---

## ⚪ 4. The Seam

### L-S1 — Routing / App Router pages

`src/app/**/page.tsx` and `layout.tsx`. Async Server Components that `await` a Server Action and pass plain data into client components. **Shared territory**: you own what the page fetches, your partner owns what it renders. Coordinate before changing a page's data requirements.

### L-S2 — Shared contract

`src/types/*` + the exported signatures of `src/actions/*` + the Zod schemas in `src/lib/validations/*`.

**`src/types/pet.ts` is the single most depended-upon module in the codebase — 24 importers.** Nothing else is close (`types/application.ts` is next at 10, `lib/utils.ts` at 11). That fan-in is why widening `Pet` ripples through every layer at once, and why it must be changed deliberately: update the [Cross-Team Architecture Contract](ARCHITECTURE_CONTRACT_BACKEND_FRONTEND.md) in the same PR.

**Data flow across the seam:**

```
Server Component page ──await──> src/actions/* ──> src/lib/server/* ──> Prisma
                                      ▲                            └─ fallback: src/data/*.json
"use client" component ──> use*Controller hook ──┘
```

---

## ⚠️ 5. Verified Layer Violations

Computed from the full import graph, not by inspection.

> **Not a violation**: Server Components importing client components. That is the normal RSC boundary and 43 such edges exist by design. Only `src/lib/*` and `src/actions/*` edges are counted below.

### 5.1 — Resolved, and now guarded

`src/actions/donations.ts` used to import `SPONSORSHIP_TIERS` from `src/lib/client/sponsorshipStore.ts`, a `"use client"` module — a Server Action reaching into client-only code.

**The fix**: the catalog moved to `src/lib/domain/sponsorshipTiers.ts`, a directive-free module both sides may import. `sponsorshipStore.ts` re-exports it so the three client consumers and `controllers.test.ts` were untouched; the action now calls `findSponsorshipTier(id)`.

**The guard**: [`tests/unit/layerBoundaries.test.ts`](../../tests/unit/layerBoundaries.test.ts) builds the import graph and asserts that no `"use server"` module transitively reaches a `"use client"` one. Transitive closure over all six action files is currently clean, and the test has been verified to fail — naming the offending edge — when the violation is reintroduced.

> A guard that has never failed proves nothing. If you extend this test, break it on purpose once before trusting it.

### 5.2 — Resolved: hazardous barrels pruned

All unused barrels (`@/lib/stores`, `@/lib/security`, `@/lib/services`, and `@/components/**`) have been removed. The codebase strictly enforces direct, concrete file imports, eliminating any latent server-action-to-client-component boundary leakage from re-exports.

### 5.3 — Misfiled *(closed 2026-08-27)*

`imageOptimization.ts` was browser-only (canvas) while sitting in `lib/`. It now lives at
`src/lib/client/imageOptimization.ts` and carries a `"use client"` directive, so a server import is
a build error rather than a silent no-op — its exports previously degraded quietly off the browser
(`isWebPSupported()` → `false`, `optimizeImageForUpload()` → the original file), which would have
shipped unoptimised uploads with nothing failing.

### 5.4 — Pruned dead code

- `src/hooks/useLanguage.ts` (re-export shim) was removed — every consumer imports `useLanguage` from `@/components/providers/LanguageProvider` directly.
- `src/components/ui/{badge,carousel,select}.tsx` remain available as baseline shadcn design system primitives.

---

## 🔧 6. Structural Gap: the contract is wider than the store

A class of inconsistency this codebase is structurally prone to, and it is **invisible to the compiler**.

`Pet` fields are optional (`?`). An optional field declared in `src/types/pet.ts` but absent from `schema.prisma` and `src/lib/server/petMappers.ts` produces **no type error, no runtime error, and no data** — it simply returns `undefined` forever once a real database is serving. Any UI bound to it renders empty with nothing failing anywhere in the stack. The in-memory fallback hides this completely, because fixtures in `src/data/pets.json` *do* carry the field.

**Current state — the three scalars are now wired end to end:**

| Field | L-S2 type | L-B4 Zod | L-B1 column | L-B2 mapper |
|---|:---:|:---:|:---:|:---:|
| `rehabStage` | ✅ | ✅ | ✅ `String?` | ✅ read + write |
| `rehabStageMs` | ✅ | ✅ | ✅ `String?` | ✅ read + write |
| `rehabProgressPercent` | ✅ | ✅ | ✅ `Int?` | ✅ read + write |
| **`updates: PetUpdate[]`** | ✅ | — | ❌ | ❌ |
| **`medicalTimeline: MedicalTimelineEvent[]`** | ✅ | — | ❌ | ❌ |

**The gap that remains is exactly the nested collections** — and that is not an oversight, it is a pending modeling decision. A scalar ports mechanically into a nullable column; `PetUpdate[]` and `MedicalTimelineEvent[]` require choosing between a `Json` column (cheap, unqueryable, no referential integrity) and a related table (queryable, indexable, migration cost). Until that call is made, treat those two as **fixture-only**.

Same shape, related: `src/data/faqs.json` and `src/data/rehabNeeds.json` are committed bilingual fixtures. They **now have both** — `src/lib/server/faqCatalog.ts` and `src/lib/server/rehabNeedsCatalog.ts` read them, `getFaqsAction` / `getRehabNeedsAction` expose them, and their category tab strips are derived rather than hardcoded (`5832244`). Category labels resolve through `src/lib/presentation/categoryTabs.ts`, which is their single declaration. The L-B2 + L-B8 background is [Backend Module 03](../tutorials/TUTORIAL_BE_03_REHAB_NEEDS_API.md).

What is still hardcoded is **the donate page**: `src/app/donate/page.tsx:107` holds its own monolingual `faqs` array with a `q`/`a` shape unrelated to `FaqItem`, rendered at `:382`. It is the last inline FAQ list, and unlike the two above it has no fixture behind it at all.

> **The general rule this illustrates** is Rule 6 in §9: adding an optional field to `Pet` is a four-layer change (type → Zod → column → mapper), and skipping any of the last three fails silently. There is no compiler help here; the only guard is remembering.

---

## 🩺 7. Checking Current Status

Deliberately not recorded here — it changes daily. Run:

```bash
npx tsc --noEmit | grep -v '^scratch/'   # scratch/ is type-checked but is not real code
npm test                                  # Vitest, node env
node docs/architecture/layer-graph.mjs    # the structural guard (§8)
```

`scratch/` is included by `tsconfig` (`**/*.ts`) and contributes unrelated errors. Filter it; do not "fix" it.

---

## 🧪 8. Reproducing This Analysis

Every structural claim above came from [`layer-graph.mjs`](layer-graph.mjs) — ~90 lines of `fs` + regex, no dependencies. It resolves `@/` and relative imports across `src/`, then reports:

| Section | Question it answers |
|---|---|
| **A** | Which non-client modules import a `"use client"` module? |
| **B** | Which client modules are *transitively* reachable from each `"use server"` file? ← the one that matters |
| **C** | Who imports `@/lib/server/prisma`? (must be inside `src/lib/server/`, plus `domain/auditLog.ts`) |
| **D** | Which `lib/` modules touch browser APIs? |
| **E** | Who imports each barrel? |
| **F** | Fan-in ranking — what is load-bearing |
| **G** | Orphan modules |

**The rule is now a test.** [`tests/unit/layerBoundaries.test.ts`](../../tests/unit/layerBoundaries.test.ts) runs in the normal suite and enforces two of the invariants above:

| Assertion | Enforces |
|---|---|
| No `"use server"` module transitively reaches a `"use client"` module | §5.1 |
| `@/lib/server/prisma` is imported only from `src/lib/server/` plus `domain/auditLog.ts` | L-B2 |

It carries a third case — a sanity check that the walker actually found the modules — because a broken resolver would make the other two pass vacuously. Changing the repository trio deliberately means updating both the `allowed` list in that test and L-B2 above, which is the intended friction.

The script and the test duplicate a little resolver logic on purpose: the script is the exploratory tool that answers all seven questions, the test is the narrow guard that runs in CI with no dependency on `docs/`.

> ⚠️ **Caveat on report D**: a naive `\bwindow\b` regex produces false positives. `matchEngine.ts`, `rateLimit.ts`, and `idempotency.ts` all match on the *word* "window" in comments ("sliding window", "TTL window") and are in fact browser-free. Always confirm a D hit by reading the line.

---

## ✅ 9. Rules of Thumb

1. **Prisma imports live in exactly three files.** A fourth is a design decision, not a detail.
2. **No backend module imports a `"use client"` module.** Enforced in CI (§8) — if you need a value on both sides, put it in a directive-free module.
3. **Parse at the edge.** External input hits a Zod schema in L-B4 before any other layer sees it.
4. **Authorize in the action, not the layout.** There is no middleware.
5. **Every privileged mutation calls `recordAuditLog`.**
6. **Optional fields on `Pet` are a silent contract.** Adding one to `src/types/pet.ts` without the matching column and mapper produces zero errors and zero data — see §6.
7. **Don't trust the barrels yet.** They have no importers and `security/index.ts` is loaded (§5.2).
8. **User-facing copy belongs in the i18n dictionary** (L-F5), never inline in JSX. `tests/unit/i18n.test.ts` enforces `en`/`ms` key parity, so a half-added key fails CI.

---

## 📌 Appendix — Discrepancies with `CLAUDE.md`

Recorded rather than silently fixed; amending `CLAUDE.md` is the maintainer's call. Verified against the source on the date this document was last regenerated.

| `CLAUDE.md` says | Verified reality |
|---|---|
| `userStore` is one of the *client* stores | It has no `"use client"` directive, imports `@/lib/server/prisma`, and is server-side L-B2 — it now lives at `src/lib/server/userStore.ts`. Only the six modules in `src/lib/client/` are client stores. |
| The Zod enums in `validations/pet.ts` "still only know the three original statuses" | `PET_STATUS_VALUES` contains all five, including both rehab spellings. |
| `PET_TRANSITION_GRAPH` "still only knows the three original statuses" | It has all five plus a `normalizePetStatus` alias resolver. |
| "`npx tsc --noEmit` currently fails" — the whole *Work in progress / known broken* section | That propagation was completed. `tsc` is clean outside `scratch/`; the suite is green. The section is stale. |
| "Prefer the barrels for cross-module imports" | Zero modules import any barrel (§5.2). |
| README: passwords use bcrypt | The code uses `crypto.scrypt`. (`CLAUDE.md` already flags this correctly.) |

`CLAUDE.md` also states that the new `Pet` fields "exist in neither `prisma/schema.prisma` nor the repository row mappers". That was true when written and is now **half true**: the three rehab scalars are wired end to end, and only `updates[]` and `medicalTimeline[]` remain unmapped — see §6.

**A note on all of the above.** Every row in this table was verified minutes before this document was regenerated, and several of them changed *during* the analysis: the TNRM propagation through L-B3, L-B4, L-B1, and L-B2 all landed while this file was being written. That is the argument for §7 — a document that hardcodes progress is wrong within the hour, so status lives in commands here, and only structure is written down.
