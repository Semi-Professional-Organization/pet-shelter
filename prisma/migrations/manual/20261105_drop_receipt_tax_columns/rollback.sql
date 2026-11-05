-- Undoes migration.sql: the five columns come back, nullable and EMPTY.
--
-- This restores the shape, not the data. Their values are gone once migration.sql
-- commits; the Neon snapshot branch taken before it is the only copy. Empty, nullable
-- columns are what the post-expand database looked like for new rows, so the code
-- from before this PR runs against the result (it writes '' to the issuer columns and
-- never writes `taxIdOrIc`). To go all the way back to NOT NULL, run
-- expand-rollback.sql after this.
--
-- Safe to run twice.

BEGIN;

-- One DO block for the lock timeout, and the tables locked up front in the order the
-- settle transactions take them (pledge table, then donations), so a reconciliation
-- running at the same moment waits instead of deadlocking.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  LOCK TABLE "public"."donation_pledges", "public"."pet_sponsorships", "public"."donations"
    IN ACCESS EXCLUSIVE MODE;
  ALTER TABLE "public"."donations"
    ADD COLUMN IF NOT EXISTS "taxIdOrIc" TEXT,
    ADD COLUMN IF NOT EXISTS "taxDeductibleRef" TEXT,
    ADD COLUMN IF NOT EXISTS "shelterRegistrationNo" TEXT;
  ALTER TABLE "public"."donation_pledges" ADD COLUMN IF NOT EXISTS "taxIdOrIc" TEXT;
  ALTER TABLE "public"."pet_sponsorships" ADD COLUMN IF NOT EXISTS "taxIdOrIc" TEXT;
END
$$;

COMMIT;
