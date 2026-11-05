/**
 * Rehearses every file beside this one against the real schemas, in memory.
 *
 *     node prisma/migrations/manual/20261105_drop_receipt_tax_columns/rehearse.mjs
 *
 * pglite is PostgreSQL compiled to WASM: no server, no port, no .env, no way to reach
 * production. The "before" database is built from `prisma migrate diff` of the schema on
 * `origin/main`'s merge base, and the "after" shape is the same diff of the schema in this
 * tree, so the check is against what Prisma itself would create, not a hand-copied table.
 * The append-only trigger production runs (`prisma/sql/donation_append_only.sql`) is
 * installed too, because expand-rollback.sql has to work around it.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const require = createRequire(join(REPO, "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const prismaCli = require.resolve("prisma/build/index.js");

const read = (f) => readFileSync(join(HERE, f), "utf8");
const [PRE, EXPAND, EXPAND_RB, CONTRACT, ROLLBACK] = [
  "precheck.sql", "expand.sql", "expand-rollback.sql", "migration.sql", "rollback.sql",
].map(read);
const TRIGGER = readFileSync(join(REPO, "prisma", "sql", "donation_append_only.sql"), "utf8");

// The schema before this change, pinned to the commit #251 branched from (#253's squash on
// main), so the rehearsal still means something after this PR merges. A shallow clone without
// it can fetch it: `git fetch --depth=1 origin cc3ca6e`.
const base = "cc3ca6e";
const scratch = mkdtempSync(join(tmpdir(), "rehearse-251-"));
const oldSchema = join(scratch, "schema.prisma");
writeFileSync(oldSchema, execFileSync("git", ["show", `${base}:prisma/schema.prisma`], { cwd: REPO }));

const ddl = (schema) =>
  execFileSync(process.execPath, [prismaCli, "migrate", "diff", "--from-empty", "--to-schema", schema, "--script"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    // prisma.config.ts loads dotenv, which prints its banner to stdout. No database is
    // contacted: --from-empty --to-schema diffs two datamodels.
    .split("\n")
    // ceiling: two known banner shapes. A new one shows up as a SQL syntax error naming it.
    .filter((line) => !line.startsWith("◇") && !line.startsWith("Loaded Prisma config"))
    .join("\n");
const OLD_DDL = ddl(oldSchema);
const NEW_DDL = ddl(join(REPO, "prisma", "schema.prisma"));
rmSync(scratch, { recursive: true, force: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? (pass += 1) : (fail += 1);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` -- ${detail}` : ""}`);
};
// A file that raises leaves the session inside its aborted BEGIN, as the Neon editor
// would; roll it back so the next statement in this harness runs.
const rejects = async (db, fn) => {
  try { await fn(); return null; } catch (e) { await db.exec("ROLLBACK"); return e.message; }
};

const TABLES = ["donations", "donation_pledges", "pet_sponsorships"];
const shape = async (db) =>
  (await db.query(
    `SELECT table_name, column_name, is_nullable, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name = ANY($1) ORDER BY 1, 2`, [TABLES]
  )).rows.map((r) => `${r.table_name}.${r.column_name} ${r.data_type} ${r.is_nullable}`);

async function fresh() {
  const db = new PGlite();
  await db.exec(OLD_DDL);
  await db.exec(TRIGGER);
  return db;
}

// Inserts as the code on main writes a reconciled row since #253: '' snapshots, no NRIC.
const insertOld = (db, n, extra = {}) =>
  db.query(
    `INSERT INTO donations ("id","receiptNumber","sequenceScope","sequenceValue","donorName",
       "donorEmail","tierId","tierName","amountSen","paymentMethod","taxDeductibleRef",
       "shelterRegistrationNo","taxIdOrIc")
     VALUES ($1,$1,'S',$2,'d','e','t','t',100,'duitnow_qr',$3,$4,$5)`,
    [`r${n}`, n, extra.ref ?? "", extra.ros ?? "", extra.nric ?? null]
  );
// Inserts as this PR's code does: the issuer columns are not named at all.
const insertNew = (db, n) =>
  db.query(
    `INSERT INTO donations ("id","receiptNumber","sequenceScope","sequenceValue","donorName",
       "donorEmail","tierId","tierName","amountSen","paymentMethod")
     VALUES ($1,$1,'S',$2,'d','e','t','t',100,'duitnow_qr')`,
    [`r${n}`, n]
  );

const after = new PGlite();
await after.exec(NEW_DDL);
const TARGET = await shape(after);

console.log("happy path: precheck -> expand -> new code -> contract");
{
  const db = await fresh();
  await insertOld(db, 1);
  const pre = (await db.query(PRE.replace(/^--.*$/gm, ""))).rows[0];
  check("precheck runs and reports no tax snapshot", Number(pre.donations_with_tax_snapshot) === 0);
  check("the old schema refuses the new code's insert (why expand exists)", (await rejects(db, () => insertNew(db, 2))) !== null);
  await db.exec(EXPAND);
  check("expand is safe to run twice", (await rejects(db, () => db.exec(EXPAND))) === null);
  check("after expand the new code can insert", (await rejects(db, () => insertNew(db, 2))) === null);
  check("after expand the old code can still insert", (await rejects(db, () => insertOld(db, 3))) === null);
  await db.exec(CONTRACT);
  check("contract leaves exactly the new schema's columns", JSON.stringify(await shape(db)) === JSON.stringify(TARGET),
    JSON.stringify((await shape(db)).filter((c) => !TARGET.includes(c))));
  check("contract keeps every acknowledgement row", Number((await db.query("SELECT count(*) n FROM donations")).rows[0].n) === 3);
  check("contract is safe to run twice", (await rejects(db, () => db.exec(CONTRACT))) === null);
  check("the new code inserts after contract", (await rejects(db, () => insertNew(db, 4))) === null);

  await db.exec(ROLLBACK);
  check("rollback is safe to run twice", (await rejects(db, () => db.exec(ROLLBACK))) === null);
  check("after rollback the old code can insert again", (await rejects(db, () => insertOld(db, 5))) === null);
  check("after rollback the new code can insert too", (await rejects(db, () => insertNew(db, 6))) === null);
  await db.exec(EXPAND_RB);
  const strict = (await shape(db)).filter((c) => /taxDeductibleRef|shelterRegistrationNo/.test(c));
  check("expand-rollback restores NOT NULL over rows the new code wrote", strict.every((c) => c.endsWith(" NO")), strict.join(", "));
  check("the append-only trigger is back on after expand-rollback",
    (await rejects(db, () => db.exec(`DELETE FROM donations WHERE id='r1'`)))?.includes("append-only") === true);
}

console.log("refusals");
{
  const db = await fresh();
  check("contract refuses before expand", (await rejects(db, () => db.exec(CONTRACT))) ?.includes("expand.sql has not run") === true);
  check("and dropped nothing", (await shape(db)).some((c) => c.startsWith("donations.taxIdOrIc")));
}
for (const [label, extra] of [["an LHDN reference", { ref: "LHDN.01/35" }], ["a ROS number", { ros: "PPM-001" }], ["an NRIC", { nric: "880101-14-5523" }]]) {
  const db = await fresh();
  await insertOld(db, 1, extra);
  await db.exec(EXPAND);
  const pre = (await db.query(PRE.replace(/^--.*$/gm, ""))).rows[0];
  check(`precheck counts a row carrying ${label}`, Number(pre.donations_with_tax_snapshot) === 1);
  check(`contract refuses a row carrying ${label}`, (await rejects(db, () => db.exec(CONTRACT)))?.includes("tax receipt was issued") === true);
  check(`and dropped nothing (${label})`, (await shape(db)).some((c) => c.startsWith("donations.taxDeductibleRef")));
}
{
  const db = await fresh();
  await db.exec(EXPAND);
  await db.query(`INSERT INTO donation_pledges ("id","donorName","donorEmail","tierId","tierName","amountSen","paymentMethod","pledgeRef","updatedAt","taxIdOrIc")
                  VALUES ('g1','d','e','t','t',100,'duitnow_qr','HFS-GFT-1',now(),'880101-14-5523')`);
  check("a pending gift's NRIC does not block the drop", (await rejects(db, () => db.exec(CONTRACT))) === null);
  check("and is gone afterwards", !(await shape(db)).some((c) => c.startsWith("donation_pledges.taxIdOrIc")));
}

console.log("edges");
{
  // CI and fresh Neon branches have no append-only trigger.
  const db = new PGlite();
  await db.exec(OLD_DDL);
  await db.exec(EXPAND);
  await insertNew(db, 1);
  check("expand-rollback works without the append-only trigger", (await rejects(db, () => db.exec(EXPAND_RB))) === null);
  check("and back-fills the new code's NULLs", (await db.query(`SELECT "taxDeductibleRef" v FROM donations`)).rows[0].v === "");
}
{
  // One column already gone by hand must not skip the check on the others.
  const db = await fresh();
  await insertOld(db, 1, { nric: "880101-14-5523" });
  await db.exec(EXPAND);
  await db.exec(`ALTER TABLE donations DROP COLUMN "taxDeductibleRef"`);
  check("contract still refuses an NRIC when taxDeductibleRef is already gone",
    (await rejects(db, () => db.exec(CONTRACT)))?.includes("tax receipt was issued") === true);
}
{
  const db = await fresh();
  await db.query(`INSERT INTO audit_logs ("id","action","actorEmail","actorRole","targetEntity","details","metadata")
                  VALUES ('a1','DONATION_RECEIVED','x','DONOR','DonationReceipt','{}', '{"taxIdOrIc":"891101-14-1122"}'),
                         ('a2','DONATION_RECEIVED','x','DONOR','DonationReceipt','{"taxIdOrIc":""}', NULL),
                         ('a3','DONATION_RECEIVED','x','DONOR','DonationReceipt','{"donorName":"y"}', NULL)`);
  const pre = (await db.query(PRE.replace(/^--.*$/gm, ""))).rows[0];
  check("precheck counts an audit row naming an NRIC, and only that one", Number(pre.audit_rows_with_nric) === 1, String(pre.audit_rows_with_nric));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
