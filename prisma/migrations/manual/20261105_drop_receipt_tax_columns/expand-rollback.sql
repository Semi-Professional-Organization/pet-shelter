-- Undoes expand.sql: the two issuer columns become NOT NULL again.
--
-- Only valid while the OLD code is live (before the PR is deployed, or after it is
-- reverted). Rows the new code wrote leave both columns NULL, so this back-fills them
-- with '' first, the value the old code wrote (#253). An UPDATE on `donations` is
-- refused by the append-only trigger, so the back-fill disables that one trigger for
-- the length of this transaction and re-enables it before COMMIT. One DO block, so the
-- back-fill, the trigger toggle and the lock timeout hold together in any editor mode.
--
-- Not valid after migration.sql has dropped the columns; use rollback.sql for that.

BEGIN;

-- The trigger is opt-in (production has it since 2026-09-21; a fresh branch or CI may not),
-- so it is toggled only where it exists.
DO $$
DECLARE
  has_trigger boolean := EXISTS (SELECT 1 FROM pg_trigger
                                  WHERE tgname = 'donations_no_mutation'
                                    AND tgrelid = '"public"."donations"'::regclass);
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF has_trigger THEN
    ALTER TABLE "public"."donations" DISABLE TRIGGER donations_no_mutation;
  END IF;
  UPDATE "public"."donations" SET "taxDeductibleRef" = '' WHERE "taxDeductibleRef" IS NULL;
  UPDATE "public"."donations" SET "shelterRegistrationNo" = '' WHERE "shelterRegistrationNo" IS NULL;
  IF has_trigger THEN
    ALTER TABLE "public"."donations" ENABLE TRIGGER donations_no_mutation;
  END IF;
  ALTER TABLE "public"."donations"
    ALTER COLUMN "taxDeductibleRef" SET NOT NULL,
    ALTER COLUMN "shelterRegistrationNo" SET NOT NULL;
END
$$;

COMMIT;
