// Rehearsal for migration.sql and rollback.sql beside this file. 92 checks.
//
// The 20260917_status_enums rehearsal was run the same way and its script was not kept, so its
// twenty-nine checks can only be re-read, never re-run. This one is kept for that reason: a
// reviewer who doubts a claim in migration.sql's header should be able to re-take the
// measurement rather than trust the paragraph.
//
//   npm i --no-save embedded-postgres      # ~100 MB, not a repo dependency; delete after
//   node prisma/migrations/manual/20260922_pets_birth_date/rehearse.mjs
//
// The target is an embedded PostgreSQL this process starts in a temp directory and stops at the
// end, with its connection string built inline below. It resolves nothing from .env.local,
// prisma.config.ts, DATABASE_URL or any other environment, so it cannot reach production or the
// local dev database however this repo is configured -- which is the point of
// tasks/lessons/2026-09-11-a-rehearsal-that-resolves-its-target-from-config-rehearses-nothing.md.
// It picks a random port and a fresh mkdtemp directory each run, so two of these can run at once
// and an orphan from a crashed run blocks nothing. Set REHEARSAL_PORT to pin one.
//
// The seven Prisma-level checks need a generated client (`npm run db:generate`). Without one
// they are skipped -- loudly, and the run then exits non-zero -- and the other eighty-five
// still run.

import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const MIGRATION = readFileSync(join(HERE, "migration.sql"), "utf8");
const ROLLBACK = readFileSync(join(HERE, "rollback.sql"), "utf8");

let EmbeddedPostgres, pg;
try {
  ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  ({ default: pg } = await import("pg"));
} catch {
  console.error("This rehearsal needs `npm i --no-save embedded-postgres`. See the header.");
  process.exit(2);
}

// Per run, not a fixed 55433: an orphaned cluster from a crashed run must not be able to hold the
// port the next run wants. Pairs with the mkdtemp data directory below.
const PORT = Number(process.env.REHEARSAL_PORT || 55000 + Math.floor(Math.random() * 4000));

// initdb inherits the host locale, which on this machine means WIN1252; Neon is UTF8. A
// non-breaking space between a number and its unit parses under WIN1252 and is refused under
// UTF8, so the encoding is pinned rather than inherited.
//
// Pinned, not matched: [[:space:]] and \M are decided by LC_CTYPE, not by the encoding, and this
// sets ctype to C because a Windows initdb cannot be relied on for C.UTF-8. Neon's branches run a
// UTF-8 ctype, so the word-boundary and whitespace results below are taken under a ctype
// production does not have. glibc excludes U+00A0 from `space` under C, C.UTF-8 and en_US.UTF-8
// alike, so the M2 result should hold there too -- but that is reasoning, not measurement, and
// anyone re-taking it on a Linux host should pin LC_CTYPE 'C.UTF-8' and say so.
const BOOTSTRAP_URL = `postgresql://postgres:rehearsal@127.0.0.1:${PORT}/postgres`;
const DB_URL = `postgresql://postgres:rehearsal@127.0.0.1:${PORT}/rehearsal_utf8`;

let failures = 0;
let skipped = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${detail ? `  -- ${detail}` : ""}`);
};
const skip = (name, why) => {
  skipped++;
  console.log(`  --   ${name}  -- skipped: ${why}`);
};

// Production's pets, as the schema it was built from declares it (6108d82^): age/ageCategory
// present and NOT NULL, no birthDate, intakeDate as text, status already the PetStatus enum the
// owner applied on 2026-09-18. Every other scalar master's Pet model declares is here, so a
// Prisma select of the current schema differs from this table in exactly the two columns -- if
// it differed in more, P1 below would pass for the wrong reason.
const PROD_SHAPE = `
CREATE TYPE "public"."PetStatus" AS ENUM ('Available','Pending','Adopted','In Rehabilitation');
CREATE TABLE "public"."pets" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "species" TEXT NOT NULL,
  "breed" TEXT NOT NULL,
  "age" TEXT NOT NULL,
  "ageCategory" TEXT NOT NULL,
  "gender" TEXT NOT NULL,
  "size" TEXT NOT NULL,
  "weight" TEXT NOT NULL,
  "status" "public"."PetStatus" NOT NULL DEFAULT 'Available',
  "adoptionFee" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rescueStory" TEXT NOT NULL,
  "image" TEXT NOT NULL,
  "galleryImages" TEXT[] NOT NULL DEFAULT '{}',
  "tags" TEXT[] NOT NULL DEFAULT '{}',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "intakeDate" TEXT NOT NULL,
  "vaccinated" BOOLEAN NOT NULL DEFAULT true,
  "microchipped" BOOLEAN NOT NULL DEFAULT true,
  "spayedNeutered" BOOLEAN NOT NULL DEFAULT true,
  "specialNeeds" TEXT,
  "customQrUrl" TEXT,
  "rehabStage" TEXT,
  "rehabStageMs" TEXT,
  "rehabProgressPercent" INTEGER,
  "goodWithDogs" BOOLEAN NOT NULL DEFAULT true,
  "goodWithCats" BOOLEAN NOT NULL DEFAULT true,
  "goodWithKids" BOOLEAN NOT NULL DEFAULT true,
  "energyLevel" TEXT NOT NULL DEFAULT 'Moderate',
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sponsorshipGoalSen" INTEGER
);
CREATE INDEX "pets_species_status_isArchived_idx" ON "public"."pets"("species","status","isArchived");
CREATE INDEX "pets_isArchived_status_idx" ON "public"."pets"("isArchived","status");

-- The relations PET_INCLUDE pulls. getServerPetsAsync does not call a bare findMany: it calls
-- findMany({ include: { updates, medicalTimeline: { include: { vet } } } }), so the query this
-- migration is meant to fix touches pet_updates, medical_timeline_events and veterinarians too.
-- Without these tables P3 would prove a simpler query works than the one production runs.
CREATE TABLE "public"."veterinarians" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "licenseNumber" TEXT NOT NULL UNIQUE,
  "clinicName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."pet_updates" (
  "id" TEXT PRIMARY KEY,
  "petId" TEXT NOT NULL REFERENCES "public"."pets"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleMs" TEXT,
  "content" TEXT NOT NULL,
  "contentMs" TEXT,
  "image" TEXT,
  "category" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "public"."medical_timeline_events" (
  "id" TEXT PRIMARY KEY,
  "petId" TEXT NOT NULL REFERENCES "public"."pets"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleMs" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "descriptionMs" TEXT,
  "veterinarian" TEXT,
  "vetId" TEXT REFERENCES "public"."veterinarians"("id") ON DELETE SET NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "badge" TEXT,
  "badgeMs" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

// The ten src/data/pets.json animals: id, age prose, intakeDate, and the birthDate that file
// carries. The fourth column is the expectation, and it is an independent one -- that fixture
// was written by hand, long before this SQL, and the SQL was not derived from it.
const petsJson = JSON.parse(readFileSync(join(REPO, "src", "data", "pets.json"), "utf8"));
const FIXTURES = petsJson.map((p) => [p.id, p.age, p.intakeDate, p.birthDate]);

async function seedRow(c, id, age, intake, category = "young") {
  await c.query(
    `INSERT INTO "public"."pets"
       ("id","name","species","breed","age","ageCategory","gender","size","weight",
        "adoptionFee","description","rescueStory","image","intakeDate")
     VALUES ($1,$2,'dog','Mixed',$3,$4,'Male','Medium','12kg','RM250','d','r','/i.jpg',$5)`,
    [id, `Name ${id}`, age, category, intake]
  );
}

async function fresh(c, rows = FIXTURES) {
  await c.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await c.query(PROD_SHAPE);
  for (const [id, age, intake] of rows) await seedRow(c, id, age, intake);
}

const columns = (c) =>
  c
    .query(
      `SELECT column_name, is_nullable, column_default, data_type
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='pets' ORDER BY column_name`
    )
    .then((r) => Object.fromEntries(r.rows.map((x) => [x.column_name, x])));

// A failing multi-statement simple query skips the rest of the string, so the file's own COMMIT
// never runs and the session is left holding an aborted transaction. Nothing is committed either
// way; the ROLLBACK here only makes the connection usable for the next check. migration.sql's
// header says the same thing to whoever runs it in the Neon editor.
async function expectFail(c, sql) {
  try {
    await c.query(sql);
    return { failed: false, message: "" };
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    return { failed: true, message: e.message, code: e.code };
  }
}

const dataDir = mkdtempSync(join(tmpdir(), "pets-birth-date-rehearsal-"));
const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "rehearsal",
  port: PORT,
  persistent: false,
});
await server.initialise();
await server.start();

const bootstrap = new pg.Client({ connectionString: BOOTSTRAP_URL });
await bootstrap.connect();
await bootstrap.query(
  `CREATE DATABASE rehearsal_utf8 WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`
);
await bootstrap.end();

const c = new pg.Client({ connectionString: DB_URL });
await c.connect();

// Clean up even on an unhandled rejection. A top-level await that throws would otherwise kill the
// process before the teardown at the end of this file and leave a cluster running -- which is the
// situation tasks/lessons/2026-09-22-scope-a-stray-process-sweep-to-your-own-job-directory.md is
// about, and the per-run port above is the other half of not causing it.
const shutdown = async () => {
  try { await c.end(); } catch {}
  try { await server.stop(); } catch {}
};
for (const ev of ["uncaughtException", "unhandledRejection"]) {
  process.on(ev, async (e) => {
    console.error(`\n${ev}:`, e);
    await shutdown();
    process.exit(1);
  });
}

console.log(`\nTarget: ${DB_URL}  (throwaway, started by this process)`);
console.log(`${(await c.query("select version()")).rows[0].version}`);
console.log(`server_encoding: ${(await c.query("SELECT current_setting('server_encoding') AS e")).rows[0].e}\n`);

// ------------------------------------------------------------------ A. the happy path
await fresh(c);
{
  const r = await expectFail(c, `SELECT "id","birthDate" FROM "public"."pets"`);
  check("A1 before: selecting birthDate fails 42703 undefined_column", r.failed && r.code === "42703", r.code || "");
}
{
  const r = await expectFail(
    c,
    `INSERT INTO "public"."pets" ("id","name","species","breed","gender","size","weight",
      "adoptionFee","description","rescueStory","image","intakeDate")
     VALUES ('x','X','dog','M','Male','S','1kg','RM1','d','r','/i','2026-01-01')`
  );
  check("A2 before: insert without age fails 23502 not-null", r.failed && r.code === "23502", r.code || "");
}

// Not `check(..., true)`. A3 exists to catch a migration that stops applying, and a bare
// `await c.query(MIGRATION)` would throw past the check and kill the run instead of failing it --
// the same literal-assertion defect the comment above J3 describes.
{
  const r = await expectFail(c, MIGRATION);
  check("A3 migration.sql applies", !r.failed, r.message.split("\n")[0]);
}

{
  const cols = await columns(c);
  check(
    "A4 after: birthDate NOT NULL, default '2024-01-01'",
    !!cols.birthDate && cols.birthDate.is_nullable === "NO" && /2024-01-01/.test(cols.birthDate.column_default || "")
  );
  check(
    "A5 after: birthDateIsEstimate NOT NULL, default true",
    !!cols.birthDateIsEstimate && cols.birthDateIsEstimate.is_nullable === "NO" && /true/.test(cols.birthDateIsEstimate.column_default || "")
  );
  check("A6 after: age is nullable", cols.age?.is_nullable === "YES");
  check("A7 after: ageCategory is nullable", cols.ageCategory?.is_nullable === "YES");
}
{
  const r = await c.query(`SELECT "id","age","birthDate","birthDateIsEstimate" FROM "public"."pets" ORDER BY "id"`);
  const expected = Object.fromEntries(FIXTURES.map(([id, , , birth]) => [id, birth]));
  const wrong = r.rows.filter((row) => row.birthDate !== expected[row.id]);
  check(
    "A8 after: every birthDate equals the pets.json value for the same age+intake",
    r.rows.length === FIXTURES.length && wrong.length === 0,
    wrong.length ? JSON.stringify(wrong) : `${r.rows.length}/${FIXTURES.length}`
  );
  check("A9 after: birthDateIsEstimate is true on every row", r.rows.every((x) => x.birthDateIsEstimate === true));
  check("A10 after: every age value is still present", r.rows.every((x) => typeof x.age === "string" && x.age.length > 0));
  check("A11 after: row count unchanged", r.rows.length === FIXTURES.length, String(r.rows.length));
}
{
  const r = await expectFail(
    c,
    `INSERT INTO "public"."pets" ("id","name","species","breed","gender","size","weight",
      "adoptionFee","description","rescueStory","image","intakeDate","birthDate")
     VALUES ('new-1','X','dog','M','Male','S','1kg','RM1','d','r','/i','2026-01-01','2020-01-01')`
  );
  check("A12 after: insert without age now succeeds", !r.failed, r.message);
  await c.query(`DELETE FROM "public"."pets" WHERE "id"='new-1'`);
}

// ------------------------------------------------------- B. idempotence / re-run safety
{
  const r = await expectFail(c, MIGRATION);
  check("B1 re-running migration.sql does not error", !r.failed, r.message.split("\n")[0]);
}
{
  const r = await c.query(`SELECT "birthDate" FROM "public"."pets" WHERE "id"=$1`, [FIXTURES[0][0]]);
  check("B2 re-run leaves the backfilled dates alone", r.rows[0].birthDate === FIXTURES[0][3], r.rows[0].birthDate);
}
await c.query(`UPDATE "public"."pets" SET "birthDate"='2019-02-02',"birthDateIsEstimate"=false WHERE "id"=$1`, [FIXTURES[0][0]]);
await c.query(MIGRATION);
{
  const r = await c.query(`SELECT "birthDate","birthDateIsEstimate" FROM "public"."pets" WHERE "id"=$1`, [FIXTURES[0][0]]);
  check(
    "B3 re-run does NOT overwrite a date a human corrected through the form",
    r.rows[0].birthDate === "2019-02-02" && r.rows[0].birthDateIsEstimate === false
  );
}

// -------------------------------------------------------- C. refusals: nothing coerced
const REFUSALS = [
  ["C1 unparseable age aborts and names the row", [["bad-1", "unknown", "2026-01-01"]], /bad-1/],
  ["C2 empty age aborts", [["bad-2", "", "2026-01-01"]], /bad-2/],
  ["C3 non-date intakeDate aborts", [["bad-3", "2 years", "not-a-date"]], /bad-3/],
  ["C4 impossible calendar date (2024-02-31) aborts", [["bad-4", "2 years", "2024-02-31"]], /bad-4/],
  ["C5 month 13 aborts rather than raising", [["bad-5", "2 years", "2024-13-01"]], /bad-5/],
  ["C6 implausible age (500 years) aborts", [["bad-6", "500 years", "2026-01-01"]], /not a plausible/],
  ["C7 huge digit run aborts without integer overflow", [["bad-7", "99999999999999 years", "2026-01-01"]], /not a plausible/],
  // The one input shape that parses cleanly and means something else. The rule takes the digit
  // run beside the unit token, so "1.5 years" yields 5 -- a birthday three and a half years out,
  // passing the plausibility bound and firing no notice. These must abort, not round.
  ["C9 a decimal age aborts instead of reading the digits beside the unit", [["bad-9", "1.5 years", "2026-01-01"]], /fractional/],
  ["C10 a comma decimal aborts", [["bad-10", "1,5 years", "2026-01-01"]], /fractional/],
  ["C11 a written fraction aborts", [["bad-11", "1 1/2 years", "2026-01-01"]], /fractional/],
];
for (const [name, rows, expect] of REFUSALS) {
  await fresh(c, [...FIXTURES, ...rows]);
  const r = await expectFail(c, MIGRATION);
  const cols = await columns(c);
  const untouched = !cols.birthDate && cols.age.is_nullable === "NO";
  check(name, r.failed && expect.test(r.message) && untouched, r.failed ? r.message.split("\n")[0] : "did not abort");
}
{
  await fresh(c);
  await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "age" DROP NOT NULL`);
  await seedRow(c, "bad-8", "2 years", "2026-01-01");
  await c.query(`UPDATE "public"."pets" SET "age"=NULL WHERE "id"='bad-8'`);
  const r = await expectFail(c, MIGRATION);
  check("C8 NULL age aborts and adds no column", r.failed && /bad-8/.test(r.message) && !(await columns(c)).birthDate);
}

// ------------------------------------------------- D. refuses when there is nothing to use
{
  await c.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await c.query(PROD_SHAPE);
  await c.query(`ALTER TABLE "public"."pets" DROP COLUMN "age"`);
  const r = await expectFail(c, MIGRATION);
  check("D1 no birthDate and no age: refuses instead of defaulting every row", r.failed && /nothing to derive/.test(r.message));
}

// ------------------------------------------------------ E. unit and language coverage
{
  const CASES = [
    ["e-1", "2 yrs", "2026-06-12", "2024-06-12"],
    ["e-2", "3 year", "2026-06-12", "2023-06-12"],
    ["e-3", "4 mo", "2026-06-12", "2026-02-12"],
    ["e-4", "6 mths", "2026-06-12", "2025-12-12"],
    ["e-5", "1 year 6 months", "2026-06-12", "2025-06-12"],
    ["e-6", "2y", "2026-06-12", "2024-06-12"],
    ["e-7", "18 months", "2026-06-12", "2024-12-12"],
    ["e-8", "About 3 years old", "2026-06-12", "2023-06-12"],
    ["e-9", "0 months", "2026-06-12", "2026-06-12"],
  ];
  await fresh(c, CASES);
  await c.query(MIGRATION);
  const r = await c.query(`SELECT "id","age","birthDate" FROM "public"."pets" ORDER BY "id"`);
  const wrong = r.rows.filter((row) => row.birthDate !== CASES.find((x) => x[0] === row.id)[3]);
  // NOT "as the app does" -- that was the earlier name and it was false. master's
  // approximateBirthDate (src/lib/domain/petAge.ts) matches only /(\d+)\s*y/ and /(\d+)\s*m/, so
  // for e-1..e-4 it matches nothing and returns the intake date unchanged. The four Malay cases
  // are exactly where this SQL and today's app disagree, deliberately, and migration.sql's header
  // says so. The English cases do agree with the app. These expectations are calendar arithmetic
  // stated by hand, which is what they should be: deriving them from the app would make the
  // check agree with whatever the app does, including its bugs.
  check("E1 every English unit spelling, and years-before-months, derives the stated date", wrong.length === 0, wrong.length ? JSON.stringify(wrong) : `${r.rows.length}/${r.rows.length}`);
}

// ------------------------------------------------------ F. month-end clamping is reported
{
  const CASES = [
    ["f-1", "1 month", "2026-03-31", "2026-03-03"],
    ["f-2", "1 year", "2024-02-29", "2023-03-01"],
    ["f-3", "2 years", "2026-06-12", "2024-06-12"],
  ];
  await fresh(c, CASES);
  const notices = [];
  c.on("notice", (n) => notices.push(n.message));
  await c.query(MIGRATION);
  const got = Object.fromEntries((await c.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((x) => [x.id, x.birthDate]));
  check("F1 2026-03-31 minus 1 month rolls to 2026-03-03, as the app does", got["f-1"] === "2026-03-03", got["f-1"]);
  check("F2 2024-02-29 minus 1 year rolls to 2023-03-01, as the app does", got["f-2"] === "2023-03-01", got["f-2"]);
  const clampNotice = notices.find((n) => /rolled into the following month/.test(n)) || "";
  check("F3 both rolled rows are named in a NOTICE", /f-1/.test(clampNotice) && /f-2/.test(clampNotice));
  check("F4 the row that did not roll is not named", !/f-3/.test(clampNotice));
  c.removeAllListeners("notice");
}

// ---------------------------------------------------------------------- G. rollback
{
  await fresh(c);
  await c.query(MIGRATION);
  await c.query(ROLLBACK);
  const cols = await columns(c);
  check("G1 rollback drops both added columns", !cols.birthDate && !cols.birthDateIsEstimate);
  check("G2 rollback restores NOT NULL on age and ageCategory", cols.age.is_nullable === "NO" && cols.ageCategory.is_nullable === "NO");
  const kept = await c.query(`SELECT count(*)::int n FROM "public"."pets" WHERE "age" IS NOT NULL`);
  check("G3 rollback keeps every age value", kept.rows[0].n === FIXTURES.length, String(kept.rows[0].n));
  await c.query(MIGRATION);
  const after = await c.query(`SELECT "birthDate" FROM "public"."pets" WHERE "id"=$1`, [FIXTURES[0][0]]);
  check("G4 migration.sql applies again cleanly after rollback", after.rows[0].birthDate === FIXTURES[0][3]);
}
{
  await fresh(c);
  await c.query(MIGRATION);
  await c.query(
    `INSERT INTO "public"."pets" ("id","name","species","breed","gender","size","weight",
      "adoptionFee","description","rescueStory","image","intakeDate","birthDate")
     VALUES ('post-1','X','dog','M','Male','S','1kg','RM1','d','r','/i','2026-01-01','2020-01-01')`
  );
  const notices = [];
  c.on("notice", (n) => notices.push(n.message));
  await c.query(ROLLBACK);
  check(
    "G5 rollback with a post-migration NULL-age row leaves age nullable and says so",
    (await columns(c)).age.is_nullable === "YES" && notices.some((n) => /left nullable/.test(n))
  );
  check(
    "G6 rollback names the rows it is about to strand with no age and no birthDate",
    notices.some((n) => /no birthday and no age/.test(n) && /post-1/.test(n)),
    (notices.find((n) => /no birthday and no age/.test(n)) || "not named").replace(/\s+/g, " ").slice(0, 110)
  );
  c.removeAllListeners("notice");

  // And the trap that warning exists for: migration.sql refuses the whole table over that row.
  const reapply = await expectFail(c, MIGRATION);
  check(
    "G7 migration.sql then refuses the whole table over that row, as the warning says",
    reapply.failed && /post-1/.test(reapply.message),
    reapply.failed ? reapply.message.split("\n")[0].slice(0, 70) : "it applied"
  );
  await c.query(`UPDATE "public"."pets" SET "age" = '6 years' WHERE "id" = 'post-1'`);
  await c.query(MIGRATION);
  check("G8 and applies once that row is given an age, as the header instructs", !!(await columns(c)).birthDate);
}
{
  // The asymmetry: production's nullability is never measured, so `age` may already be nullable
  // there. Then migration.sql's DROP NOT NULL is a no-op -- and a rollback that restored the
  // constraint unconditionally would leave the column STRICTER than it found it, breaking every
  // pet creation in a state production was never in. Only a column this migration marked is
  // tightened again.
  await fresh(c);
  await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "age" DROP NOT NULL`);
  await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "ageCategory" DROP NOT NULL`);
  await c.query(MIGRATION);
  await c.query(ROLLBACK);
  const cols = await columns(c);
  check(
    "G9 a column that was already nullable is not tightened by rollback",
    cols.age.is_nullable === "YES" && cols.ageCategory.is_nullable === "YES",
    `age=${cols.age.is_nullable} ageCategory=${cols.ageCategory.is_nullable}`
  );
  const r = await expectFail(
    c,
    `INSERT INTO "public"."pets" ("id","name","species","breed","gender","size","weight",
      "adoptionFee","description","rescueStory","image","intakeDate")
     VALUES ('after-rb','X','dog','M','Male','S','1kg','RM1','d','r','/i','2026-01-01')`
  );
  check("G10 so a pet can still be created after that rollback", !r.failed, r.message.split("\n")[0]);
}

// ------------------------------------------------------- H. search_path and locking
{
  await fresh(c);
  await c.query(`CREATE SCHEMA IF NOT EXISTS elsewhere`);
  const c2 = new pg.Client({ connectionString: DB_URL });
  await c2.connect();
  await c2.query(`SET search_path TO elsewhere`);
  await c2.query(MIGRATION);
  check("H1 under a foreign search_path the columns still land on public.pets", !!(await columns(c)).birthDate);
  const stray = await c.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='elsewhere'`);
  check("H2 nothing was created in the other schema", stray.rows[0].n === 0, String(stray.rows[0].n));
  await c2.end();
}
{
  await fresh(c);
  const holder = new pg.Client({ connectionString: DB_URL });
  await holder.connect();
  await holder.query("BEGIN");
  await holder.query(`LOCK TABLE "public"."pets" IN ACCESS EXCLUSIVE MODE`);

  const runner = new pg.Client({ connectionString: DB_URL });
  await runner.connect();
  const t0 = Date.now();
  const r = await expectFail(runner, MIGRATION);
  const secs = (Date.now() - t0) / 1000;
  await holder.query("ROLLBACK");
  await holder.end();

  const cols = await columns(c);
  check("H3 with pets held by another transaction it gives up on the lock timeout", r.failed && r.code === "55P03" && secs < 15, `${r.code} after ${secs.toFixed(1)}s`);
  check("H4 and it commits nothing: no column added, age still NOT NULL", !cols.birthDate && cols.age.is_nullable === "NO");
  await runner.query(MIGRATION);
  const after = await c.query(`SELECT "birthDate" FROM "public"."pets" WHERE "id"=$1`, [FIXTURES[0][0]]);
  check("H5 re-running once the lock is free finishes the job", after.rows[0].birthDate === FIXTURES[0][3]);
  await runner.end();
}

// ------------------- K. half of the pair present is refused, not mistaken for "already done"
{
  await fresh(c);
  await c.query(`ALTER TABLE "public"."pets" ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2024-01-01'`);
  const r = await expectFail(c, MIGRATION);
  const cols = await columns(c);
  check(
    "K1 birthDate without birthDateIsEstimate is refused, not reported as already migrated",
    r.failed && /birthDateIsEstimate/.test(r.message) && !cols.birthDateIsEstimate,
    r.failed ? r.message.split("\n")[0].slice(0, 110) : "it did not abort"
  );
}
{
  await fresh(c);
  await c.query(`ALTER TABLE "public"."pets" ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT true`);
  const r = await expectFail(c, MIGRATION);
  const cols = await columns(c);
  check(
    "K2 birthDateIsEstimate without birthDate is refused, and no backfill runs",
    r.failed && /birthDate/.test(r.message) && !cols.birthDate,
    r.failed ? r.message.split("\n")[0].slice(0, 110) : "it did not abort"
  );
}

// ------------------- L. a unit token is a whole word, and the fraction guard is not greedy
{
  // "minggu" is Malay for weeks. A bare `m` alternative matches its first letter, so before the
  // tokens were anchored with \M this stored 3 MONTHS for a three-week-old puppy -- and the
  // pre-check called it `ok: months`. English "3 weeks" was refused all along, so widening the
  // token list to Malay is what opened this, and only a whole-word match closes it.
  for (const [id, age] of [["l-1", "3 minggu"], ["l-2", "2 minggu"], ["l-3", "3 weeks"], ["l-4", "5 hari"]]) {
    await fresh(c, [[id, age, "2026-06-12"]]);
    const r = await expectFail(c, MIGRATION);
    check(
      `L1 "${age}" is refused rather than read as months or years`,
      r.failed && new RegExp(id).test(r.message),
      r.failed ? "" : "it was accepted"
    );
  }
}
{
  // A decimal elsewhere in the string is not a fractional age. One offender aborts the whole
  // table, so a false positive here would block the catalogue fix over a recorded weight.
  const OK = [
    ["l-5", "2 years, 12.5 kg", "2026-06-12", "2024-06-12"],
    ["l-6", "3 years (lahir 12/06/2023)", "2026-06-12", "2023-06-12"],
  ];
  await fresh(c, OK);
  await c.query(MIGRATION);
  const got = Object.fromEntries((await c.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((x) => [x.id, x.birthDate]));
  check(
    "L2 a decimal elsewhere in the age does not trip the fraction guard",
    OK.every(([id, , , want]) => got[id] === want),
    JSON.stringify(got)
  );
}
{
  // A vulgar fraction is not ASCII, so the [0-9][.,/][0-9] guard cannot see it. It has to fall
  // out as unparseable instead of being read as its leading digit -- checked, not assumed.
  await fresh(c, [["l-7", "1½ years", "2026-06-12"]]);
  const r = await expectFail(c, MIGRATION);
  check(
    "L3 a vulgar-fraction age is refused, not read as its leading digit",
    r.failed && /l-7/.test(r.message),
    r.failed ? r.message.split("\n")[0].slice(0, 70) : "it was accepted"
  );
}

// ------------- M. a range is the same defect as a fraction: the captured run is not the meant one
{
  // "3-4 years" captures the run beside the unit -- 4 -- so a 1-2 year old lands as 2, crossing
  // the young/adult band boundary, with `age` scheduled to be dropped. Same shape as "1.5 years",
  // which the file already refused; only the separator class was too narrow to see it.
  for (const [id, age] of [
    ["m-1", "3-4 years"], ["m-2", "1-2 years"], ["m-3", "6-8 months"],
    ["m-4", "approx. 2-3 yrs"], ["m-5", "2–3 years"], ["m-6", "2—3 years"],
  ]) {
    await fresh(c, [[id, age, "2026-06-12"]]);
    const r = await expectFail(c, MIGRATION);
    check(`M1 "${age}" is refused rather than silently taking one bound`, r.failed && /fractional/.test(r.message), r.failed ? "" : "it was accepted");
  }
}
{
  // Under UTF8 -- which is what Neon is and what this harness now creates -- a non-breaking space
  // is not [[:space:]], so the age does not parse and the row is refused rather than guessed at.
  await fresh(c, [["m-7", "2 years", "2026-06-12"]]);
  const r = await expectFail(c, MIGRATION);
  check("M2 a non-breaking space in the age is refused under UTF8", r.failed && /m-7/.test(r.message), r.failed ? "" : "it was accepted");
}
{
  // The pre-check's job is to put what the owner must act on where they will see it. Sorting the
  // verdict text descending buried three of the four refusals below every ok row.
  const lines = MIGRATION.split("\n");
  const from = lines.findIndex((l) => l.includes("SELECT * FROM ("));
  const to = lines.findIndex((l) => l.includes(`ORDER BY (verdict LIKE 'ok:%'), verdict, "id";`));
  const PRECHECK = lines.slice(from, to + 1).map((l) => l.replace(/^--\s?/, "")).join("\n");
  await fresh(c, [
    ["n-1", "2 years", "2026-06-12"], ["n-2", "4 months", "2026-06-12"],
    ["n-3", "unknown", "2026-06-12"], ["n-4", "2 years", "not-a-date"],
    ["n-5", "500 years", "2026-06-12"], ["n-6", "1.5 years", "2026-06-12"],
  ]);
  const order = (await c.query(PRECHECK)).rows.map((x) => x.verdict);
  const lastRefusal = order.map((v) => !v.startsWith("ok:")).lastIndexOf(true);
  const firstOk = order.findIndex((v) => v.startsWith("ok:"));
  check(
    "M3 the pre-check lists every refusal above the rows it accepts",
    lastRefusal < firstOk && firstOk !== -1,
    JSON.stringify(order)
  );
}
{
  // The marker comment is the only place this otherwise non-destructive file writes over
  // something. A comment someone else left must survive apply and come back on rollback.
  await fresh(c);
  await c.query(`COMMENT ON COLUMN "public"."pets"."age" IS 'staff-entered prose, do not drop'`);
  await c.query(MIGRATION);
  const during = (await c.query(`SELECT col_description('"public"."pets"'::regclass, a.attnum) d
                                   FROM pg_attribute a
                                  WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'age'`)).rows[0].d;
  check("M4 the marker carries the previous comment rather than discarding it", /staff-entered prose/.test(during || ""), during);
  await c.query(ROLLBACK);
  const after = (await c.query(`SELECT col_description('"public"."pets"'::regclass, a.attnum) d
                                  FROM pg_attribute a
                                 WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'age'`)).rows[0].d;
  check("M5 and rollback puts that comment back exactly", after === "staff-entered prose, do not drop", JSON.stringify(after));
}

// ---- O. THE INVARIANT: every stored date equals what approximateBirthDate would compute
//
// This is the property the contract migration depends on, so it is checked here rather than
// asserted in prose. `appRule` is a transcription of src/lib/domain/petAge.ts
// `approximateBirthDate` -- a copy, and therefore capable of drifting from it. O1 pins the
// transcription against src/data/pets.json, whose birthDate values came from the real function;
// if the transcription drifts, O1 fails before O2 can pass for the wrong reason.
function appRule(ageStr, intakeStr) {
  const norm = String(ageStr).toLowerCase().trim();
  const intake = new Date(intakeStr);
  if (isNaN(intake.getTime())) return null;
  const y = norm.match(/(\d+)\s*y/);
  if (y) {
    const d = new Date(intake);
    d.setFullYear(d.getFullYear() - parseInt(y[1], 10));
    return d.toISOString().split("T")[0];
  }
  const m = norm.match(/(\d+)\s*m/);
  if (m) {
    const d = new Date(intake);
    d.setMonth(d.getMonth() - parseInt(m[1], 10));
    return d.toISOString().split("T")[0];
  }
  return intakeStr;
}
{
  const drifted = FIXTURES.filter(([, age, intake, birth]) => appRule(age, intake) !== birth);
  check(
    "O1 the transcribed app rule reproduces every pets.json birthDate, so it has not drifted",
    drifted.length === 0,
    drifted.length ? JSON.stringify(drifted) : `${FIXTURES.length}/${FIXTURES.length}`
  );
}
{
  const CORPUS = [
    ["o-1", "2 years", "2026-06-12"], ["o-2", "4 months", "2026-07-22"],
    ["o-3", "1 month", "2026-03-31"], ["o-4", "1 year", "2024-02-29"],
    ["o-5", "18 months", "2026-06-12"], ["o-6", "2y", "2026-06-12"],
    ["o-7", "About 3 years old", "2026-06-12"], ["o-8", "0 months", "2026-06-12"],
    ["o-9", "1 year 6 months", "2026-06-12"], ["o-10", "8 yrs", "2026-03-15"],
    ["o-11", "5 mo", "2026-08-01"], ["o-12", "1 month", "2026-01-31"],
  ];
  await fresh(c, CORPUS);
  await c.query(MIGRATION);
  const got = Object.fromEntries((await c.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((x) => [x.id, x.birthDate]));
  const bad = CORPUS.filter(([id, age, intake]) => got[id] !== appRule(age, intake))
    .map(([id, age, intake]) => `${id} "${age}": sql=${got[id]} app=${appRule(age, intake)}`);
  check(
    "O2 every date this file stores is exactly what approximateBirthDate computes",
    bad.length === 0,
    bad.length ? JSON.stringify(bad) : `${CORPUS.length}/${CORPUS.length}`
  );
}
{
  for (const [id, age] of [["o-13", "2 tahun"], ["o-14", "3 thn"], ["o-15", "4 bulan"], ["o-16", "6 bln"]]) {
    await fresh(c, [[id, age, "2026-06-12"]]);
    const r = await expectFail(c, MIGRATION);
    check(`O3 "${age}" is refused, not translated: the app reads it as the intake date`, r.failed && new RegExp(id).test(r.message), r.failed ? "" : "it was accepted");
  }
}

// ------------- N. spaced and worded ranges, and the guards that only looked at tight spellings
{
  // The first range fix required the two numbers to sit either side of the separator with no
  // space. Every natural spelling of a range puts spaces there, or a word.
  for (const [id, age] of [
    ["n2-1", "1 - 2 years"], ["n2-2", "3 – 4 years"], ["n2-3", "6 to 8 months"],
    ["n2-4", "between 2 and 3 years"], ["n2-5", "2 or 3 years"],
  ]) {
    await fresh(c, [[id, age, "2026-06-12"]]);
    const r = await expectFail(c, MIGRATION);
    check(`N1 "${age}" is refused rather than silently taking one bound`, r.failed && /fractional/.test(r.message), r.failed ? "" : "it was accepted");
  }
}
{
  // ...without breaking the round-2 cases, where the extra number sits after the unit.
  const OK = [
    ["n2-6", "2 years, 12.5 kg", "2026-06-12", "2024-06-12"],
    ["n2-7", "3 years (lahir 12/06/2023)", "2026-06-12", "2023-06-12"],
    ["n2-8", "1 year 6 months", "2026-06-12", "2025-06-12"],
  ];
  await fresh(c, OK);
  await c.query(MIGRATION);
  const got = Object.fromEntries((await c.query(`SELECT "id","birthDate" FROM "public"."pets"`)).rows.map((x) => [x.id, x.birthDate]));
  check("N2 a number after the unit is still not a range", OK.every(([id, , , w]) => got[id] === w), JSON.stringify(got));
}
{
  // The pre-check tested both unit bounds independently while the file picks one unit; a string
  // matching both read implausible here and was accepted there.
  await fresh(c, [["n2-9", "2 years 800 months", "2026-06-12"]]);
  const r = await expectFail(c, MIGRATION);
  check("N3 a both-units string is treated the same way by pre-check and file", !r.failed, r.message.split("\n")[0]);
}
{
  // rollback.sql must not drop columns migration.sql did not create.
  await fresh(c);
  await c.query(`ALTER TABLE "public"."pets" ADD COLUMN "birthDate" TEXT NOT NULL DEFAULT '2019-01-01'`);
  await c.query(`ALTER TABLE "public"."pets" ADD COLUMN "birthDateIsEstimate" BOOLEAN NOT NULL DEFAULT false`);
  await c.query(MIGRATION); // takes the "already has both" branch, adds nothing
  const notices = [];
  c.on("notice", (n) => notices.push(n.message));
  await c.query(ROLLBACK);
  c.removeAllListeners("notice");
  const cols = await columns(c);
  check(
    "N4 rollback does not drop a birthDate this migration never created",
    !!cols.birthDate && notices.some((n) => /carries no marker/.test(n)),
    cols.birthDate ? "kept" : "DROPPED"
  );
  const kept = await c.query(`SELECT count(*)::int n FROM "public"."pets" WHERE "birthDate" = '2019-01-01'`);
  check("N5 and the birthdays in it survive", kept.rows[0].n === FIXTURES.length, String(kept.rows[0].n));
}
{
  // The marker must not nest when a column is relaxed twice.
  await fresh(c);
  await c.query(`COMMENT ON COLUMN "public"."pets"."age" IS 'staff-entered prose, do not drop'`);
  await c.query(MIGRATION);
  await c.query(`UPDATE "public"."pets" SET "age" = coalesce("age", '2 years')`);
  await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "age" SET NOT NULL`); // re-tighten by hand
  await c.query(MIGRATION); // relaxes again; must not wrap the marker in a marker
  await c.query(ROLLBACK);
  const after = (await c.query(`SELECT col_description('"public"."pets"'::regclass, a.attnum) d
                                  FROM pg_attribute a
                                 WHERE a.attrelid = '"public"."pets"'::regclass AND a.attname = 'age'`)).rows[0].d;
  check("N6 a twice-relaxed column still gets its original comment back, not a nested marker", after === "staff-entered prose, do not drop", JSON.stringify(after));
}

// ---------------------------------- J. the header's own pre-check query, as the owner runs it
{
  const lines = MIGRATION.split("\n");
  const from = lines.findIndex((l) => l.includes("SELECT * FROM ("));
  const to = lines.findIndex((l) => l.includes(`ORDER BY (verdict LIKE 'ok:%'), verdict, "id";`));
  if (from < 0 || to < from) throw new Error("pre-check block not found in migration.sql header");
  const PRECHECK = lines.slice(from, to + 1).map((l) => l.replace(/^--\s?/, "")).join("\n");

  // One fixture per way the file can refuse, plus two it accepts. An earlier version omitted the
  // implausible and fractional rows, so J1 asserted "names every row the file would refuse"
  // while testing only two of the four refusals -- the claim was in the name, not in the check.
  const J = [
    ["j-1", "2 years", "2026-06-12", "ok: years"],
    ["j-2", "unknown", "2026-06-12", "unparseable age"],
    ["j-3", "2 years", "2024-02-31", "bad intakeDate"],
    ["j-4", "4 months", "2026-06-12", "ok: months"],
    ["j-5", "2 years", "not-a-date", "bad intakeDate"],
    ["j-6", "500 years", "2026-06-12", "implausible age"],
    ["j-7", "900 months", "2026-06-12", "implausible age"],
    ["j-8", "1.5 years", "2026-06-12", "fractional age"],
  ];
  await fresh(c, J);
  const verdict = Object.fromEntries((await c.query(PRECHECK)).rows.map((x) => [x.id, x.verdict]));
  const wrong = J.filter(([id, , , want]) => verdict[id] !== want);
  check(
    "J1 the header's pre-check returns the right verdict for every way the file can refuse",
    wrong.length === 0,
    wrong.length ? JSON.stringify(wrong.map(([id, , , want]) => `${id}: want ${want}, got ${verdict[id]}`)) : `${J.length}/${J.length}`
  );
  check("J2 the pre-check changes nothing", !(await columns(c)).birthDate);

  // And the pre-check's verdict must agree with what the file actually does: every row it calls
  // ok must survive, and each one it names must abort. Otherwise the owner reads a clean
  // pre-check and still gets an abort, which is the failure this pairing exists to prevent.
  // The summary line must carry the result, not the word "true". A previous revision passed a
  // literal `true` here and printed `ok` whatever the loop found -- which is precisely the
  // defect the comment above J1 says an earlier revision of J1 had, reintroduced one line down.
  const j3bad = [];
  for (const [id, age, intake, want] of J) {
    await fresh(c, [[id, age, intake]]);
    const r = await expectFail(c, MIGRATION);
    const agrees = want.startsWith("ok:") ? !r.failed : r.failed;
    if (!agrees) j3bad.push(`${id} (${want}): ${r.failed ? `aborted -- ${r.message.split("\n")[0]}` : "was accepted"}`);
  }
  check(
    "J3 every pre-check verdict matches what migration.sql actually does",
    j3bad.length === 0,
    j3bad.length ? JSON.stringify(j3bad) : `${J.length} rows`
  );
}

// ------------------------------------------------ I. no scratch table is left behind
{
  const r = await c.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name='_pets_birth_backfill'`);
  check("I1 the TEMP scratch table exists nowhere afterwards", r.rows[0].n === 0);
}

// ---------------------------------- P. master's own generated client, before and after
{
  // These seven are the strongest evidence in the change -- the failure reproduced rather than
  // reasoned -- so a skip has to be loud and has to say what actually went wrong. The first
  // version caught every error as "no generated client" and still exited 0, which would hide a
  // genuinely broken import behind a plausible message on any machine but the one it was written
  // on. pathToFileURL because a hand-built `file:///` + join() is Windows-shaped: on POSIX the
  // join already starts with a slash and the result is file://// with a bogus host.
  let PrismaClient, PrismaPg;
  const clientPath = join(REPO, "node_modules", "@prisma", "client", "default.js");
  const adapterPath = join(REPO, "node_modules", "@prisma", "adapter-pg", "dist", "index.js");
  try {
    ({ PrismaClient } = await import(pathToFileURL(clientPath).href));
    ({ PrismaPg } = await import(pathToFileURL(adapterPath).href));
  } catch (e) {
    const why = existsSync(clientPath)
      ? `import failed, NOT a missing client: ${e.message.split("\n")[0]}`
      : `no generated client at ${clientPath} -- run \`npm run db:generate\``;
    for (const n of ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) skip(`${n} Prisma-level check`, why);
  }

  if (PrismaClient && PrismaPg) {
    await fresh(c, [FIXTURES[0]]);
    const client = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    const newPet = {
      name: "New", species: "dog", breed: "Mixed", gender: "Male", size: "Small", weight: "5kg",
      adoptionFee: "RM100", description: "d", rescueStory: "r", image: "/i.jpg", intakeDate: "2026-09-22",
    };

    // PET_INCLUDE, not a bare findMany: this is the shape petRepository.ts:65 sends, and the
    // relations it pulls are why PROD_SHAPE creates three more tables.
    const PET_INCLUDE = {
      updates: { orderBy: { date: "asc" } },
      medicalTimeline: { orderBy: { date: "asc" }, include: { vet: true } },
    };

    let p = client();
    try {
      await p.pet.findMany({ include: PET_INCLUDE });
      check("P1 before: prisma.pet.findMany with PET_INCLUDE fails on a production-shaped pets", false, "it succeeded");
    } catch (e) {
      check("P1 before: prisma.pet.findMany with PET_INCLUDE fails on a production-shaped pets", /birthDate/.test(e.message), (e.message.match(/The column [^\n]*/) || [""])[0]);
    }
    try {
      await p.pet.create({ data: { id: "pet-new", ...newPet } });
      check("P2 before: prisma.pet.create fails", false, "it succeeded");
    } catch (e) {
      check("P2 before: prisma.pet.create fails", /birthDate/.test(e.message), (e.message.match(/The column [^\n]*/) || [""])[0]);
    }
    await p.$disconnect();

    await c.query(MIGRATION);

    p = client();
    const rows = await p.pet.findMany({ include: PET_INCLUDE });
    check(
      "P3 after: prisma.pet.findMany with PET_INCLUDE returns the real row",
      rows.length === 1 && rows[0].id === FIXTURES[0][0] && Array.isArray(rows[0].updates) && Array.isArray(rows[0].medicalTimeline)
    );
    check("P4 after: the backfilled birthDate is intakeDate minus age", rows[0]?.birthDate === FIXTURES[0][3], rows[0]?.birthDate);
    const created = await p.pet.create({ data: { id: "pet-new", ...newPet, birthDate: "2025-09-22", birthDateIsEstimate: false } });
    check("P5 after: prisma.pet.create succeeds without age/ageCategory", created.id === "pet-new");
    const updated = await p.pet.update({ where: { id: FIXTURES[0][0] }, data: { isArchived: true } });
    check("P6 after: prisma.pet.update (archive) succeeds", updated.isArchived === true);
    await p.$disconnect();

    // Is relaxing age/ageCategory load-bearing, or dead weight in the file? Put the NOT NULL
    // back and ask the same client. Note what Prisma reports: it does not name the column.
    await c.query(`DELETE FROM "public"."pets" WHERE "id"='pet-new'`);
    await c.query(`UPDATE "public"."pets" SET "age"=coalesce("age",'2 years'),"ageCategory"=coalesce("ageCategory",'young')`);
    await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "age" SET NOT NULL`);
    await c.query(`ALTER TABLE "public"."pets" ALTER COLUMN "ageCategory" SET NOT NULL`);
    p = client();
    try {
      await p.pet.create({ data: { id: "pet-new2", ...newPet, birthDate: "2025-09-22" } });
      check("P7 birthDate alone is not enough: create still fails while age is NOT NULL", false, "it succeeded, so the DROP NOT NULLs are dead weight");
    } catch (e) {
      check("P7 birthDate alone is not enough: create still fails while age is NOT NULL", /null constraint/i.test(e.message) || e.code === "P2011", (e.message.match(/Null constraint[^\n]*/) || [""])[0]);
    }
    await p.$disconnect();
  }
}

// A skip is not a pass. The Prisma group is the only skippable one and it carries the strongest
// evidence here, so losing it has to change the exit code, not just add a word to the summary.
if (skipped) console.log(`\n${skipped} check(s) SKIPPED -- read the reason above; this run did not prove what a full one proves.`);
console.log(`\n${failures ? `${failures} FAILED` : skipped ? "no failures, but checks were skipped" : "all checks passed"}`);
await c.end();
try {
  await server.stop();
} catch {
  // Windows holds the data directory open briefly; the directory is a mkdtemp under the OS temp
  // dir and is not reused, so a failed teardown is not a failed rehearsal.
}
process.exit(failures || skipped ? 1 : 0);
