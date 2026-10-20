#!/usr/bin/env node
/**
 * Commit message conformance linter.
 *
 * The standard is Chris Beams' seven rules (https://cbea.ms/git-commit/), narrowed
 * to this repo's Conventional Commits grammar. The written standard is
 * `docs/reference/COMMIT_MESSAGES.md`; this file is what enforces it, and the two
 * are meant to be read together. Where they disagree, this file is the truth —
 * a rule that is documented but not implemented is a rule nobody follows.
 *
 * Usage:
 *   node scripts/commit-msg.mjs <file>        # git commit-msg hook interface
 *   node scripts/commit-msg.mjs --stdin       # lint a message on stdin
 *   node scripts/commit-msg.mjs --audit [rev] # report on existing history
 *
 * Exit codes: 0 clean (warnings allowed), 1 at least one error.
 * `--audit` exits 0 regardless unless `--strict` is passed, because the history
 * predates the standard and failing on it would make the command useless.
 */

/** Conventional Commit types. Measured from this repo's own history plus the
 *  standard set; see `docs/reference/COMMIT_MESSAGES.md` §2. */
export const TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

/**
 * Trailer tokens this repo actually uses, measured from history:
 *   Co-Authored-By 107, Ledger 16, Verified 9, Refs 6, Deferred 2, Note 2.
 * Trailers are exempt from the 72-column body wrap because their payload is a
 * path, a URL or an identity that cannot be broken across lines.
 */
export const TRAILER_TOKENS = [
  "BREAKING CHANGE",
  "Claude-Session",
  "Closes",
  "Co-Authored-By",
  "Deferred",
  "Fixes",
  "Ledger",
  "Note",
  "Refs",
  "Reverts",
  "Signed-off-by",
  "Verified",
];

/**
 * Rule 5 is "use the imperative mood", and the only mechanical form of that test
 * is a blocklist of the moods it is not. Two shapes are caught:
 *
 *   past tense / third person — "Added", "Adds", "Fixed", "Fixes"
 *   gerund                    — "Adding", "Fixing"
 *
 * A bare `-ed$` or `-s$` regex is wrong: "seed", "embed", "proceed", "feed" and
 * "needs" are all legitimate imperative openers in this codebase. So the list is
 * explicit. It is deliberately incomplete — it exists to catch the common slips,
 * not to prove grammar. Beams' own test ("If applied, this commit will …") is a
 * human's job, and the standard says so.
 */
export const NON_IMPERATIVE = new Set(
  [
    "added", "adds", "adding",
    "allowed", "allows", "allowing",
    "applied", "applies", "applying",
    "bumped", "bumps", "bumping",
    "changed", "changes", "changing",
    "cleaned", "cleans", "cleaning",
    "corrected", "corrects", "correcting",
    "created", "creates", "creating",
    "deleted", "deletes", "deleting",
    "documented", "documents", "documenting",
    "dropped", "drops", "dropping",
    "enabled", "enables", "enabling",
    "ensured", "ensures", "ensuring",
    "extracted", "extracts", "extracting",
    "fixed", "fixes", "fixing",
    "handled", "handles", "handling",
    "implemented", "implements", "implementing",
    "improved", "improves", "improving",
    "included", "includes", "including",
    "introduced", "introduces", "introducing",
    "made", "makes", "making",
    "migrated", "migrates", "migrating",
    "moved", "moves", "moving",
    "prevented", "prevents", "preventing",
    "refactored", "refactors", "refactoring",
    "removed", "removes", "removing",
    "renamed", "renames", "renaming",
    "replaced", "replaces", "replacing",
    "resolved", "resolves", "resolving",
    "returned", "returns", "returning",
    "supported", "supports", "supporting",
    "updated", "updates", "updating",
    "used", "uses", "using",
    "wrote", "writes", "writing",
  ],
);

/** Subjects git or a rebase generates. Beams exempts merges; the rest are
 *  autosquash markers that never survive to permanent history. */
const GENERATED_SUBJECT = /^(Merge |Revert |fixup!|squash!|amend!)/;

export const SUBJECT_SOFT_LIMIT = 50;
export const SUBJECT_HARD_LIMIT = 72;
export const BODY_WRAP = 72;

const CONVENTIONAL = /^([a-z]+)(?:\(([^()]+)\))?(!)?: (.+)$/;

/**
 * Strip what git itself adds to the buffer, so the hook lints the message the
 * author wrote rather than the template around it.
 */
function stripGitCruft(raw) {
  const text = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const scissors = text.indexOf("\n# ------------------------ >8");
  const withoutDiff = scissors === -1 ? text : text.slice(0, scissors);
  // `git commit -F` — the path AGENTS.md mandates — uses cleanup=whitespace, which
  // KEEPS comment lines; only an editor session uses cleanup=strip. Filtering every
  // `#` line made this lint different bytes than git commits: a body of `#` lines
  // reported "no body", and a 90-column `#` line escaped rule 6 entirely.
  //
  // Git appends its template as a trailing comment block, and only in editor mode.
  // Drop that block, identified by the lines git itself writes, and treat every other
  // `#` line as what it is — text the author wrote and git will commit.
  const lines = withoutDiff.split("\n");
  let cut = lines.length;
  while (cut > 0 && (lines[cut - 1].startsWith("#") || lines[cut - 1].trim() === "")) {
    cut -= 1;
  }
  const trailing = lines.slice(cut);
  const isGitTemplate = trailing.some((line) =>
    /^#\s*(Please enter|On branch|Changes to be committed|Changes not staged|Untracked files|Your branch|It looks like|Author:|Date:)/.test(
      line,
    ),
  );
  return (isGitTemplate ? lines.slice(0, cut) : lines).join("\n");
}

function looksLikeTrailer(line) {
  return TRAILER_TOKENS.some(
    (token) => line === `${token}:` || line.startsWith(`${token}: `),
  );
}

/**
 * Indices of the trailing metadata block: the contiguous run of trailer lines at
 * the very end of the body.
 *
 * Matching a trailer token anywhere in the body exempted ordinary prose from the
 * wrap rule for opening with `Note: ` or `Refs: `, and excluded that prose from
 * the rule-7 body test — so a real explanation was reported as no body at all.
 * A trailer is a position, not a prefix.
 */
function trailerIndices(body) {
  const set = new Set();
  for (let i = body.length - 1; i >= 0; i -= 1) {
    if (body[i].trim() === "") continue;
    if (!looksLikeTrailer(body[i])) break;
    set.add(i);
  }
  return set;
}

/**
 * A body line is exempt from the wrap when no wrapping could fix it: it sits in
 * a fenced or indented code block, it is a trailer, or it carries a single
 * unbreakable token (a URL or a path) longer than the limit on its own.
 */
function unwrappable(line, limit) {
  const tokens = line.trim().split(/\s+/);
  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a), "");
  if (longest.length <= limit) return false;
  // The unbreakable token wraps onto a line of its own; whatever else the line
  // carries still has to fit. Exempting the WHOLE line let 300 columns of
  // ordinary prose through for ending in a URL, which
  // docs/reference/COMMIT_MESSAGES.md §5 explicitly refuses.
  return line.length - longest.length <= limit;
}

/**
 * Lint one commit message.
 *
 * @param {string} raw
 * @returns {{ findings: Array<{rule: string, level: "error"|"warning", line: number, message: string}>,
 *             subject: string, skipped: boolean }}
 */
export function lintCommitMessage(raw) {
  const findings = [];
  const add = (rule, level, line, message) =>
    findings.push({ rule, level, line, message });

  const text = stripGitCruft(raw);
  const all = text.split("\n");

  // Leading blank lines are not the author's subject. git strips them; so do we,
  // but we remember the offset so reported line numbers point at the real file.
  let start = 0;
  while (start < all.length && all[start].trim() === "") start += 1;
  const offset = start;
  const lines = all.slice(start);

  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  // Git's cleanup removes trailing whitespace from every line, in both `strip` and
  // `whitespace` mode, so the subject that lands is the trimmed one. Linting the raw
  // line let a single trailing space hide a rule-4 period and inflate rule 2's count.
  const subject = (lines[0] ?? "").replace(/[ \t]+$/, "");

  if (lines.length === 0) {
    add("empty", "error", 1, "the commit message is empty");
    return { findings, subject: "", skipped: false };
  }

  if (GENERATED_SUBJECT.test(subject)) {
    return { findings, subject, skipped: true };
  }

  // ---------------------------------------------------------------- stray-delimiter
  // Five commits in this repo's history have a literal `@` as line 1 and the real
  // subject on line 2 — a PowerShell here-string (`@'...'@`) whose delimiter was
  // passed to `git commit -m`. `git log --oneline` shows those five as "@".
  if (/^@['"]?$/.test(subject.trim()) || /^['"]@$/.test(subject.trim())) {
    add(
      "stray-delimiter",
      "error",
      offset + 1,
      `subject is the shell delimiter ${JSON.stringify(subject)}, not a message — ` +
        "a here-string leaked into `git commit`; write the message to a file and use `git commit -F`",
    );
  }

  // ---------------------------------------------------------------- rule 1
  if (lines.length > 1 && lines[1].trim() !== "") {
    add(
      "blank-line",
      "error",
      offset + 2,
      "rule 1: separate subject from body with a blank line — line 2 is not blank, " +
        "so git treats the whole block as the subject",
    );
  }

  // ---------------------------------------------------------------- conventional grammar
  const match = CONVENTIONAL.exec(subject);
  let summary = subject;
  if (!match) {
    add(
      "conventional",
      "error",
      offset + 1,
      "subject must be `type(scope): summary` — see docs/reference/COMMIT_MESSAGES.md §2",
    );
  } else {
    const [, type, scope, , rest] = match;
    summary = rest;
    if (!TYPES.includes(type)) {
      add(
        "conventional-type",
        "error",
        offset + 1,
        `unknown type "${type}" — allowed: ${TYPES.join(", ")}`,
      );
    }
    // Exactly one scope, kebab-case. `/` used to be accepted, so `fix(pets/donations)`
    // passed while the comma form of the same defect was rejected; a trailing hyphen
    // passed too.
    if (scope !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope)) {
      add(
        "conventional-scope",
        "error",
        offset + 1,
        `scope "${scope}" must be lowercase kebab-case`,
      );
    }
  }

  // ---------------------------------------------------------------- rule 2
  if (subject.length > SUBJECT_HARD_LIMIT) {
    add(
      "subject-length",
      "error",
      offset + 1,
      `rule 2: subject is ${subject.length} chars; ${SUBJECT_HARD_LIMIT} is the hard limit ` +
        "(GitHub truncates past it, and `git log --oneline` wraps)",
    );
  } else if (subject.length > SUBJECT_SOFT_LIMIT) {
    add(
      "subject-length",
      "warning",
      offset + 1,
      `rule 2: subject is ${subject.length} chars; aim for ${SUBJECT_SOFT_LIMIT}. ` +
        "If it will not fit, the commit is usually doing two things",
    );
  }

  // ---------------------------------------------------------------- rule 3
  // Beams capitalizes the subject. Conventional Commits fixes the first token as a
  // lowercase machine keyword, so the rule lands on the summary after the colon —
  // that is the part a human reads as the title.
  if (summary && /^[a-z]/.test(summary)) {
    add(
      "capitalize",
      "error",
      offset + 1,
      `rule 3: capitalize the summary — "${summary.slice(0, 24)}…" should start uppercase ` +
        "(the type prefix stays lowercase; it is a machine token)",
    );
  }

  // ---------------------------------------------------------------- rule 4
  if (/[.]$/.test(subject) && !/\.\.\.$/.test(subject)) {
    add(
      "no-period",
      "error",
      offset + 1,
      "rule 4: do not end the subject with a period — it is a title, not a sentence",
    );
  }

  // ---------------------------------------------------------------- rule 5
  // Skip leading punctuation — a backtick-quoted identifier, a quote, an em-dash — so
  // the mood check still sees the first real word. Rule 3 deliberately exempts those
  // openers from capitalization (tested); rule 5 has no such exemption and never did.
  const firstWord = (summary.replace(/^[^A-Za-z]+/, "").match(/^[A-Za-z']+/) ?? [""])[0]
    .toLowerCase();
  if (firstWord && NON_IMPERATIVE.has(firstWord)) {
    add(
      "imperative",
      "error",
      offset + 1,
      `rule 5: use the imperative mood — "${firstWord}" is not a command. ` +
        'Test it: "If applied, this commit will <summary>"',
    );
  }

  // ---------------------------------------------------------------- rules 6 and 7
  // When rule 1 fired, line 2 is the body's first line, not a blank separator.
  // Slicing past it unconditionally meant that line was never wrap-checked and the
  // message was reported as having no body while plainly having one — so an author
  // fixed the blank line, re-ran, and only then met the wrap error.
  const bodyStart = lines.length > 1 && lines[1].trim() !== "" ? 1 : 2;
  const body = lines.slice(bodyStart);
  const firstBodyLineNo = offset + bodyStart + 1;
  const trailers = trailerIndices(body);
  const prose = body.filter(
    (line, index) => line.trim() !== "" && !trailers.has(index),
  );

  if (prose.length === 0) {
    add(
      "no-body",
      "warning",
      offset + 1,
      "rule 7: no body, so the commit does not say why. Acceptable only when the " +
        "subject is the whole truth (a typo, a rename)",
    );
  }

  // An unclosed fence used to latch `inFence` on and exempt every remaining line —
  // trailers included — from rule 6. Count the fences first: if they do not pair, say
  // so and lint every line rather than trusting a state machine that cannot recover.
  const fencesBalanced =
    body.filter((line) => /^\s*```/.test(line)).length % 2 === 0;
  if (!fencesBalanced) {
    add(
      "unclosed-fence",
      "error",
      firstBodyLineNo,
      "an unclosed \`\`\` fence would exempt the rest of the body from rule 6 — close it",
    );
  }

  let inFence = false;
  body.forEach((line, index) => {
    const lineNo = firstBodyLineNo + index;
    if (fencesBalanced && /^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (trailers.has(index)) return;
    if (/^ {4,}|^\t/.test(line)) return; // indented code block
    // Git's cleanup strips trailing whitespace from every line, so the line that
    // lands is the trimmed one — the same correction rule 2 already makes for the
    // subject. Measuring it raw rejected a legal 70-column line for carrying
    // spaces any editor without trim-on-save leaves behind.
    const stored = line.replace(/[ \t]+$/, "");
    if (stored.length <= BODY_WRAP) return;
    if (unwrappable(stored, BODY_WRAP)) return;
    add(
      "body-wrap",
      "error",
      lineNo,
      `rule 6: wrap the body at ${BODY_WRAP} columns — this line is ${stored.length}`,
    );
  });

  return { findings, subject, skipped: false };
}

/* ------------------------------------------------------------------ CLI ---- */

function format(findings, { subject, sha } = {}) {
  const label = sha ? `${sha.slice(0, 7)} ${subject}` : subject;
  const head = label ? `\n  ${label}\n` : "";
  const rows = findings
    .map((f) => {
      const tag = f.level === "error" ? "error  " : "warning";
      return `    ${tag} ${f.rule.padEnd(18)} line ${f.line}: ${f.message}`;
    })
    .join("\n");
  return `${head}${rows}`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(argv) {
  const { readFileSync } = await import("node:fs");

  if (argv[0] === "--audit") {
    const { execFileSync } = await import("node:child_process");
    const strict = argv.includes("--strict");
    const rev = argv.slice(1).find((a) => !a.startsWith("--")) ?? "HEAD";
    // NUL between records so a message containing blank lines still parses.
    const out = execFileSync(
      "git",
      ["log", "-z", "--no-merges", "--format=%H%n%B", rev],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const records = out.split("\0").filter((r) => r.trim() !== "");
    let clean = 0;
    let skipped = 0;
    const ruleCounts = new Map();
    const details = [];

    for (const record of records) {
      const newline = record.indexOf("\n");
      const sha = record.slice(0, newline).trim();
      const message = record.slice(newline + 1);
      const { findings, subject, skipped: isSkipped } = lintCommitMessage(message);
      if (isSkipped) {
        skipped += 1;
        continue;
      }
      const errors = findings.filter((f) => f.level === "error");
      if (errors.length === 0) clean += 1;
      for (const f of findings) {
        const key = `${f.level}:${f.rule}`;
        ruleCounts.set(key, (ruleCounts.get(key) ?? 0) + 1);
      }
      if (findings.length > 0) details.push(format(findings, { subject, sha }));
    }

    const linted = records.length - skipped;
    if (argv.includes("--verbose")) process.stdout.write(details.join("\n") + "\n");
    process.stdout.write(
      `\ncommit-msg audit of ${rev}: ${linted} commits linted, ${skipped} generated/skipped\n` +
        `  clean (no errors): ${clean}/${linted} (${((clean * 100) / Math.max(linted, 1)).toFixed(0)}%)\n`,
    );
    const sorted = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sorted) {
      process.stdout.write(`  ${key.padEnd(28)} ${count}\n`);
    }
    // `process.exit()` discards buffered stdout, and on POSIX stdout to a pipe — which
    // is what GitHub Actions gives us — is async. The --verbose detail block runs to
    // tens of KB, so exiting here dropped the diagnosis on exactly the failing run.
    process.exitCode = strict && clean < linted ? 1 : 0;
    return;
  }

  // `npm run commit:check` with the path forgotten used to fall through to
  // readStdin(), which never sees EOF on an interactive terminal: no output, no
  // usage, no exit — indistinguishable from a hung linter. Piped input still
  // works without the flag; only the interactive case is refused.
  if (argv.length === 0 && process.stdin.isTTY) {
    process.stderr.write(
      "usage: node scripts/commit-msg.mjs <file>\n" +
        "       node scripts/commit-msg.mjs --stdin\n" +
        "       node scripts/commit-msg.mjs --audit [--strict] [--verbose] [<range>]\n",
    );
    process.exitCode = 1;
    return;
  }

  const raw =
    argv[0] === "--stdin" || argv.length === 0
      ? await readStdin()
      : readFileSync(argv[0], "utf8");

  const { findings, subject, skipped } = lintCommitMessage(raw);
  if (skipped || findings.length === 0) {
    process.exitCode = 0;
    return;
  }

  process.stderr.write(format(findings, { subject }) + "\n");
  const errors = findings.filter((f) => f.level === "error");
  if (errors.length > 0) {
    process.stderr.write(
      "\n  The standard is docs/reference/COMMIT_MESSAGES.md.\n" +
        "  Fix the message, or bypass this once with `git commit --no-verify`.\n\n",
    );
    // Set rather than exit, so the message above is flushed before the process ends.
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

// Only run the CLI when executed directly, so the module stays importable by tests.
const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/commit-msg.mjs");
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`commit-msg: ${error.message}\n`);
    process.exit(1);
  });
}
