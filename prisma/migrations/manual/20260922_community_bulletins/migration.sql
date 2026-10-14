-- Community bulletins: three enums, the `bulletins` table, one index.
--
-- WHERE TO RUN IT FROM. `.env.local` is gitignored, so it does not exist in a
-- worktree: `resolveDatabaseUrl()` then falls back to `LOCAL_DATABASE_URL` and
-- the script targets localhost. That is safe but silent — it prints `(local)`
-- and applies nothing to the hosted branch. To apply this for real, run it from
-- the MAIN checkout, where `.env.local` lives, and check that the `Target:`
-- line says `(remote)` and names the branch you mean before trusting it.
-- `npm run db:migrate:bulletins:local` pins localhost deliberately, for a
-- rehearsal.
--
-- Apply with `npm run db:migrate:bulletins`, which runs this file and then
-- seeds src/data/bulletins.json — but only into an EMPTY table, so a re-run
-- cannot revert a notice staff have edited or bring back one they deleted.
--
-- Applying this file ON ITS OWN leaves an empty table, and once the table
-- exists the public feeds stop falling back to the launch notices — they show
-- none, correctly, because an empty table is an answer. If it was applied that
-- way, run the script afterwards; it sees the empty table and seeds it. The
-- seed is deliberately not inlined here: it would be a second copy of the
-- launch content, free to drift from the JSON the offline fallback serves.
--
-- Written by hand rather than applied with
-- `prisma db push` for the reason 20260903_faq_knowledge_base/migration.sql
-- gives, and for one more that is specific to today:
--
--   `npm run db:push` against this database is CURRENTLY DESTRUCTIVE and
--   unrelated to this change. tasks/open/production-schema-has-drifted-ahead-of-master.md
--   records three destructive statements standing between master's schema and the
--   production branch — the `ApplicationStatus` conversion and the
--   `pets.age` -> `birthDate` migration, both of which lose data. A whole-schema
--   reconciliation run to add bulletins would execute those too. Run
--   `npm run db:check-drift` to see the current gap before touching any of this.
--
-- This file is PURELY ADDITIVE. It creates objects that do not exist on the
-- production branch and alters nothing that does, so it cannot participate in
-- that drift either way.
--
-- Safe to re-run, and safe to run while another worktree applies its own
-- migration:
--
--   * The advisory lock serialises concurrent appliers, and takes the SAME key
--     as the other hand-written migrations in this directory so they queue
--     instead of racing. (Prisma Migrate uses its own key, 72707369.)
--   * Each enum is created optimistically and the duplicate is swallowed. An
--     `IF NOT EXISTS (SELECT FROM pg_type)` pre-check is NOT race-safe: two
--     sessions can both pass the check and the loser then errors.
--   * BEGIN/COMMIT live in this file so it behaves the same whether it is run
--     by the script above or by `prisma db execute --file`.
--
-- There is ONE DROP, and it drops an index rather than data. An earlier
-- revision of this branch created `bulletins_publishedAt_idx`; review showed it
-- could not serve the query its comment named, because the admin list sorts by
-- `isPinned` first, so Postgres sorted anyway and the index cost a write on
-- every create, edit, pin and publish. The model no longer declares it.
--
-- Dropping it HERE rather than just deleting the CREATE is the point. Anyone who
-- already ran the previous revision — `npm run db:migrate:bulletins:local` landed
-- one commit before it changed — has the index in their database and not in the
-- schema. `scripts/check-drift.ts` classifies a stray index as destructive drift
-- and `npm run db:push` is `check-drift && prisma db push`, so push would be
-- blocked, with guidance blaming another worktree's branch. Re-running a
-- CREATE-only file never clears it.
--
-- No table or column is dropped. Before this change bulletins lived only in each
-- visitor's localStorage, so there is nothing in any database to reconcile or
-- lose.
--
-- To undo (there is no Prisma down path; this is the counterpart to run by hand):
--
--   BEGIN;
--   SELECT pg_advisory_xact_lock(4210771001);
--   DROP INDEX IF EXISTS "bulletins_publishedAt_idx";
--   DROP TABLE IF EXISTS "bulletins";
--   DROP TYPE IF EXISTS "BulletinCategory";
--   DROP TYPE IF EXISTS "BulletinTargetPage";
--   DROP TYPE IF EXISTS "BulletinMediaType";
--   COMMIT;
--
-- That discards every staff-authored notice. It is the right move only while the
-- table still holds nothing but the seeded fixture.

BEGIN;

-- Serialise against other hand-written migrations. Held until COMMIT.
SELECT pg_advisory_xact_lock(4210771001);

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "BulletinCategory" AS ENUM (
    'announcement', 'urgent_need', 'event', 'happy_tail', 'clinic'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "BulletinTargetPage" AS ENUM (
    'all', 'home', 'pets', 'bulletins'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "BulletinMediaType" AS ENUM (
    'none', 'image', 'video'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "bulletins" (
    "id" TEXT NOT NULL,
    "category" "BulletinCategory" NOT NULL,
    "targetPage" "BulletinTargetPage" NOT NULL DEFAULT 'all',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "titleMs" TEXT,
    "contentMs" TEXT,
    "mediaType" "BulletinMediaType" NOT NULL DEFAULT 'none',
    "mediaUrl" TEXT,
    "videoEmbedUrl" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "authorName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One index, and it serves the public read's PREDICATE (isPublished, then
-- targetPage IN (…)) rather than its sort. The admin list has no predicate and
-- leads its sort with isPinned, so no single-column index helps it at all --
-- which is why the one below is dropped and this one is kept. See the model
-- comment in prisma/schema.prisma.
CREATE INDEX IF NOT EXISTS "bulletins_isPublished_targetPage_isPinned_publishedAt_idx"
  ON "bulletins"("isPublished", "targetPage", "isPinned", "publishedAt");

-- DropIndex
-- Retires the index an earlier revision of this file created. Guarded by
-- IF EXISTS so this is a no-op on a database that never saw that revision,
-- which is every database except a developer's local one. See the header.
DROP INDEX IF EXISTS "bulletins_publishedAt_idx";

COMMIT;
