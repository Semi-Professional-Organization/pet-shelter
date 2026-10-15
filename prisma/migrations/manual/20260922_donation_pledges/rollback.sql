-- Reverses `migration.sql` beside this file.
--
-- DESTRUCTIVE. Dropping `donation_pledges` discards every gift that has been
-- submitted but not yet reconciled, and those rows are the only record that the
-- supporter told the shelter anything. Issued receipts are unaffected: they live
-- in `donations`, which this file does not touch.
--
-- Before running it, check what would be lost:
--
--     SELECT status, count(*) FROM donation_pledges GROUP BY status;
--
-- A non-zero PENDING_PAYMENT count is unreconciled supporter money. Export or
-- reconcile those rows first, rather than dropping them to unblock a deploy.
--
-- Reconciled pledges (status ACTIVE) carry less consequence — their receipt is
-- already in `donations` and the audit log records the confirmation — but the link
-- from an `HFS-GFT` reference a donor quoted to the `HFS-DON` receipt it became is
-- lost with them.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DROP INDEX IF EXISTS "donation_pledges_donorEmail_idx";
DROP INDEX IF EXISTS "donation_pledges_status_createdAt_idx";
DROP INDEX IF EXISTS "donation_pledges_receiptNumber_key";
DROP INDEX IF EXISTS "donation_pledges_pledgeRef_key";
DROP TABLE IF EXISTS "donation_pledges";

COMMIT;
