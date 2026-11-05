-- Drop the receipt tax columns, CONTRACT half (#251). Run AFTER the PR is live.
--
-- Order: precheck.sql -> expand.sql -> merge and deploy -> Neon snapshot -> this file.
--
-- Drops the five columns that held tax-receipt data:
--   donations."taxIdOrIc", donations."taxDeductibleRef", donations."shelterRegistrationNo",
--   donation_pledges."taxIdOrIc", pet_sponsorships."taxIdOrIc".
-- The shelter is not a registered society and the live site never issued a tax receipt
-- (owner, 2026-11-05; #239), so nothing here is kept. That is exactly the
-- `prisma migrate diff` from the schema before this PR to the schema after it.
--
-- **It refuses** if any `donations` row carries an NRIC, an LHDN reference or a ROS
-- number, because such a row is an issued tax receipt and #251 says that is a decision
-- for the shelter, not a migration. precheck.sql shows the same count without changing
-- anything.
--
-- **It also refuses before expand.sql has run**, because a database where the issuer columns
-- are still NOT NULL is one the old code may still be writing to. Expand is detectable: it
-- leaves `taxDeductibleRef` nullable. This proves only that expand ran, NOT that the PR is
-- live. Nothing in the database can tell which code is deployed, so check that by hand:
-- the Vercel production deployment must be the PR's merge commit or later. Running this
-- while the old code serves (before the deploy, or after a Vercel rollback to an older
-- deployment) breaks every reconciliation until rollback.sql runs.
--
-- One-way: DROP COLUMN destroys the values. Take a Neon snapshot branch first; that
-- snapshot is the only copy. rollback.sql brings the columns back empty, which is
-- enough for the old code to run again, not to restore data.
--
-- Safe to run twice: the second run finds the columns gone and does nothing. If it
-- refuses, it has changed nothing.
-- One DO block, so the checks and the drops commit together or not at all.

BEGIN;

DO $$
DECLARE
  col          text;
  predicates   text[] := '{}';
  tax_rows     bigint;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- All three up front, in the order the settle transactions take them (the pledge
  -- table, then donations), so a reconciliation running at this moment waits instead
  -- of deadlocking, and no row can be committed between the count below and the drop.
  LOCK TABLE "public"."donation_pledges", "public"."pet_sponsorships", "public"."donations"
    IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'donations'
                AND column_name IN ('taxDeductibleRef', 'shelterRegistrationNo')
                AND is_nullable = 'NO') THEN
    RAISE EXCEPTION
      'expand.sql has not run: a donations issuer column is still NOT NULL. '
      'Run expand.sql, deploy the PR, then run this file.';
  END IF;

  -- Each column is checked on its own, so one that is already gone cannot skip the
  -- check on the others.
  FOREACH col IN ARRAY ARRAY['taxIdOrIc', 'taxDeductibleRef', 'shelterRegistrationNo'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'donations'
                  AND column_name = col) THEN
      predicates := predicates || format('COALESCE(%I, '''') <> ''''', col);
    END IF;
  END LOOP;

  IF cardinality(predicates) > 0 THEN
    EXECUTE 'SELECT count(*) FROM "public"."donations" WHERE '
            || array_to_string(predicates, ' OR ')
      INTO tax_rows;

    IF tax_rows > 0 THEN
      RAISE EXCEPTION
        '% donations row(s) carry a tax snapshot, so a tax receipt was issued. '
        'Nothing was dropped. Record the count on #251 and stop.', tax_rows;
    END IF;
  END IF;

  ALTER TABLE "public"."donations"
    DROP COLUMN IF EXISTS "taxIdOrIc",
    DROP COLUMN IF EXISTS "taxDeductibleRef",
    DROP COLUMN IF EXISTS "shelterRegistrationNo";
  ALTER TABLE "public"."donation_pledges" DROP COLUMN IF EXISTS "taxIdOrIc";
  ALTER TABLE "public"."pet_sponsorships" DROP COLUMN IF EXISTS "taxIdOrIc";
END
$$;

COMMIT;
