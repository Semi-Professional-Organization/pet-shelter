/**
 * Applies the community bulletin migration and seeds `src/data/bulletins.json` into it.
 *
 * **Re-running it never overwrites an existing notice.** Rows are inserted with
 * `ON CONFLICT DO NOTHING`, so staff edits made through /admin/bulletins survive
 * a second run. See the comment on the INSERT for why that matters more here
 * than in the seed.
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

import { resolveDatabaseUrl, LOCAL_DATABASE_URL } from "../prisma/env";
import { resolveDatabaseSsl } from "../src/lib/server/databaseSsl";
import bulletinsData from "../src/data/bulletins.json";

const MIGRATION = "prisma/migrations/manual/20260922_community_bulletins/migration.sql";

async function main() {
  const connectionString = resolveDatabaseUrl();
  const sslPolicy = resolveDatabaseSsl(connectionString);

  console.log(
    "Target:",
    connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@"),
    connectionString === LOCAL_DATABASE_URL ? "(local)" : "(remote)"
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

    let inserted = 0;
    for (const bulletin of bulletinsData) {
      /**
       * `DO NOTHING`, not `DO UPDATE`.
       *
       * This script can be pointed at a hosted branch — that is the whole
       * reason it exists apart from `prisma/seed.ts`, which refuses anything
       * but localhost. So a row it meets again is a row staff may have edited
       * through /admin/bulletins since it was seeded. An upsert would snap the
       * title, body, image and notice date back to the committed fixture with
       * no warning, no audit entry and no way to tell it had happened, because
       * this writes through `pg` rather than through the repository.
       *
       * The fixture is launch content. Once a notice exists, the editor owns
       * it. Correcting seeded copy is an edit in the admin screen, not a
       * re-run of this script — and if the fixture really must be reimposed,
       * that is a deliberate `DELETE` first, typed out by a human who has read
       * this paragraph.
       */
      const res = await pool.query(
        `INSERT INTO "bulletins"
           ("id","category","targetPage","title","content","titleMs","contentMs",
            "mediaType","mediaUrl","videoEmbedUrl","isPinned","isPublished",
            "authorName","publishedAt","updatedAt")
         VALUES ($1, $2::"BulletinCategory", $3::"BulletinTargetPage", $4, $5, $6, $7,
                 $8::"BulletinMediaType", $9, $10, $11, $12, $13, $14::date, NOW())
         ON CONFLICT ("id") DO NOTHING`,
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

    const counts = await pool.query(
      'select category, count(*)::int n from "bulletins" group by category order by category'
    );
    const total = await pool.query('select count(*)::int n from "bulletins"');
    console.log(
      `Seeded       : ${inserted} new of ${bulletinsData.length} fixture notices, ` +
        `${total.rows[0].n} rows total ` +
        `(${bulletinsData.length - inserted} already present and left untouched)`
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
