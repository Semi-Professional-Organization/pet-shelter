/**
 * Applies the FAQ migration and seeds `src/data/faqs.json` into it.
 *
 * Separate from `prisma/seed.ts` for two reasons. That script is refused
 * against anything but a local database (`assertSeedTargetIsLocal`), because it
 * is not additive — it deletes and rewrites pets, applications and staff users
 * from fixtures. This one only ever touches the `faqs` table, so it is safe to
 * point at a hosted branch, which is what makes the FAQ page's content
 * deployable without a full reseed.
 *
 * `DATABASE_URL` is resolved through `prisma/env.ts`, the single resolver every
 * database-touching script shares, so this cannot end up talking to a different
 * database than `db:push` or `db:check-drift`.
 *
 * Prints the table list before and after so the blast radius is visible.
 */
import fs from "node:fs";
import { Pool } from "pg";

import { resolveDatabaseUrl, isLocalDatabaseUrl } from "../prisma/env";
import { resolveDatabaseSsl } from "../src/lib/server/databaseSsl";
import faqsData from "../src/data/faqs.json";

const MIGRATION = "prisma/migrations/manual/20260903_faq_knowledge_base/migration.sql";

async function main() {
  const connectionString = resolveDatabaseUrl();
  // The app's policy, not a copy of the old sniff. This script exists to reach a hosted
  // branch, and the sniff left a Neon URL without `sslmode` unverified and a non-Neon host
  // without it in plaintext; with `sslmode=require` it verified only because `pg` currently
  // reads `require` as `verify-full`, which it warns will change.
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

    for (const faq of faqsData) {
      await pool.query(
        `INSERT INTO "faqs"
           ("id","category","question","answer","questionMs","answerMs","displayOrder","isPublished","updatedAt")
         VALUES ($1, $2::"FaqCategory", $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT ("id") DO UPDATE SET
           "category"     = EXCLUDED."category",
           "question"     = EXCLUDED."question",
           "answer"       = EXCLUDED."answer",
           "questionMs"   = EXCLUDED."questionMs",
           "answerMs"     = EXCLUDED."answerMs",
           "displayOrder" = EXCLUDED."displayOrder",
           "updatedAt"    = NOW()`,
        [
          faq.id,
          faq.category,
          faq.question,
          faq.answer,
          faq.questionMs,
          faq.answerMs,
          faq.displayOrder,
          faq.isPublished,
        ]
      );
    }

    const counts = await pool.query(
      'select category, count(*)::int n from "faqs" group by category order by category'
    );
    const total = await pool.query('select count(*)::int n from "faqs"');
    console.log(`Seeded       : ${faqsData.length} entries, ${total.rows[0].n} rows total`);
    for (const row of counts.rows as { category: string; n: number }[]) {
      console.log(`  ${row.category.padEnd(14)} ${row.n}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAQ migration failed:", e);
  process.exit(1);
});
