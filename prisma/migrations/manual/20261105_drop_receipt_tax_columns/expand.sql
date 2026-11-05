-- Drop the receipt tax columns, EXPAND half (#251). Run BEFORE merging the PR.
--
-- The PR's code stops writing `donations."taxDeductibleRef"` and
-- `donations."shelterRegistrationNo"`. Both are NOT NULL with no default, so if the new
-- code went live first, every reconciliation would fail its INSERT (23502) and no
-- coordinator could confirm a gift. Relaxing them first makes the old code and the new
-- code both work against the same database, which is the whole job of this half.
--
-- `taxIdOrIc` on all three tables is already nullable and needs nothing here.
--
-- Reversible with no data loss: expand-rollback.sql restores NOT NULL. It is safe to
-- run twice. Changes no row, so the append-only trigger on `donations` (which fires on
-- UPDATE and DELETE) is not involved.

BEGIN;

-- One DO block, so the 5-second lock timeout holds even in an editor mode that runs each
-- statement in its own transaction, where a bare SET LOCAL would only warn.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "public"."donations"
    ALTER COLUMN "taxDeductibleRef" DROP NOT NULL,
    ALTER COLUMN "shelterRegistrationNo" DROP NOT NULL;
END
$$;

COMMIT;
