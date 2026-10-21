/**
 * The hand-off file: what a session writes before a fresh one continues its work, read by
 * `orient` (to say one is waiting), by `recall` (for the session that wrote it) and written by
 * `ledger handoff`. One copy of the format, here.
 *
 * A hand-off is an open entry, like a claim: `tasks/open/HANDOFF-<slug>.md`, in the ledger's open
 * shape, never mirrored to a public issue, and deleted by the session that finishes the work
 * (`tasks/README.md`). Its body is the agent's own account in six sections; the header is the
 * part a command can fill in without asking it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const HANDOFF_DIR = "tasks/open";
export const HANDOFF_PREFIX = "HANDOFF-";

/** The sections a hand-off's body must have, each with something in it. */
export const SECTIONS = [
  ["Decided", "what is settled, with the evidence"],
  ["Open", "what is not, and what you would check next"],
  ["Next step", "the one thing the next session does first"],
  ["Paths", "the files and lines that matter"],
  ["Commands and results", "what you ran and what it returned"],
  ["Verified", "what was observed to work, and what was not run"],
];

/** A title as a file name: `HANDOFF-<slug>.md`. Empty when the title has no letters or digits. */
export function slugOf(title) {
  return String(title)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * The header, line by line: written by filling each line in, read back by matching each line
 * against its own pattern and nothing else, so no title or body can be taken for a field. A line
 * that does not match, as in a file edited by hand, reads as unknown.
 */
const HEADER = [
  { field: "title", write: (h) => `# Hand-off: ${h.title}`, read: /^# (?:Hand-off: )?(.+)$/ },
  { write: () => "" },
  { field: "opened", write: (h) => `**Status:** open · opened ${h.date}`, read: /^\*\*Status:\*\* open · opened (\d{4}-\d{2}-\d{2})$/ },
  { write: () => "" },
  {
    field: "session",
    write: (h) => `- **From session:** \`${h.session}\`, whose transcript \`node scripts/agent.mjs recall <term>\` searches.`,
    read: /^- \*\*From session:\*\* `([^`]+)`/,
  },
  { write: (h) => `- **Where:** ${h.where}` },
  { write: (h) => `- **Context at hand-off:** ${h.context}` },
  { write: () => "" },
];

/**
 * What is wrong with a body, as sentences; empty when nothing is. Each section is a "## " heading
 * at the start of a line with something under it. Nothing else in a body matters, since the header
 * is read by position (`readHeader`).
 *
 * ceiling: a code block is read like any other text, so a "## Paths" line pasted inside one counts
 * as that section. That can let a body through, never refuse one.
 */
export function checkBody(body) {
  const counts = new Map();
  let section = null;
  for (const line of String(body).split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      if (!counts.has(section)) counts.set(section, 0);
    } else if (section && line.trim()) counts.set(section, counts.get(section) + 1);
  }
  const problems = [];
  for (const [name] of SECTIONS) {
    const n = counts.get(name.toLowerCase());
    if (n === undefined) problems.push(`it has no "## ${name}" section`);
    else if (!n) problems.push(`its "## ${name}" section is empty`);
  }
  return problems;
}

/**
 * The file, from the facts the command gathered and the agent's body. `title` is one line; `where`
 * is a sentence about the checkout and `context` one about the session's size, and both may say
 * they are unknown.
 */
export function renderHandoff({ title, date, session, where, context, body, eol = "\n" }) {
  const text = [
    ...HEADER.map((line) => line.write({ title, date, session, where, context })),
    String(body).replace(/\r\n/g, "\n").trim(),
    "",
    "**Settles when:** the session that continues this work closes it and deletes this file.",
    "",
  ].join("\n");
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

/** The header's fields (`title`, `opened`, `session`), each null where its line does not match. */
export function readHeader(text) {
  const lines = String(text).split(/\r?\n/);
  const fields = {};
  HEADER.forEach((line, i) => {
    if (line.field) fields[line.field] = line.read.exec(lines[i] ?? "")?.[1] ?? null;
  });
  return fields;
}

/** The hand-offs in a checkout, newest first. */
export function readHandoffs(top) {
  const dir = join(top, HANDOFF_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(HANDOFF_PREFIX) && name.endsWith(".md"))
    .map((name) => {
      const path = join(dir, name);
      const header = readHeader(readFileSync(path, "utf8"));
      return { file: `${HANDOFF_DIR}/${name}`, path, ...header, title: header.title ?? name, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime || (a.file < b.file ? -1 : 1));
}
