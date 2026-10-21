/**
 * `node scripts/agent.mjs recall <term>`: get detail back from the session that wrote a hand-off.
 *
 * A hand-off carries what its writer chose to say; everything else stays in that session's
 * transcript. `recall` searches it, subagents included, for a phrase and prints the matching
 * messages, tool calls and tool results, trimmed, so only what is asked for enters the new
 * session's context. Claude Code deletes transcripts after 30 days by default, so the hand-off and
 * the rest of the ledger are the durable record, and this is for the days after a hand-off.
 *
 * Read-only. The session is `--session`, or else the one the hand-offs in this checkout record,
 * other than the current session, when they name only one.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readHandoffs } from "./handoff.mjs";
import { git } from "./usage.mjs";
import { findTranscript, projectsDir, readRecords, subagentTranscripts } from "./transcript.mjs";

/** Lines of matches shown; the rest are in the log. */
export const SHOWN = 25;

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((block) => block?.type === "text")
          .map((block) => String(block.text))
          .join("\n")
      : "";

let unnamed = 0;

/**
 * The searchable pieces of one transcript's records: what a person or a parent agent wrote, what
 * the model wrote and thought, the tool calls it made and what they returned. Meta records (the
 * harness's reminders and injected files) are left out, since every session carries them.
 */
export function piecesOf(records, { sub = false } = {}) {
  const pieces = [];
  const tools = new Map();
  const who = (kind) => (sub ? `sub ${kind}` : kind);
  for (const record of records) {
    if (!record || typeof record !== "object" || record.isMeta) continue;
    const at = record.timestamp;
    // A record with no uuid cannot be a fork's copy of another, so it gets an id nothing shares.
    const id = record.uuid ?? `no-uuid-${++unnamed}`;
    if (record.type === "attachment" && record.attachment?.type === "queued_command") {
      pieces.push({ at, id, kind: who("user"), text: textOf(record.attachment.prompt) });
      continue;
    }
    const content = record.message?.content;
    if (record.type === "user") {
      if (typeof content === "string") pieces.push({ at, id, kind: who("user"), text: content });
      for (const [i, block] of (Array.isArray(content) ? content : []).entries()) {
        if (block?.type === "text") pieces.push({ at, id: `${id}:${i}`, kind: who("user"), text: String(block.text) });
        else if (block?.type === "tool_result") {
          const tool = tools.get(block.tool_use_id) ?? "tool";
          pieces.push({ at, id: `${id}:${i}`, kind: who(`${tool} result`), text: textOf(block.content) });
        }
      }
    } else if (record.type === "assistant") {
      for (const [i, block] of (Array.isArray(content) ? content : []).entries()) {
        if (block?.type === "text") pieces.push({ at, id: `${id}:${i}`, kind: who("assistant"), text: String(block.text) });
        else if (block?.type === "thinking" && block.thinking) pieces.push({ at, id: `${id}:${i}`, kind: who("thinking"), text: String(block.thinking) });
        else if (block?.type === "tool_use") {
          tools.set(block.id, String(block.name));
          const input = block.input ?? {};
          pieces.push({ at, id: `${id}:${i}`, kind: who(String(block.name)), text: typeof input.command === "string" ? input.command : JSON.stringify(input) });
        }
      }
    }
  }
  return pieces;
}

/** The text around the first match, on one line, with an ellipsis where it was cut. */
export function snippet(text, at, length, { before = 100, after = 160 } = {}) {
  const from = Math.max(0, at - before);
  const to = Math.min(text.length, at + length + after);
  const middle = text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${middle}${to < text.length ? "…" : ""}`;
}

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Pieces that contain `term`, ignoring case, in time order, each once. The match is found in the
 * text as written, since lower-casing can change a string's length ("İ" becomes two characters)
 * and move every offset after it.
 */
export function search(pieces, term) {
  const pattern = new RegExp(literal(term), "iu");
  const seen = new Set();
  const hits = [];
  for (const piece of pieces) {
    if (seen.has(piece.id)) continue;
    seen.add(piece.id);
    const found = pattern.exec(piece.text);
    if (found) hits.push({ ...piece, match: found.index, length: found[0].length });
  }
  return hits.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

const stamp = (iso) => (typeof iso === "string" && iso.length >= 16 ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z` : "??-?? ??:??Z");

const HELP = `usage: node scripts/agent.mjs recall <term> [--session <id>]

Searches a previous session's transcript, subagents included, for <term> (a phrase, any case)
and prints the matching messages, tool calls and tool results, trimmed: the last ${SHOWN} here, all
of them in the log. Read-only.

  --session <id>  the session to search; a prefix of 8 or more characters will do. Default: the
                  session the hand-offs in tasks/open/HANDOFF-*.md record, other than this one,
                  when they name only one

Exit codes: 0 found, 1 no match, 2 could not run.`;

export function parseArgs(argv) {
  const opts = { session: undefined, help: false, words: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--session") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error("--session needs a value");
      opts.session = v;
    } else if (a.startsWith("--")) throw new Error(`unknown argument: ${a}`);
    else opts.words.push(a);
  }
  return opts;
}

export async function main(argv, io = {}) {
  const out = io.out ?? process.stdout;
  const env = io.env ?? process.env;
  const cwd = io.cwd ?? process.cwd();
  const tmp = io.tmp ?? tmpdir();
  const fail = (code, verdict, message, next) => {
    out.write(`recall: ${verdict} ${message}\n${next ? `next: ${next}\n` : ""}`);
    return code;
  };
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    return fail(2, "ERROR", error.message, "node scripts/agent.mjs recall --help");
  }
  if (opts.help) {
    out.write(`${HELP}\n`);
    return 0;
  }
  const term = opts.words.join(" ").trim();
  if (!term) return fail(2, "ERROR", "nothing to search for", "node scripts/agent.mjs recall <term>");

  let id = opts.session;
  if (!id) {
    // Threads share a checkout, so with more than one session's hand-off here the newest is not
    // necessarily the one being continued.
    const top = git(cwd, ["rev-parse", "--show-toplevel"]);
    const others = top ? readHandoffs(top).filter((h) => h.session && h.session !== env.CLAUDE_CODE_SESSION_ID) : [];
    const sessions = new Set(others.map((h) => h.session));
    if (!sessions.size) return fail(2, "ERROR", "no hand-off from another session in tasks/open/ names a session", "pass --session <id>");
    if (sessions.size > 1) {
      const listed = others.map((h) => `${h.file} (${h.session.slice(0, 8)})`).join(", ");
      return fail(2, "ERROR", `hand-offs from ${sessions.size} other sessions are waiting here: ${listed}`, "pass --session <id> from the hand-off you are continuing");
    }
    [id] = sessions;
  }
  let found;
  try {
    found = findTranscript(projectsDir(env), id);
  } catch (error) {
    return fail(2, "ERROR", error.message);
  }
  if (!found) return fail(2, "ERROR", `no transcript for session ${id} in ${projectsDir(env)}; Claude Code may have deleted it`);

  const pieces = [
    ...piecesOf(readRecords(found.path)),
    ...subagentTranscripts(found.path).flatMap((path) => piecesOf(readRecords(path), { sub: true })),
  ];
  const hits = search(pieces, term);
  const short = found.session.slice(0, 8);
  if (!hits.length) return fail(1, "FAIL", `no match for "${term}" in session ${short}`);

  const key = createHash("sha256").update(`${found.session}\0${term}`).digest("hex").slice(0, 8);
  const log = join(tmp, `agent-recall-${short}-${key}.txt`);
  let logged = true;
  try {
    // Transcript text can hold anything a tool printed, so a new log is readable by its owner
    // only. ceiling: one user per temp folder, as for the meter's markers; a log another user
    // created first under the same name keeps its own mode.
    writeFileSync(
      log,
      hits.map((h) => `${h.at} ${h.kind}: ${snippet(h.text, h.match, h.length, { before: 400, after: 800 })}`).join("\n\n") + "\n",
      { mode: 0o600 },
    );
  } catch {
    logged = false;
  }
  const shown = hits.slice(-SHOWN);
  out.write(
    [
      `recall: PASS ${hits.length} ${hits.length === 1 ? "match" : "matches"} for "${term}" in session ${short}${hits.length > SHOWN ? `, the last ${SHOWN} shown` : ""}`,
      ...shown.map((h) => `${stamp(h.at)} ${h.kind}: ${snippet(h.text, h.match, h.length)}`),
      ...(logged ? [`log: ${log}`] : []),
    ].join("\n") + "\n",
  );
  return 0;
}
