/**
 * Which session a command acts for, and finding and reading its transcript, for the agent scripts
 * that look at one session rather than all of them (`meter`, `orient`, `recall`, `ledger
 * handoff`). `usage`, which reads them all, keeps its own streaming reader.
 *
 * A transcript is `<projects>/<folder>/<session>.jsonl`, one JSON record per line, and its
 * subagents' are `<projects>/<folder>/<session>/subagents/*.jsonl`. Lines are split on "\n" only:
 * JSON allows a raw U+2028 inside a string, and splitting there cut 78 records in half once
 * (`usage.mjs`, `jsonlLines`).
 */

import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where Claude Code keeps transcripts, one folder per working directory. */
export const projectsDir = (env = process.env) => join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");

/** A session id short enough to match more than one session by accident is refused. */
export const MIN_PREFIX = 8;

/** A whole session id: a lower-case UUID, as its transcript's file name shows. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A whole session id in the one form the scripts record and compare, lower case, or null for
 * anything that is not one. UUIDs ignore case, so an upper-case copy names the same session.
 */
export function sessionId(value) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SESSION_ID.test(id) ? id : null;
}

const refusal = (message, next) => Object.assign(new Error(message), { next });

/**
 * What a command line names a session by, lower-cased: a whole id, or its first MIN_PREFIX or more
 * characters. Throws with the reason otherwise. It reads nothing, so it can run first.
 */
function nameOf(given) {
  if (typeof given !== "string" || !given.trim()) throw refusal("no session given", "pass --session <id>");
  const name = given.trim().toLowerCase();
  if (!/^[0-9a-f-]+$/.test(name)) throw refusal(`${given} is not a session id`, "pass --session <id>");
  if (name.length < MIN_PREFIX) throw refusal(`a session id needs at least ${MIN_PREFIX} characters, not ${given}`, "pass --session <id>");
  if (!/^[0-9a-f]{8}/.test(name)) throw refusal(`${given} is not a session id`, "pass --session <id>");
  return name;
}

/**
 * The session a command names, as `{ session, path }`: `session` the whole id, as `sessionId`
 * writes it, and `path` its transcript, or null where none is found (Claude Code deletes them after
 * 30 days by default). Every command that takes a session from `--session` or from
 * CLAUDE_CODE_SESSION_ID goes through here, so they all agree on what names a session.
 * CLAUDE_CODE_SESSION_ID is the session's current id: Claude Code 2.1.304 sets it in each shell it
 * starts, from the session's id at that moment (read from its bundle, not watched across a
 * `/clear`).
 *
 * A prefix of MIN_PREFIX or more characters stands for the one session whose transcript it starts,
 * so it needs that transcript. Throws, with the reason and a `next` step, when nothing is named,
 * the name is not a session id or the start of one, or a prefix is too short, names several
 * sessions or names none.
 */
export function resolveSession(given, dir) {
  const name = nameOf(given);
  const found = findTranscript(dir, name);
  if (found) return found;
  if (SESSION_ID.test(name)) return { session: name, path: null };
  throw refusal(`no transcript of session ${given} here, and a prefix needs one to stand for a whole id`, "pass the session's whole id");
}

/**
 * The session a command was given: `--session`, else CLAUDE_CODE_SESSION_ID, for
 * `resolveSession`. Throws when neither is set or what is set cannot
 * name a session. It reads nothing, so a command can refuse before it reads a body or walks the
 * transcript folders.
 *
 * @param {string | undefined} flag
 * @param {Record<string, string | undefined>} [env]
 */
export function givenSession(flag, env = process.env) {
  const given = flag ?? env.CLAUDE_CODE_SESSION_ID;
  if (flag === undefined && (typeof given !== "string" || !given.trim())) throw refusal("no session: CLAUDE_CODE_SESSION_ID is not set", "pass --session <id>");
  nameOf(given);
  return given;
}

/**
 * The fields a hook event's stdin carries that these scripts read: `event`, `session` (as
 * `sessionId` reads it, null when there is none), `transcript`, and `subagent`, set when a
 * subagent's tool call fired it. Throws when the input is not JSON, or names a session with
 * something that is not a session id, which would be Claude Code changing its format.
 */
export function hookEvent(stdin) {
  const input = JSON.parse(stdin) ?? {};
  const session = sessionId(input.session_id);
  const blank = input.session_id == null || (typeof input.session_id === "string" && !input.session_id.trim());
  if (!blank && !session) throw new Error(`the hook event's session_id is not a session id: ${JSON.stringify(input.session_id)}`);
  return {
    event: input.hook_event_name,
    session,
    transcript: typeof input.transcript_path === "string" && input.transcript_path ? input.transcript_path : null,
    subagent: Boolean(input.agent_id),
  };
}

/**
 * The transcript of one session, by its id or a prefix of one (`resolveSession` checks which it is
 * given), searched across every project folder, since a session's folder is named after the directory it started
 * in and that is not known here. Returns `{ session, path }`, or null when there is none.
 * Throws when a prefix names more than one session.
 */
export function findTranscript(dir, id) {
  if (!id || !existsSync(dir)) return null;
  const found = new Map();
  for (const folder of readdirSync(dir)) {
    let names;
    try {
      names = readdirSync(join(dir, folder));
    } catch {
      continue; // a file, not a folder
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const session = name.slice(0, -".jsonl".length);
      if (!session.startsWith(id)) continue;
      const path = join(dir, folder, name);
      // A session written in two folders keeps the copy written last.
      const previous = found.get(session);
      if (!previous || statSync(path).mtimeMs > statSync(previous).mtimeMs) found.set(session, path);
    }
  }
  if (found.has(id)) return { session: id, path: found.get(id) };
  if (found.size > 1) throw refusal(`${id} names ${found.size} sessions: ${[...found.keys()].slice(0, 3).join(", ")}`, "pass more of the session's id");
  const [entry] = found;
  return entry ? { session: entry[0], path: entry[1] } : null;
}

/** The subagent transcripts of the session whose transcript is `path`. */
export function subagentTranscripts(path) {
  const dir = join(path.slice(0, -".jsonl".length), "subagents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(dir, name));
}

/** Records from JSONL text; a line that does not parse (one still being written) is skipped. */
export function parseRecords(text) {
  const records = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A torn line: the first of a tail read, or the last while it is being written.
    }
  }
  return records;
}

/** Every record of a transcript. */
export const readRecords = (path) => parseRecords(readFileSync(path, "utf8"));

/**
 * The records in the last `bytes` of a transcript, and whether that was the whole file. The first
 * line of a partial read is dropped, since it starts mid-record (and possibly mid-character).
 */
export function readTail(path, bytes) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    let read = 0;
    while (read < buffer.length) {
      const n = readSync(fd, buffer, read, buffer.length - read, start + read);
      if (!n) break;
      read += n;
    }
    let text = buffer.subarray(0, read).toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return { records: parseRecords(text), whole: start === 0 };
  } finally {
    closeSync(fd);
  }
}
