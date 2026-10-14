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
 * month-end and leap-day rows. So the CONTRACT has no date arithmetic to check. What this file
 * checks about the contract is that it refuses every state in which dropping the columns would
 * destroy something, and preserves everything in the one state where it proceeds.
 *
 * It does import approximateBirthDate — once, in scenario 0, and only to check EXPAND. Expand's
 * own harness compares its SQL against a hand copy of the function that has since drifted from
 * the original on both timezone and vocabulary, and its fixture-based guard is too narrow to
 * notice. This file already runs the real expand SQL under tsx, so it is the one place the real
 * function and the real SQL can be compared directly, with no copy in between.
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
  // The marker expand stamps on the column it creates, and the contract's discriminator. A shape
  // that omitted it would be the hand-patch state, not the post-expand one — which is the whole
  // distinction this harness has to keep straight.
  await db.exec(
    `COMMENT ON COLUMN "public"."pets"."birthDate" IS 'added by 20260922_pets_birth_date';`
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

  // The destructive path `/code-review max` found on 2026-10-14, pinned so it cannot return.
  //
  // Expand, contract, then expand's rollback — which the contract's own rollback header used to
  // send the operator to — dropped `birthDate` while `age` was already archived and gone, leaving
  // `pets` with no age information of any kind, no NOTICE, no row named, and expand unable to
  // re-apply. Expand's rollback now refuses that state and names the contract's rollback as the
  // thing to run first.
  const postContract = await freshPreExpand(EXPANDABLE_ROWS);
  await postContract.exec(EXPAND);
  await postContract.exec(MIG);
  const undoAfterContract = await tryExec(
    postContract,
    readFileSync(join(HERE, "..", "20260922_pets_birth_date", "rollback.sql"), "utf8")
  );
  check(
    "expand's rollback refuses once the contract has archived and dropped `age`",
    /already run|no age at all/.test(undoAfterContract),
    undoAfterContract.slice(0, 180)
  );
  check(
    "  ...and names the contract's rollback as the thing to run first",
    /20260922_pets_birth_date_contract\/rollback\.sql/.test(undoAfterContract),
    undoAfterContract.slice(0, 260)
  );
  const survived = byName(await cols(postContract, "pets"));
  check(
    "  ...leaving every birthDate intact rather than destroying it silently",
    survived.has("birthDate") && survived.has("birthDateIsEstimate")
  );
  await postContract.close();

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

  // ---- Expand against the REAL function, not a copy of it ---------------------------------------
  //
  // Expand's own harness compares its SQL against `appRule`, a hand transcription of
  // `approximateBirthDate` that its own comment calls "a copy, and therefore capable of drifting".
  // After #42 it has drifted twice: the real function moved to `Date.UTC` and gained a weeks unit,
  // while `appRule` kept local-time setters and the old unanchored /(\d+)\s*y/ and /(\d+)\s*m/. Its
  // O1 guard cannot see either, because O1 pins the copy against `src/data/pets.json`, whose ten
  // ages are all plain English years and months. So O2 there would keep passing against the wrong
  // rule. Found by the session that wrote #42.
  //
  // This harness already runs the real expand SQL and already runs under tsx, so it can import the
  // real function — which is the one repair that closes both halves. Nothing here is a copy.
  const { approximateBirthDate } = await import(
    new URL("../../../../src/lib/domain/petAge.ts", import.meta.url).href
  );

  // Every unit spelling expand's header says it reads, plus the four rollover cases its own
  // rehearsal pins, plus a compound. If the real function ever changes on any of these, this fails.
  const AGREED = [
    ["a-2y", "2 years", "2026-06-12"],
    ["a-1y", "1 year", "2025-03-04"],
    ["a-3yrs", "3 yrs", "2026-01-15"],
    ["a-1yr", "1 yr", "2026-01-15"],
    ["a-4mo", "4 months", "2026-07-22"],
    ["a-1mo", "1 month", "2026-07-22"],
    ["a-2mths", "2 mths", "2026-07-22"],
    ["a-2mth", "2 mth", "2026-07-22"],
    ["a-6mos", "6 mos", "2026-07-22"],
    ["a-leap", "1 year", "2024-02-29"],
    ["a-end1", "1 month", "2026-03-31"],
    ["a-end2", "1 month", "2026-05-31"],
    ["a-18mo", "18 months", "2026-06-12"],
    ["a-compound", "1 year 6 months", "2026-06-12"],
    // pets.json pet-008: the row that derived 2026-03-01 at UTC+8 and 2026-03-04 in
    // America/New_York under the old local-time setters. The timezone entry asks for it by name.
    ["a-pet008", "5 months", "2026-08-01"],
  ];
  const agreed = new PGlite();
  await agreed.exec(PROD_SCHEMA);
  for (const [id, age, intake] of AGREED) await insertPreExpand(agreed, [id, age, "adult", intake]);
  const agreedErr = await tryExec(agreed, EXPAND);
  check(
    `expand accepts all ${AGREED.length} spellings its header says it reads`,
    agreedErr === "",
    agreedErr.slice(0, 200)
  );
  if (!agreedErr) {
    const stored = new Map(
      (await agreed.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((r) => [r.id, r.birthDate])
    );
    const drift = AGREED.filter(
      ([id, age, intake]) => stored.get(id) !== approximateBirthDate(age, intake).birthDate
    ).map(([id, age, intake]) => `${id} "${age}"@${intake}: sql=${stored.get(id)} app=${approximateBirthDate(age, intake).birthDate}`);
    check(
      "every stored birthday equals what the real approximateBirthDate computes",
      drift.length === 0,
      drift.join(" | ")
    );
  }
  await agreed.close();

  // Containment, made executable rather than left as prose. After #42 the app reads strings the
  // backfill deliberately refuses. That is safe ONLY in this direction — a refused row is named and
  // stops the backfill, it is never stored differently — so both halves are asserted: the app reads
  // it, and expand refuses it. If someone teaches expand one of these without matching the app,
  // or teaches the app one without anyone noticing expand refuses it, this is where it shows.
  const APP_ONLY = [
    ["3 minggu", "weeks, Malay"],
    ["3 weeks", "weeks"],
    ["3 wks", "weeks"],
    ["2 tahun", "years, Malay"],
    ["4 bulan", "months, Malay"],
    ["3 mnth", "a month abbreviation expand does not list"],
    ["5 yo", "a year abbreviation expand does not list"],
  ];
  for (const [age, why] of APP_ONLY) {
    const intake = "2026-06-12";
    check(
      `the app reads "${age}" (${why})`,
      approximateBirthDate(age, intake).birthDate !== intake
    );
    const one = new PGlite();
    await one.exec(PROD_SCHEMA);
    await insertPreExpand(one, ["only", age, "adult", intake]);
    const oneErr = await tryExec(one, EXPAND);
    check(`  ...and expand refuses it rather than storing a different date`, oneErr !== "", "expand accepted it");
    await one.close();
  }
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
check("refuses a hand-patched column, which carries no marker", /carries no marker/.test(err), err.slice(0, 160));
check(
  "  ...and the hint says how to recover rather than just refusing",
  /20260922_pets_birth_date\/migration\.sql/.test(err),
  err.slice(0, 220)
);
check("  ...leaving age in place", byName(await cols(patched, "pets")).has("age"));

// The defeat of the old discriminator, pinned so it cannot come back. An operator stops the read
// storm by hand AND relaxes `age` so creates work, then runs expand, which no-ops on the column
// but still relaxes and marks `age`. Nullability then says "expand ran" while every birthday is
// the sentinel. Only the marker on `birthDate` tells the truth.
const defeated = await freshPreExpand();
await defeated.exec(
  `ALTER TABLE "public"."pets"
     ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01',
     ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true;
   ALTER TABLE "public"."pets" ALTER COLUMN "age" DROP NOT NULL;
   ALTER TABLE "public"."pets" ALTER COLUMN "ageCategory" DROP NOT NULL;`
);
err = await tryExec(defeated, MIG);
check(
  "refuses a hand-patch that also relaxed age, which the old nullability check accepted",
  /carries no marker/.test(err),
  err.slice(0, 160)
);
check("  ...leaving age in place", byName(await cols(defeated, "pets")).has("age"));
await defeated.close();

// Belt and braces: even with a forged marker, a table where every row holds the schema default is
// placeholders rather than derived dates, and the count is now actually executed.
const allSentinel = await freshPreExpand();
await applyExpandShape(allSentinel);
await allSentinel.exec(`UPDATE "public"."pets" SET "birthDate" = '2024-01-01';`);
err = await tryExec(allSentinel, MIG);
check(
  "refuses when every row carries the '2024-01-01' schema default",
  /schema default/.test(err),
  err.slice(0, 160)
);
check("  ...leaving age in place", byName(await cols(allSentinel, "pets")).has("age"));
await allSentinel.close();
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
check("cleanup.sql applies", (await tryExec(db, CLEAN)) === "");
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
check("settings migration applies", (await tryExec(db, SET_MIG)) === "");
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
check("settings migration re-applies", (await tryExec(db, SET_MIG)) === "");
check("re-runs as a no-op", JSON.stringify(await cols(db, "shelter_settings")) === afterFirst);
check("settings rollback applies", (await tryExec(db, SET_ROLL)) === "");
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
check("settings migration applies after rollback", (await tryExec(db, SET_MIG)) === "");
check("applies again after rollback", JSON.stringify(await cols(db, "shelter_settings")) === afterFirst);
await db.close();

// A skip is not a pass. Scenario 0 holds the only checks that execute the real expand SQL and the
// only regression test for the destructive rollback path, so losing it has to change the exit
// code — otherwise renaming or moving the expand folder turns this harness green by subtraction.
// The sibling harness makes the same case for the same reason.
if (!HAS_EXPAND) {
  console.log(
    `\n=== ${pass} passed, ${fail} failed, SCENARIO 0 SKIPPED ===\n` +
      `The expand migration was not found at ${EXPAND_PATH}.\n` +
      `Everything that runs the real expand SQL — including the regression test for the\n` +
      `expand-rollback-after-contract data loss — did not run. Exiting non-zero.`
  );
  process.exit(2);
}

console.log(`\n=== ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
