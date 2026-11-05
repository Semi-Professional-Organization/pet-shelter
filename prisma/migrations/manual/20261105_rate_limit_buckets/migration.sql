-- Shared rate-limit budgets: the `rate_limit_buckets` table, its primary key and
-- one index. Purely additive. It creates one new table and touches no existing
-- object, so there is nothing to back-fill and nothing a later `prisma db push`
-- would drop.
--
-- WHY THIS EXISTS
--
-- `checkRateLimit` keeps its counts in a per-process Map. On Vercel each warm
-- instance counts separately, so the `register:ip:` and `register:email:`
-- budgets in `registerAction` did not bound a caller spread across instances,
-- and for an invite code shorter than 16 characters that budget is the only
-- thing slowing a guess (#213). `checkSharedRateLimit`
-- (`src/lib/security/sharedRateLimit.ts`) keeps those budgets here instead, one
-- row per budget, advanced by a single atomic upsert.
--
-- ORDER MATTERS: APPLY THIS BEFORE THE CODE DEPLOYS
--
-- The new code fails closed. Once it is live and this table is missing, every
-- registration is refused with "temporarily unavailable" until the table exists.
-- Nothing else on the site reads this table, so applying it early is harmless.
--
-- `key` is a SHA-256 hex digest of the budget name, so no email or IP address is
-- stored. `expiresAt` is TIMESTAMPTZ because the code compares it with now().
--
-- Takes an advisory lock in the same series as the other manual migrations, so
-- concurrent appliers queue rather than race. Safe to re-run: every statement is
-- idempotent. `rollback.sql` beside this file reverses it.

BEGIN;

SELECT pg_advisory_xact_lock(4210771001);

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");

COMMIT;

-- Check, after COMMIT. Expect one row, `rate_limit_buckets`, with 0 rows in it:
--
--     SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname = 'rate_limit_buckets';
