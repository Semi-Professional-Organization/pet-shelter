/**
 * Applies the community bulletin migration and seeds `src/data/bulletins.json` into it.
 *
 * **It seeds an empty table and leaves a non-empty one alone.** The launch
 * notices go in, all four in one transaction, only when `bulletins` holds no
 * rows — however the table came to exist, whether this script created it or the
 * SQL was applied another way first. A table with any rows is staff content and
 * is not touched, so a re-run cannot overwrite a notice staff edited or bring
 * back one they deleted.
 *
 * Separate from `prisma/seed.ts` for the reason `migrate-faqs.ts` gives: that
 * script is refused against anything but a local database
 * (`assertSeedTargetIsLocal`), because it is not additive — it deletes and
 * rewrites pets, applications and staff users from fixtures. This one only ever
 * touches the `bulletins` table, so it is safe to point at a hosted branch,
 * which is what makes the launch notices deployable without a full reseed.
 *
 * It is ALSO the only safe way to put this table on the production branch.
 * `npm run db:push` reconciles the whole schema, and
 * `tasks/open/production-schema-has-drifted-ahead-of-master.md` records three
 * destructive statements currently standing between master's schema and that
 * database — two of which lose data and have nothing to do with bulletins.
 *
 * `DATABASE_URL` is resolved through `prisma/env.ts`, the single resolver every
 * database-touching script shares, so this cannot end up talking to a different
 * database than `db:push` or `db:check-drift`.
 *
 * **Run it from the main checkout, not a worktree.** `.env.local` is gitignored
 * and therefore absent from a worktree, so the resolver falls back to
 * `LOCAL_DATABASE_URL` and this targets localhost — safely, but silently, and
 * it applies nothing to the hosted branch. The `Target:` line is the check:
 * `(remote)` means it is about to touch a hosted database, `(local)` means it
 * is not. `npm run db:migrate:bulletins:local` pins localhost deliberately for
 * a rehearsal.
 *
 * Prints the table list before and after so the blast radius is visible.
 */
import fs from "node:fs";
import { Pool } from "pg";

import { resolveDatabaseUrl, isLocalDatabaseUrl } from "../prisma/env";
import { resolveDatabaseSsl } from "../src/lib/server/databaseSsl";
import bulletinsData from "../src/data/bulletins.json";

const MIGRATION = "prisma/migrations/manual/20260922_community_bulletins/migration.sql";

async function main() {
  const connectionString = resolveDatabaseUrl();
  const sslPolicy = resolveDatabaseSsl(connectionString);

  console.log(
    "Target:",
    connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@"),
    // By host, not by string equality with the one canonical local URL: a
    // local database on any other port or name used to print "(remote)",
    // which is backwards for the line an operator reads to tell them apart.
    isLocalDatabaseUrl(connectionString) ? "(local)" : "(remote)"
  );

  const pool = new Pool({
    connectionString: sslPolicy.connectionString,
    ssl: sslPolicy.ssl,
    connectionTimeoutMillis: 20000,
  });

  const listTables = async () => {
    const r = await pool.query(
      "select table_name from information_schema.tables where table_schema='public' order by 1"
    );
    return r.rows.map((x: { table_name: string }) => x.table_name);
  };

  try {
    const before = await listTables();
    console.log("Tables before:", before.join(", ") || "(none)");

    // The file carries its own BEGIN/COMMIT and takes an advisory lock, so if
    // another worktree is mid-migration this blocks rather than racing.
    await pool.query(fs.readFileSync(MIGRATION, "utf8"));
    console.log("Migration    : applied and committed");

    const after = await listTables();
    const added = after.filter((t) => !before.includes(t));
    const removed = before.filter((t) => !after.includes(t));
    console.log("Added        :", added.join(", ") || "(none)");
    console.log("Removed      :", removed.join(", ") || "(none)");

    /**
     * Seed an EMPTY table; leave a non-empty one alone.
     *
     * Two earlier rules each failed a real case:
     *
     * - "Seed every run, ON CONFLICT DO NOTHING" protected a notice staff had
     *   edited but not one they had DELETED — a deleted row has no conflict to
     *   collide with — so a re-run put it straight back, pinned, through `pg`,
     *   with no audit entry.
     * - "Seed only when this run created the table" broke the launch instead.
     *   The migration's own header names `prisma db execute --file` as a way to
     *   apply it; applied that way, or by `db:push`, the table already exists
     *   when this script runs, so it seeded nothing — and once the table exists
     *   production stops falling back to the fixture, so every public feed
     *   would have been empty from day one.
     *
     * "Empty" is the honest test for "has anyone put content here yet".
     *
     * ceiling: if staff delete EVERY notice and someone then re-runs this, the
     * four launch notices return. Far rarer than the launch path above, and
     * visible — this prints what it did. The upgrade, if it is ever hit, is a
     * marker that records "seeded once" (a one-row table, or a column on an
     * existing settings row) checked instead of emptiness.
     *
     * One transaction, under the same advisory lock as the migration file: the
     * emptiness check and the inserts cannot be split by a concurrent run, and
     * a failure partway rolls the seed back instead of leaving a half-seeded
     * table that the next run would then refuse to touch.
     */
    const client = await pool.connect();
    let inserted = 0;
    let skippedWith: number | null = null;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(4210771001)");
      const existing = await client.query('select count(*)::int n from "bulletins"');
      if (existing.rows[0].n > 0) {
        skippedWith = existing.rows[0].n;
      } else {
        for (const bulletin of bulletinsData) {
          const res = await client.query(
            `INSERT INTO "bulletins"
               ("id","category","targetPage","title","content","titleMs","contentMs",
                "mediaType","mediaUrl","videoEmbedUrl","isPinned","isPublished",
                "authorName","publishedAt","updatedAt")
             VALUES ($1, $2::"BulletinCategory", $3::"BulletinTargetPage", $4, $5, $6, $7,
                     $8::"BulletinMediaType", $9, $10, $11, $12, $13, $14::date, NOW())`,
            [
              bulletin.id,
              bulletin.category,
              bulletin.targetPage,
              bulletin.title,
              bulletin.content,
              bulletin.titleMs,
              bulletin.contentMs,
              bulletin.mediaType,
              bulletin.mediaUrl,
              bulletin.videoEmbedUrl,
              bulletin.isPinned,
              bulletin.isPublished,
              bulletin.authorName,
              bulletin.publishedAt,
            ]
          );
          inserted += res.rowCount ?? 0;
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      // ROLLBACK on a connection that has just dropped throws too, and if it
      // escaped it would replace the real failure with "Connection terminated".
      let rollbackFailed = false;
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        rollbackFailed = true;
        console.error("Seed ROLLBACK also failed (the seed error follows):", rollbackErr);
      }
      // Destroy the client only if ROLLBACK failed — that is the case where the
      // connection's state is unknown. A rolled-back client is healthy.
      client.release(rollbackFailed);
      throw err;
    }
    client.release();

    if (skippedWith !== null) {
      console.log(
        `Seeded       : skipped — "bulletins" already holds ${skippedWith} rows, which ` +
          "are staff content. The launch notices go into an empty table only."
      );
      return;
    }

    const counts = await pool.query(
      'select category, count(*)::int n from "bulletins" group by category order by category'
    );
    const total = await pool.query('select count(*)::int n from "bulletins"');
    console.log(
      `Seeded       : ${inserted} launch notices into an empty table, ` +
        `${total.rows[0].n} rows total`
    );
    for (const row of counts.rows as { category: string; n: number }[]) {
      console.log(`  ${row.category.padEnd(14)} ${row.n}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Bulletin migration failed:", e);
  process.exit(1);
});
