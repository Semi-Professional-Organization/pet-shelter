#!/usr/bin/env node
/**
 * Cross-reference guard for the numbered invariants.
 *
 * Nine invariants used to live under `## Invariants` in CLAUDE.md and are cited by number
 * across the agents, skills, templates and the hook. Numbered cross-references are the most
 * fragile shape a duplicated rule can take: the citation site and the definition site are
 * different files, so a rewrite of the definition file leaves every citation pointing at
 * nothing, and nothing errors. That is exactly what happened on 2026-09-05 — a CLAUDE.md
 * rewrite deleted all nine while the replacement text itself still cited two of them.
 *
 * Adapted from the idea in Ponytail's `scripts/check-rule-copies.js`
 * (github.com/DietrichGebert/ponytail, MIT, Copyright (c) 2026 DietrichGebert), which pins
 * invariant substrings across the eight copies of its ruleset. Theirs asserts presence of a
 * phrase; this asserts that a citation resolves, which is the shape this repo actually uses.
 *
 * Two rules make this a guard rather than furniture:
 *
 *   1. It DISCOVERS its inputs (`git ls-files`) instead of being handed a list. A guard given
 *      a hardcoded file list cannot see the copy that was added after it was written — which
 *      is the duplication it exists to catch. See tasks/decisions/ and the auto-memory note
 *      `guard-must-read-every-copy`.
 *   2. It asserts a FLOOR. If the corpus or the reference regex breaks, the natural failure
 *      mode is "found nothing, therefore nothing is wrong" — a green guard that checks air.
 *      Below the floor it fails loudly instead.
 *
 * LIVE vs ARCHIVE: `tasks/decisions/` and `docs/tasks/` record what was true when written and
 * are expected to cite invariants that later changed. They are reported, never fatal. Files
 * that steer current behaviour are fatal.
 *
 *     node scripts/check-doc-invariants.mjs
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Below these, assume the scanner broke rather than that the repo is clean.
 *
 * The reference floor is deliberately low. Once the live citations were rewritten in words,
 * the only ones left are in archived records, and that count legitimately shrinks as records
 * age out — a high floor would fail on a tidy-up. The regex itself is pinned directly by the
 * test against `citedNumbers`, which is the check that actually matters; this floor only
 * catches the corpus going empty.
 */
const FLOOR_FILES = 100;
const FLOOR_REFERENCES = 5;

/** Records of a past decision. They cite the invariants of their day, correctly. */
const ARCHIVE = [/^tasks\/decisions\//, /^tasks\/archive\//, /^docs\/tasks\//, /^docs\/archives\//];

/**
 * This guard and its test necessarily spell out the citations they hunt for — in the regex,
 * in the prose above it, and in the parser fixtures. Without this they flag themselves, which
 * is noise on every run and would have made the first green run impossible. Kept to exactly
 * two paths, and asserted in the test, so it cannot quietly grow into a way to silence a real
 * finding.
 */
const SELF = ["scripts/check-doc-invariants.mjs", "tests/unit/docInvariants.test.ts"];

const SCANNED = /\.(md|mjs|ts|tsx)$/;

/** "invariant 4", "invariants 1 and 7", "Invariant 9" — one match per cited number. */
const REFERENCE = /\binvariants?\s+(\d+(?:\s*(?:,|and|–|-)\s*\d+)*)/gi;

const isArchive = (file) => ARCHIVE.some((r) => r.test(file));

function repoFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && SCANNED.test(f) && !SELF.includes(f));
}

/**
 * Definitions are the numbered list under an `## Invariants` heading. Deliberately not keyed
 * to CLAUDE.md by path: if the invariants move to their own file, this keeps working, and a
 * second copy appearing somewhere else is itself reported as a duplicate definition.
 */
function collectDefinitions(files) {
  const defs = new Map();
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    const section = text.split(/^##\s+/m).find((s) => /^Invariants\b/i.test(s));
    if (!section) continue;
    // Stop at the next heading so a numbered list further down the file is not swept in.
    const body = section.split(/^#{1,6}\s+/m)[0];
    for (const m of body.matchAll(/^(\d+)\.\s+(.+)$/gm)) {
      const n = Number(m[1]);
      if (!defs.has(n)) defs.set(n, []);
      defs.get(n).push({ file, text: m[2].trim() });
    }
  }
  return defs;
}

/**
 * Every invariant number cited in one line, with the citation that produced it.
 * "invariants 1 and 7" is two citations, not one — that was the first thing the prototype
 * got wrong.
 *
 * Exported so the test asserts on THIS function instead of on its own copy of the regex.
 * A test that reimplements the thing it checks stays green while the shipped code is broken,
 * which is this repo's most frequent defect shape wearing a lab coat.
 */
export function citedNumbers(line) {
  const out = [];
  for (const m of String(line ?? "").matchAll(REFERENCE)) {
    for (const num of m[1].split(/\s*(?:,|and|–|-)\s*/)) {
      out.push({ number: Number(num), raw: m[0].trim() });
    }
  }
  return out;
}

function collectReferences(files) {
  const refs = [];
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      for (const c of citedNumbers(line)) refs.push({ file, line: i + 1, ...c });
    });
  }
  return refs;
}

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null; // deleted between ls-files and now, or unreadable
  }
}

export function audit() {
  const files = repoFiles();
  const definitions = collectDefinitions(files);
  const references = collectReferences(files);
  const dangling = references.filter((r) => !definitions.has(r.number));
  return {
    files,
    definitions,
    references,
    danglingLive: dangling.filter((r) => !isArchive(r.file)),
    danglingArchive: dangling.filter((r) => isArchive(r.file)),
    duplicateDefinitions: [...definitions].filter(([, sites]) => sites.length > 1),
  };
}

function main() {
  const a = audit();
  const problems = [];

  if (a.files.length < FLOOR_FILES) {
    problems.push(
      `FLOOR: scanned ${a.files.length} files, expected >= ${FLOOR_FILES}. ` +
        "The corpus, not the repo, is what broke — check the git ls-files call.",
    );
  }
  if (a.references.length < FLOOR_REFERENCES) {
    problems.push(
      `FLOOR: found ${a.references.length} invariant references, expected >= ${FLOOR_REFERENCES}. ` +
        "A guard that finds nothing reports everything as fine — check the REFERENCE regex.",
    );
  }

  const defined = [...a.definitions.keys()].sort((x, y) => x - y);
  console.log(`scanned ${a.files.length} tracked files`);
  console.log(`invariants defined: ${defined.length ? defined.join(", ") : "(none)"}`);
  // Say which number this is. It counts UNRESOLVED archive citations, and reading it as
  // "how many citations are archival" inverts the meaning when the count is 0.
  console.log(
    `invariant references: ${a.references.length}, ` +
      `unresolved: ${a.danglingLive.length} live + ${a.danglingArchive.length} archived`,
  );

  for (const [n, sites] of a.duplicateDefinitions) {
    problems.push(`invariant ${n} is defined in ${sites.length} places: ${sites.map((s) => s.file).join(", ")}`);
  }

  if (a.danglingLive.length) {
    console.log(`\n${a.danglingLive.length} live reference(s) point at an invariant nothing defines:\n`);
    for (const r of a.danglingLive) {
      // Name the unresolved number, not just the citation: "invariants 1 and 7" is two
      // references and printing the raw text twice reads like a duplicate row.
      const cite = r.raw.toLowerCase() === `invariant ${r.number}` ? "" : `  (in "${r.raw}")`;
      console.log(`  ${r.file}:${r.line}  invariant ${r.number}${cite}`);
    }
    problems.push(
      `${a.danglingLive.length} live invariant reference(s) do not resolve. ` +
        "Either restore the definitions or rewrite the citations — a rule cited by number " +
        "and defined nowhere is not a rule.",
    );
  }

  if (a.danglingArchive.length) {
    console.log(
      `\n${a.danglingArchive.length} reference(s) in archived records also do not resolve. ` +
        "Expected — they cite the invariants of their day. Not an error.",
    );
  }

  if (problems.length) {
    console.error("\n" + problems.map((p) => `ERROR: ${p}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("\nOK: every live invariant reference resolves.");
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-doc-invariants.mjs")) {
  main();
}
