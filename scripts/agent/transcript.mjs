/**
 * Finding and reading Claude Code session transcripts, for the agent scripts that look at one
 * session rather than all of them (`meter`, `recall`, `ledger handoff`). `usage`, which reads them
 * all, keeps its own streaming reader.
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

/**
 * The transcript of one session, by its id or a prefix of at least MIN_PREFIX characters, searched
 * across every project folder, since a session's folder is named after the directory it started
 * in and that is not known here. Returns `{ session, path }`, or null when there is none.
 * Throws when a prefix names more than one session.
 */
export function findTranscript(dir, id) {
  if (!id || !existsSync(dir)) return null;
  if (id.length < MIN_PREFIX) throw new Error(`a session id needs at least ${MIN_PREFIX} characters, not ${id}`);
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
  if (found.size > 1) throw new Error(`${id} names ${found.size} sessions: ${[...found.keys()].slice(0, 3).join(", ")}`);
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
