# The sponsor portal is merged but inert: no coordinator can reconcile a commitment

**Status:** open · opened 2026-09-03 · follows PR #6 (`3239671`)

The supporter account layer is on `master`. A supporter cannot use it, and will not be able
to until one of the items below lands. This is the safe failure — the alternative was
letting a public form grant Gold — but it is a failure, and it should not be discovered by
a donor.

---

## 1. ~~Nothing reaches `reconcilePetSponsorshipAction`~~ — **Resolved 2026-09-08**

> `/admin/donations` now lists the pending queue and confirms a row, through
> `listPendingSponsorshipsAction` and the existing mutation. Gated on the new
> `RECONCILE_SPONSORSHIPS` permission, granted to exactly the roles the mutation's own
> guard admits — pinned by `tests/unit/sponsorshipReconciliation.test.ts`, because the two
> guards are written in different vocabularies. Rationale and what stayed unmeasured:
> `tasks/decisions/2026-09-08-reconciliation-screen-closes-the-sponsor-portal.md`.
>
> **This does not unblock production on its own — §2 below still does.** The screen reads
> and writes through the database; with the migration unapplied there is no `sponsors`
> table for it to reach. *(2026-09-16: §2's premise did not hold. The table was already on
> production; see §2.)*

The original text, unedited:

`src/actions/sponsorships.ts` exports it, RBAC-guarded to ADMIN/COORDINATOR and audited. No
admin page calls it. So:

- Every commitment stays `PENDING_PAYMENT` forever.
- `countsTowardFunding()` is false for all of them, so `deriveTier` returns `null` for
  every real supporter. Nobody earns Bronze.
- No `receiptNumber` is ever assigned, and the account-claim challenge requires one — so
  **nobody can register a portal account at all.**

The three demo logins in the guide work because `sponsorDemoSeed.ts` reconciles their
commitments in offline mode. On production, with a database configured, no seed runs and
the portal has zero usable accounts.

**What is needed:** a coordinator view listing `PENDING_PAYMENT` commitments with their
`pledgeRef`, amount, supporter and animal, and a confirm action. `pledgeRef` is prefixed
`HFS-PLG` precisely so a coordinator reading a bank statement can tell a claim from a
receipt — the screen should show it prominently. `reconcileSponsorship` already returns
`already_reconciled` with the existing number, so two coordinators racing is handled;
the UI needs to render that outcome rather than treat it as an error.

## 2. ~~The production migration has not been applied~~ — **Resolved 2026-09-16, by measurement**

> Nothing was applied: the production Neon branch already had it. The 2026-09-09 drift record is
> consistent with it being there then too, but that record does not name its branch.
> `npm run db:check-drift` against `ep-broad-band-b36iq50r` proposes no statement for `sponsors`,
> the `pet_sponsorships.displayOnWall` column, its `userId` index and foreign key, `donations` or
> `receipt_sequences`. The raw output, and why absence from that diff is presence, are in
> `tasks/decisions/2026-09-16-sponsor-portal-activation-applies-nothing-to-production.md`.
>
> The 500 this section predicted is absent on the live site: `GET /sponsors` and
> `GET /sponsor/login` on `https://pet-shelter-phi.vercel.app` return 200, and the route has no
> error or loading boundary to hide a thrown query. That rules out production reading a database
> without `sponsors`. On its own it does not show production reads a database: a production build
> seeds no demo sponsors (`SEEDING_ENABLED` in `src/lib/server/sponsorRepository.ts`), so it
> renders the same empty wall with no `DATABASE_URL`.
>
> **Which database production reads — checked by the human, 2026-09-16.** In the Vercel dashboard,
> Settings → Environment Variables: `DATABASE_URL` is present, ticked for Production, and names the
> `ep-broad-band-…` endpoint. That is the branch the drift check measured, so the inventory above
> describes the database live visitors use. Reported in chat, not screenshotted. **Not reported:**
> the variable's "Updated" date against the running deployment (2026-09-15 00:51 +08), since a
> variable changed after a deploy is not in it, and whether the URL carries `sslmode=disable`.
>
> **2026-09-17, human-run read-only probe:** `pet_sponsorships` has no rows on production, so no
> supporter has pledged through a pet's checkout since 5b2672a, and nothing awaits reconciliation.
> `donations` had 3 rows and no append-only trigger. Both were settled on 2026-09-21: the rows
> were e2e test receipts and were removed, and the trigger is installed, so the ledger is empty and
> the first real receipt will be `HFS-DON-202609-0004`
> (`tasks/decisions/2026-09-21-production-receipts-are-append-only.md`).
>
> **Still open, and why this entry stays open:** §3–§5 below. No receipt has yet been observed
> travelling pledge → confirm → `HFS-DON-…` → claimed account on production; that is step 6 of
> `docs/tasks/TARGET_SPONSOR_PORTAL_PRODUCTION_ACTIVATION.md`.

The original text, unedited:

```bash
psql "$DATABASE_URL" -f prisma/sql/2026-09-03_sponsor_accounts_additive.sql
```

Until then production has no `sponsors` table. The repositories declare the database
authoritative rather than falling back (`isLedgerPersistent()`), so this is a **500 on
`/sponsors` and `/sponsor/login`**, not a graceful degradation.

Do not reach for `db:push` — see
[`2026-09-03-schema-changes-ship-as-additive-sql-here-never-as-db-push.md`](../lessons/2026-09-03-schema-changes-ship-as-additive-sql-here-never-as-db-push.md).

## 3. Exclusive media is gated but not secret

`src/data/exclusiveMedia.json` holds public Unsplash URLs and public YouTube ids. The gate
is real — an under-tier response provably contains no URL, asserted in
`tests/unit/sponsorPetMediaRoute.test.ts` — but anyone who obtains a link keeps it, and
anyone can construct the Unsplash ones without going near the gate.

Real exclusive media needs signed, short-lived URLs minted per request inside
`getGatedPetVideoDiary` / `getGatedPetGallery`. Note the constraint recorded in
`src/lib/domain/sponsorAccess.ts`: `gate()` currently counts withheld items by loading
them, which is free for a JSON import and wrong the moment the catalogue becomes a remote
fetch. Give it a separate count source at the same time.

## 4. A claimed account is only as good as a forwarded email

The claim challenge requires an `ACTIVE` commitment's `receiptNumber`. That is proof of
possession, not proof of identity: a supporter who forwards their receipt has given away
their claim, and the number is not high-entropy.

Verified-email sign-up is the proper fix and was deliberately deferred. The exposure is
bounded — the portal projects no tax identifiers, no payment details and no other
supporter's data — but it should not be deferred indefinitely.

`NotificationPreference` already mails a signed token to an address to authenticate a
preference change. That mechanism is the obvious basis for verifying a claim, and reusing
it would be better than building a second one.

## 5. Two scaling ceilings, deliberately not optimised

Recorded so they are met as decisions rather than surprises. Neither is a correctness
problem at eight pets and a handful of supporters.

- `getSponsorDashboard` reads every pet via `getServerPetsAsync()` to resolve one to three
  sponsored animals, because that is the only database-aware pet reader. Wants
  `findMany({ where: { id: { in: [...] } } })` somewhere north of a few hundred pets.
- `getSponsorWall` loads every opted-in account with its commitments and derives standings
  in JavaScript, on a `force-dynamic` page. Wants SQL aggregation, or a cached page with
  tag invalidation, somewhere north of a few thousand supporters.

---

## Not in scope here

The `Playwright golden paths` failure on `04_admin_application_review` predates PR #6 and is
tracked separately in
[`admin-application-delete-leaves-the-row.md`](admin-application-delete-leaves-the-row.md).

## Background

- Design: `docs/architecture/GUIDE_SPONSOR_TIERS_AND_GATED_CONTENT.md`
- Why sponsor state annotates the ledger instead of extending it:
  `tasks/decisions/2026-09-03-sponsor-state-annotates-the-ledger.md`
- What went wrong building it, and the six lessons: `tasks/lessons/` (the sponsorship entries)
