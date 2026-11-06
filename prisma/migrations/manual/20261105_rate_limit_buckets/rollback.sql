-- Reverses `migration.sql` beside this file.
--
-- ROLL BACK THE CODE FIRST. While the shared-limiter code is deployed, dropping
-- this table makes every staff registration fail closed ("temporarily
-- unavailable"). Redeploy the previous build, then run this.
--
-- What is lost: only in-flight rate-limit counts, which expire within a minute
-- anyway. No account, application or donation lives here.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

DROP INDEX IF EXISTS "rate_limit_buckets_expiresAt_idx";
DROP TABLE IF EXISTS "rate_limit_buckets";

COMMIT;
