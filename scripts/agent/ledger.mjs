/**
 * `node scripts/agent.mjs ledger`: read and write `tasks/` without opening the big files. This
 * pull request brings one subcommand, `handoff`; the rest of the plan's `ledger` (find, todo, new,
 * claim, lint) comes later.
 *
 * `ledger handoff "<title>"` writes the session's hand-off state as `tasks/open/HANDOFF-<slug>.md`
 * for a fresh session to continue from. The body is the agent's own account, read from `--from`
 * or stdin and refused unless it has the six sections in `handoff.mjs`; the command adds what it
 * can find out itself: the session id that `recall` needs, the checkout, and the context size.
 *
 * Writes one file under `tasks/open/`, and never one another session wrote.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { HANDOFF_DIR, HANDOFF_PREFIX, SECTIONS, checkBody, renderHandoff, sessionOf, slugOf } from "./handoff.mjs";
import { readLatest } from "./meter.mjs";
import { describeWhere, whereAmI } from "./orient.mjs";
import { findTranscript, projectsDir } from "./transcript.mjs";

const HELP = `usage: node scripts/agent.mjs ledger handoff "<title>" [--from <file>] [--session <id>]

Writes this session's hand-off state to tasks/open/HANDOFF-<slug>.md, for a fresh session to
continue from. The body comes from --from <file>, or from stdin, in your own words, with these
sections, each with something in it:

${SECTIONS.map(([name, what]) => `  ## ${name.padEnd(22)}${what}`).join("\n")}

The command adds the title, the session id (which recall searches), the branch, HEAD and
uncommitted work, and the context size. It never replaces a hand-off another session wrote;
running it again replaces your own.

From Git Bash:     node scripts/agent.mjs ledger handoff "<title>" <<'EOF'
                   ## Decided
                   ...
                   EOF
From PowerShell:   write the body to a file, then pass --from <file>.

The file is not committed. Commit it with the branch's work when the next session will start in
another checkout; the session that finishes the work deletes it.

  --session <id>  the session handing off (default: CLAUDE_CODE_SESSION_ID)

Exit codes: 0 written, 1 refused (a missing section, another session's file), 2 could not run.`;

export function parseArgs(argv) {
  const opts = { sub: undefined, title: undefined, from: undefined, session: undefined, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--from" || a === "--session") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = v;
    } else if (a.startsWith("--")) throw new Error(`unknown argument: ${a}`);
    else rest.push(a);
  }
  [opts.sub, opts.title, ...opts.extra] = rest;
  if (opts.extra.length) throw new Error(`one title, in quotes: got ${rest.length - 1} words`);
  return opts;
}

/** The date where the person is, as the rest of the ledger is dated, not UTC's. */
export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Where a checkout keeps its line endings: the ledger's own files say. */
function eolOf(top) {
  try {
    return readFileSync(join(top, "tasks", "README.md"), "utf8").includes("\r\n") ? "\r\n" : "\n";
  } catch {
    return "\n";
  }
}

export async function main(argv, io = {}) {
  const out = io.out ?? process.stdout;
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const now = io.now ?? Date.now();
  const say = (verdict, message, next) => out.write(`ledger: ${verdict} ${message}\n${next ? `next: ${next}\n` : ""}`);
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    say("ERROR", error.message, "node scripts/agent.mjs ledger --help");
    return 2;
  }
  if (opts.help || !opts.sub) {
    if (!opts.help) {
      say("ERROR", "no subcommand", "node scripts/agent.mjs ledger --help");
      return 2;
    }
    out.write(`${HELP}\n`);
    return 0;
  }
  if (opts.sub !== "handoff") {
    say("ERROR", `unknown subcommand ${opts.sub}: only handoff exists yet`, "node scripts/agent.mjs ledger --help");
    return 2;
  }
  if (!opts.title || !slugOf(opts.title)) {
    say("ERROR", "a hand-off needs a title with letters or digits", 'node scripts/agent.mjs ledger handoff "<title>" --from <file>');
    return 2;
  }
  const given = opts.session ?? env.CLAUDE_CODE_SESSION_ID;
  if (!given) {
    say("ERROR", "no session: CLAUDE_CODE_SESSION_ID is not set", "pass --session <id>");
    return 2;
  }
  // A prefix stands for the session it starts. The file records the full id, which is what
  // `recall`, `orient` and a later run of this command compare against.
  let found;
  try {
    found = findTranscript(projectsDir(env), given);
  } catch (error) {
    say("ERROR", error.message);
    return 2;
  }
  const session = found?.session ?? given;

  let body;
  try {
    body = opts.from !== undefined ? readFileSync(resolve(cwd, opts.from), "utf8") : (io.stdin ?? (process.stdin.isTTY ? "" : readFileSync(0, "utf8")));
  } catch (error) {
    say("ERROR", `could not read the body: ${error.message}`);
    return 2;
  }
  if (!body.trim()) {
    say("ERROR", "no body: pass --from <file>, or the body on stdin", "node scripts/agent.mjs ledger --help");
    return 2;
  }
  const problems = checkBody(body);
  if (problems.length) {
    say("FAIL", `not written: ${problems.join("; ")}`, "node scripts/agent.mjs ledger --help");
    return 1;
  }

  const w = whereAmI(cwd, { now });
  if (!w) {
    say("ERROR", `${cwd} is not in a git repository`);
    return 2;
  }
  if (!existsSync(join(w.top, HANDOFF_DIR))) {
    say("ERROR", `${w.top} has no ${HANDOFF_DIR}/`);
    return 2;
  }
  const file = `${HANDOFF_DIR}/${HANDOFF_PREFIX}${slugOf(opts.title)}.md`;
  const path = join(w.top, file);
  if (existsSync(path)) {
    const owner = sessionOf(readFileSync(path, "utf8"));
    if (owner !== session) {
      say("FAIL", `${file} was written by session ${owner ?? "unknown"}, not this one`, "choose another title");
      return 1;
    }
  }

  let context = "unknown: no transcript of this session was found.";
  try {
    const reading = found && readLatest(found.path);
    if (reading) context = `${Math.round(reading.ctx / 1000)}K tokens on ${reading.model}.`;
  } catch (error) {
    context = `unknown: ${error.message}.`;
  }
  writeFileSync(
    path,
    renderHandoff({
      title: opts.title.trim(),
      date: localDate(now),
      session,
      where: describeWhere(w),
      context,
      body,
      eol: eolOf(w.top),
    }),
  );
  say("PASS", `wrote ${file}`, `start a fresh session in ${w.top} and tell it: Continue from ${file}`);
  return 0;
}
