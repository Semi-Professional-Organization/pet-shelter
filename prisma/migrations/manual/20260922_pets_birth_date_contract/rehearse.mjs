/**
 * Rehearses the CONTRACT half beside this file, plus ../20260922_settings_and_defaults/.
 *
 *     npx tsx prisma/migrations/manual/20260922_pets_birth_date_contract/rehearse.mjs
 *
 * Runs entirely in memory: pglite is PostgreSQL 17 compiled to WASM, so this starts no server,
 * opens no port, reads no .env and cannot reach production. It resolves out of the repo's
 * node_modules as a transitive dependency rather than a declared one.
 *
 * **What this deliberately does NOT assert.** The contract half derives nothing. Turning "2 years"
 * into a date belongs to the expand half (../20260922_pets_birth_date/), which owns that rule
 * alone — an earlier revision of this folder carried a second copy, and the two disagreed on
 * month-end and leap-day rows. So there is no date arithmetic to check here, and no reason to
 * import approximateBirthDate. What this file checks instead is that the contract refuses every
 * state in which dropping the columns would destroy something, and preserves everything in the
 * one state where it proceeds.
 *
 * If the expand migration is present in the tree, scenario 0 runs the real thing and then the
 * contract on top of it, which is the sequence an operator will actually perform. When it is not
 * present — it lives on its own branch until that merges — the post-expand SHAPE is built here
 * directly and the run says so. The contract's correctness does not depend on expand's
 * arithmetic; that independence is the point of the split, and it is what lets this harness be
 * honest about the gap rather than vendoring a copy of the other file.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const require = createRequire(join(REPO, "package.json"));
const { PGlite } = require("@electric-sql/pglite");

const MIG = readFileSync(join(HERE, "migration.sql"), "utf8");
const ROLL = readFileSync(join(HERE, "rollback.sql"), "utf8");
const CLEAN = readFileSync(join(HERE, "cleanup.sql"), "utf8");
const SET_DIR = join(HERE, "..", "20260922_settings_and_defaults");
const SET_MIG = readFileSync(join(SET_DIR, "migration.sql"), "utf8");
const SET_ROLL = readFileSync(join(SET_DIR, "rollback.sql"), "utf8");

const EXPAND_PATH = join(HERE, "..", "20260922_pets_birth_date", "migration.sql");
const HAS_EXPAND = existsSync(EXPAND_PATH);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
};

const PROD_SCHEMA = `
CREATE TYPE "public"."PetStatus" AS ENUM ('Available','Pending','Adopted','In Rehabilitation');
CREATE TABLE "public"."pets" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "species" TEXT NOT NULL, "breed" TEXT NOT NULL,
  "age" TEXT NOT NULL, "ageCategory" TEXT NOT NULL, "gender" TEXT NOT NULL, "size" TEXT NOT NULL,
  "weight" TEXT NOT NULL, "status" "public"."PetStatus" NOT NULL DEFAULT 'Available',
  "adoptionFee" TEXT NOT NULL, "description" TEXT NOT NULL, "rescueStory" TEXT NOT NULL,
  "image" TEXT NOT NULL, "galleryImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "featured" BOOLEAN NOT NULL DEFAULT false,
  "intakeDate" TEXT NOT NULL, "vaccinated" BOOLEAN NOT NULL DEFAULT true,
  "microchipped" BOOLEAN NOT NULL DEFAULT true, "spayedNeutered" BOOLEAN NOT NULL DEFAULT true,
  "specialNeeds" TEXT, "customQrUrl" TEXT, "rehabStage" TEXT, "rehabStageMs" TEXT,
  "rehabProgressPercent" INTEGER, "goodWithDogs" BOOLEAN NOT NULL DEFAULT true,
  "goodWithCats" BOOLEAN NOT NULL DEFAULT true, "goodWithKids" BOOLEAN NOT NULL DEFAULT true,
  "energyLevel" TEXT NOT NULL DEFAULT 'Moderate', "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "sponsorshipGoalSen" INTEGER
);
CREATE INDEX "pets_species_status_isArchived_idx" ON "public"."pets" ("species","status","isArchived");
CREATE TABLE "public"."shelter_settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'default-settings',
  "shelterName" TEXT NOT NULL DEFAULT 'Hope for Strays',
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "public"."notification_preferences" (
  "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL,
  "photoUpdates" BOOLEAN NOT NULL DEFAULT true, "newsletter" BOOLEAN NOT NULL DEFAULT true,
  "unsubscribedAllAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// age/ageCategory as production has them, plus the birth date a soak would have produced.
const ROWS = [
  ["p-plain", "2 years", "adult", "2026-06-12", "2024-06-12", true],
  ["p-leap", "1 year", "young", "2024-02-29", "2023-02-28", true],
  ["p-monthend", "1 month", "puppy_kitten", "2026-03-31", "2026-02-28", true],
  ["p-known", "3 years", "adult", "2023-01-10", "2020-01-10", false], // a birthday someone knew
  ["p-prose", "about two", "adult", "2026-06-12", "2026-06-12", true],
];

const insertPreExpand = async (db, [id, age, band, intake]) =>
  db.query(
    `INSERT INTO "public"."pets" ("id","name","species","breed","age","ageCategory","gender","size",
      "weight","adoptionFee","description","rescueStory","image","intakeDate","updatedAt")
     VALUES ($1,'n','dog','b',$2,$3,'Male','Small','1kg','Free','d','r','i',$4,CURRENT_TIMESTAMP)`,
    [id, age, band, intake]
  );

const cols = async (db, table) =>
  (await db.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`,
    [table]
  )).rows;
const byName = (cs) => new Map(cs.map((c) => [c.column_name, c]));

async function freshPreExpand(rows = ROWS) {
  const db = new PGlite();
  await db.exec(PROD_SCHEMA);
  for (const r of rows) await insertPreExpand(db, r);
  return db;
}

/**
 * The rows the real expand will accept.
 *
 * `p-prose` carries `age = 'about two'`, which expand **refuses** rather than guessing at — its
 * author's rule is "refusing more is safe, storing differently is not", so a row it cannot read is
 * never backfilled and the contract never sees one. Scenario 0 therefore seeds without it; the
 * contract-shape scenarios keep it, because there the birth date is supplied directly and the
 * contract does not care how it was arrived at. Discovered by running the real expand here, which
 * is the whole reason scenario 0 exists.
 */
const EXPANDABLE_ROWS = ROWS.filter(([id]) => id !== "p-prose");

/** The shape expand leaves behind: both columns present, backfilled, and `age` relaxed. */
async function applyExpandShape(db) {
  await db.exec(
    `ALTER TABLE "public"."pets"
       ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01',
       ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true;`
  );
  for (const [id, , , , birth, est] of ROWS) {
    await db.query(`UPDATE "public"."pets" SET "birthDate"=$2, "birthDateIsEstimate"=$3 WHERE "id"=$1`, [
      id,
      birth,
      est,
    ]);
  }
  await db.exec(
    `ALTER TABLE "public"."pets" ALTER COLUMN "age" DROP NOT NULL;
     ALTER TABLE "public"."pets" ALTER COLUMN "ageCategory" DROP NOT NULL;`
  );
}

const tryExec = async (db, sql) => {
  try {
    await db.exec(sql);
    return "";
  } catch (err) {
    // HINT and DETAIL are separate fields on a Postgres error, not part of `message`. The hints
    // in these files carry the remediation, so a check that only read `message` could not tell
    // whether the operator is actually told what to do next.
    const msg = [err?.message, err?.hint, err?.detail].filter(Boolean).join(" | ") || String(err);
    await db.exec("ROLLBACK").catch(() => {});
    return msg;
  }
};

console.log(
  HAS_EXPAND
    ? "\n== 0. the real expand migration is present; running the true sequence"
    : "\n== 0. NOTE: ../20260922_pets_birth_date/migration.sql is not in this tree (it lives on its\n        own branch until that merges), so the post-expand SHAPE is built here instead. The\n        contract derives nothing, so its behaviour does not depend on expand's arithmetic."
);
if (HAS_EXPAND) {
  const EXPAND = readFileSync(EXPAND_PATH, "utf8");

  const seq = await freshPreExpand(EXPANDABLE_ROWS);
  const expandErr = await tryExec(seq, EXPAND);
  check("the real expand applies", expandErr === "", expandErr.slice(0, 200));
  if (!expandErr) {
    const c = byName(await cols(seq, "pets"));
    check("expand leaves age nullable, which is the signal the contract reads", c.get("age")?.is_nullable === "YES");
    const derived = new Map(
      (await seq.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((r) => [r.id, r.birthDate])
    );
    const contractErr = await tryExec(seq, MIG);
    check("the contract then applies on top of it", contractErr === "", contractErr.slice(0, 200));
    const after = byName(await cols(seq, "pets"));
    check("and the old columns are gone", !after.has("age") && !after.has("ageCategory"));
    const arch = await seq.query(
      `SELECT "id","age","derivedBirthDate" FROM "public"."pets_age_archive_20260922"`
    );
    check(
      "the archive holds expand's own dates, unaltered",
      arch.rows.length === EXPANDABLE_ROWS.length &&
        arch.rows.every((a) => a.derivedBirthDate === derived.get(a.id)),
      `${arch.rows.length} rows`
    );
    check(
      "and the prose expand read is preserved for the rollback",
      arch.rows.every((a) => typeof a.age === "string" && a.age.length > 0)
    );
  }
  await seq.close();

  // Expand's own rollback, exercised here because this branch merges it and its undo had not been
  // run from this side. Expand's harness needs `embedded-postgres`, a large optional download;
  // pglite runs the same SQL. This is a courtesy check of a neighbour's file, not a substitute for
  // its own 92-check harness.
  const undo = await freshPreExpand(EXPANDABLE_ROWS);
  await undo.exec(EXPAND);
  const undoErr = await tryExec(undo, readFileSync(join(HERE, "..", "20260922_pets_birth_date", "rollback.sql"), "utf8"));
  check("expand's own rollback applies", undoErr === "", undoErr.slice(0, 200));
  if (!undoErr) {
    const u = byName(await cols(undo, "pets"));
    check("  ...removing birthDate", !u.has("birthDate") && !u.has("birthDateIsEstimate"));
    check("  ...and re-tightening age to NOT NULL", u.get("age")?.is_nullable === "NO");
    check(
      "  ...with every age string still intact",
      (await undo.query(`SELECT count(*)::int AS n FROM "public"."pets" WHERE "age" IS NOT NULL`)).rows[0].n ===
        EXPANDABLE_ROWS.length
    );
  }
  await undo.close();

  // The other half of expand's contract, asserted here because the contract half depends on it:
  // a row expand cannot read is refused outright, so no unparseable prose ever reaches the drop.
  const refused = await freshPreExpand();
  const refusedErr = await tryExec(refused, EXPAND);
  check(
    "expand refuses prose it cannot read, rather than guessing",
    /cannot be derived/.test(refusedErr) && /p-prose/.test(refusedErr),
    refusedErr.slice(0, 160)
  );
  check(
    "  ...leaving the table untouched, so the contract never sees such a row",
    !byName(await cols(refused, "pets")).has("birthDate")
  );
  await refused.close();
}

console.log("\n== 1. the contract refuses every state where dropping would destroy something");

const noBirth = await freshPreExpand();
let err = await tryExec(noBirth, MIG);
check("refuses when birthDate does not exist", /has no "birthDate" column/.test(err), err.slice(0, 160));
check("  ...and names the expand migration in the hint", /20260922_pets_birth_date\/migration\.sql/.test(err));
check("  ...leaving age in place", byName(await cols(noBirth, "pets")).has("age"));
await noBirth.close();

// The hand-patch: db push's own ADD COLUMN with the drops left off. age stays NOT NULL.
const patched = await freshPreExpand();
await patched.exec(
  `ALTER TABLE "public"."pets"
     ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01',
     ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true;`
);
err = await tryExec(patched, MIG);
check('refuses a hand-patched column ("age" still NOT NULL)', /still NOT NULL/.test(err), err.slice(0, 160));
check(
  "  ...and the hint says how to recover rather than just refusing",
  /expand migration to derive the dates properly/.test(err),
  err.slice(0, 200)
);
check("  ...leaving age in place", byName(await cols(patched, "pets")).has("age"));
check(
  "  ...and every row still on the placeholder, unarchived",
  (await patched.query(`SELECT count(*)::int AS n FROM "public"."pets" WHERE "birthDate"='2024-01-01'`)).rows[0].n ===
    ROWS.length
);
await patched.close();

const nullBirth = await freshPreExpand();
await applyExpandShape(nullBirth);
await nullBirth.exec(`ALTER TABLE "public"."pets" ALTER COLUMN "birthDate" DROP NOT NULL;`);
await nullBirth.exec(`UPDATE "public"."pets" SET "birthDate" = NULL WHERE "id" = 'p-plain';`);
err = await tryExec(nullBirth, MIG);
check("refuses when any row has no birthDate", /have no birthDate/.test(err), err.slice(0, 160));
check("  ...leaving age in place", byName(await cols(nullBirth, "pets")).has("age"));
await nullBirth.close();

console.log("\n== 2. after expand, it archives everything and drops");

const db = await freshPreExpand();
await applyExpandShape(db);
const before = new Map(
  (await db.query(`SELECT "id","age","ageCategory","birthDate","birthDateIsEstimate" FROM "public"."pets"`)).rows.map(
    (r) => [r.id, r]
  )
);
err = await tryExec(db, MIG);
check("the contract applies", err === "", err.slice(0, 200));
let pc = byName(await cols(db, "pets"));
check("pets.age dropped", !pc.has("age"));
check("pets.ageCategory dropped", !pc.has("ageCategory"));
check("pets.birthDate untouched", pc.has("birthDate") && pc.has("birthDateIsEstimate"));

const archive = await db.query(`SELECT * FROM "public"."pets_age_archive_20260922"`);
check(`archive holds all ${ROWS.length} rows`, archive.rows.length === ROWS.length, String(archive.rows.length));
check(
  "archive preserved age and ageCategory verbatim",
  archive.rows.every((a) => a.age === before.get(a.id).age && a.ageCategory === before.get(a.id).ageCategory)
);
check(
  "archive preserved the birth date and its estimate flag",
  archive.rows.every(
    (a) =>
      a.derivedBirthDate === before.get(a.id).birthDate &&
      a.derivedIsEstimate === before.get(a.id).birthDateIsEstimate
  )
);
check(
  "a known birthday is recorded as known, not as an estimate",
  archive.rows.find((a) => a.id === "p-known")?.derivedIsEstimate === false
);

console.log("\n== 3. re-running is a no-op");
err = await tryExec(db, MIG);
check("second run does not error", err === "", err.slice(0, 160));
check(
  "and the archive did not grow",
  (await db.query(`SELECT count(*)::int AS n FROM "public"."pets_age_archive_20260922"`)).rows[0].n === ROWS.length
);

console.log("\n== 4. rollback restores the columns and leaves birthDate alone");
await db.query(
  `INSERT INTO "public"."pets" ("id","name","species","breed","birthDate","birthDateIsEstimate","gender","size",
     "weight","adoptionFee","description","rescueStory","image","intakeDate","updatedAt")
   VALUES ('p-after','n','dog','b','2025-05-05',false,'Male','Small','1kg','Free','d','r','i','2026-09-20',CURRENT_TIMESTAMP)`
);
err = await tryExec(db, ROLL);
check("rollback applies", err === "", err.slice(0, 200));
pc = byName(await cols(db, "pets"));
check("age is back", pc.has("age"));
check("age is back NULLABLE, matching the state expand left", pc.get("age")?.is_nullable === "YES");
check("birthDate was NOT dropped", pc.has("birthDate"));
const restored = await db.query(`SELECT "id","age","ageCategory","birthDate" FROM "public"."pets"`);
check(
  "every archived age and band came back verbatim",
  restored.rows
    .filter((r) => r.id !== "p-after")
    .every((r) => r.age === before.get(r.id).age && r.ageCategory === before.get(r.id).ageCategory)
);
const afterRow = restored.rows.find((r) => r.id === "p-after");
check(
  "an animal created after the contract gets NULL prose, not an invented one",
  afterRow.age === null && afterRow.ageCategory === null,
  `${afterRow.age} / ${afterRow.ageCategory}`
);
check("and keeps its own birth date", afterRow.birthDate === "2025-05-05");

console.log("\n== 5. the contract applies again after a rollback");
err = await tryExec(db, MIG);
check("re-applies cleanly", err === "", err.slice(0, 200));
check("age dropped again", !byName(await cols(db, "pets")).has("age"));

console.log("\n== 6. cleanup, then rollback refuses rather than inventing");
await db.exec(CLEAN);
check(
  "cleanup dropped the archive",
  (await db.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_name='pets_age_archive_20260922'`
  )).rows[0].n === 0
);
err = await tryExec(db, ROLL);
check("rollback aborts once the archive is gone", /refusing to invent them/.test(err), err.slice(0, 160));
check("and birthDate is still there", byName(await cols(db, "pets")).has("birthDate"));

console.log("\n== 7. settings and defaults");
const settingsBefore = JSON.stringify(await cols(db, "shelter_settings"));
await db.exec(SET_MIG);
const sc = byName(await cols(db, "shelter_settings"));
check(
  "all seven shelter_settings columns added",
  ["resendApiKey", "emailFrom", "storageProvider", "s3Bucket", "s3Region", "s3Endpoint", "cloudinaryCloudName"].every(
    (c) => sc.has(c)
  )
);
check(
  "notification_preferences.updatedAt default dropped",
  (await db.query(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='notification_preferences' AND column_name='updatedAt'`
  )).rows[0].column_default === null
);
const afterFirst = JSON.stringify(await cols(db, "shelter_settings"));
await db.exec(SET_MIG);
check("re-runs as a no-op", JSON.stringify(await cols(db, "shelter_settings")) === afterFirst);
await db.exec(SET_ROLL);
check("rollback removes the columns", JSON.stringify(await cols(db, "shelter_settings")) === settingsBefore);
check(
  "rollback restores the updatedAt default",
  String(
    (await db.query(
      `SELECT column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notification_preferences' AND column_name='updatedAt'`
    )).rows[0].column_default ?? ""
  )
    .toUpperCase()
    .includes("CURRENT_TIMESTAMP")
);
await db.exec(SET_MIG);
check("applies again after rollback", JSON.stringify(await cols(db, "shelter_settings")) === afterFirst);
await db.close();

console.log(`\n=== ${pass} passed, ${fail} failed${HAS_EXPAND ? "" : " (expand not in tree; scenario 0 skipped)"}`);
process.exit(fail === 0 ? 0 : 1);
