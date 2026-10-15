-- Donation pledges: the `donation_pledges` table, one primary key, two unique
-- indexes and two ordinary indexes. Purely additive — it creates one new table and
-- touches no existing object, so there is nothing here for a later `prisma db
-- push` to drop and nothing to back-fill.
--
-- WHY THIS EXISTS
--
-- Until 2026-09-22 `submitDonationPledgeAction` allocated an official `HFS-DON-*`
-- Section 44(6) receipt the moment a supporter submitted the public donation form.
-- Nothing had observed a bank statement at that point. This table holds the gift
-- between submission and reconciliation, so the receipt series is drawn from only
-- once a coordinator has confirmed the money arrived. See
-- `tasks/decisions/2026-09-22-general-gifts-become-pending-until-reconciled.md`.
--
-- The pending state could NOT be a status column on `donations`: production
-- enforces `prisma/sql/donation_append_only.sql` (`donations_no_mutation`, applied
-- 2026-09-21), which refuses every UPDATE on that table, so a pending receipt row
-- could never be updated to carry its number. That trigger is unaffected by this
-- file and must stay installed.
--
-- WHY IT IS WRITTEN BY HAND
--
-- `npm run db:push` reconciles the WHOLE schema and drops whatever the database
-- has that `prisma/schema.prisma` does not. Measured against the production branch
-- on 2026-09-18 it still proposes two destructive statements unrelated to this
-- change (`pets.age` -> `birthDate`, and a `notification_preferences` default).
-- Running it to get this one table would take those with it. See
-- `tasks/open/production-schema-has-drifted-ahead-of-master.md`. Apply this file
-- instead, in the Neon SQL editor or with `prisma db execute`, then re-run
-- `npm run db:check-drift` to confirm the table came off the additive list.
--
-- Takes an advisory lock in the same series as the FAQ and sponsorship migrations
-- beside it, so concurrent appliers from different worktrees queue rather than
-- race.
--
-- Safe to re-run: every statement is idempotent, and BEGIN/COMMIT live in this
-- file so it behaves the same however it is run. `rollback.sql` beside this one
-- reverses it.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

-- A general gift a supporter says they have sent, before anyone has checked.
-- Distinct from `donations`, which is the append-only issued receipt: a pledge has
-- a lifecycle and can be dismissed, a receipt cannot.
CREATE TABLE IF NOT EXISTS "donation_pledges" (
    "id" TEXT NOT NULL,
    "donorName" TEXT NOT NULL,
    "donorEmail" TEXT NOT NULL,
    "donorPhone" TEXT,
    "taxIdOrIc" TEXT,
    "tierId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "amountSen" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "frequency" TEXT NOT NULL DEFAULT 'one_time',
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "targetPetName" TEXT,
    "notes" TEXT,
    "pledgeRef" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_pledges_pkey" PRIMARY KEY ("id")
);

-- One reference per pledge, and at most one receipt attached to it. The unique
-- index on receiptNumber is what stops a second confirmation minting a second
-- Section 44(6) receipt for the same money. NULLs do not collide in a Postgres
-- unique index, so any number of pledges may sit unreconciled.
CREATE UNIQUE INDEX IF NOT EXISTS "donation_pledges_pledgeRef_key"
  ON "donation_pledges"("pledgeRef");
CREATE UNIQUE INDEX IF NOT EXISTS "donation_pledges_receiptNumber_key"
  ON "donation_pledges"("receiptNumber");

-- Serves the coordinator's queue: pending rows, oldest first.
CREATE INDEX IF NOT EXISTS "donation_pledges_status_createdAt_idx"
  ON "donation_pledges"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "donation_pledges_donorEmail_idx"
  ON "donation_pledges"("donorEmail");

COMMIT;
