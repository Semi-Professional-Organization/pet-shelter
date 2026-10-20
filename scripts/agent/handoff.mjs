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
 * What is wrong with a body, as sentences; empty when nothing is. A heading inside a fenced code
 * block is not a section.
 */
export function checkBody(body) {
  const problems = [];
  const counts = new Map();
  let section = null;
  let fenced = false;
  for (const line of String(body).replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && /^# /.test(line)) problems.push("the body has its own H1, but the title is the H1");
    const heading = fenced ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      section = heading[1].toLowerCase();
      if (!counts.has(section)) counts.set(section, 0);
    } else if (section && line.trim()) counts.set(section, counts.get(section) + 1);
  }
  for (const [name] of SECTIONS) {
    const n = counts.get(name.toLowerCase());
    if (n === undefined) problems.push(`it has no "## ${name}" section`);
    else if (!n) problems.push(`its "## ${name}" section is empty`);
  }
  if (/^\s*(?:- )?\*\*(?:Status|Settles when|From session):\*\*/m.test(body)) {
    problems.push("the body repeats a field the command writes (Status, Settles when, From session)");
  }
  return [...new Set(problems)];
}

/**
 * The file, from the facts the command gathered and the agent's body. `where` is a sentence about
 * the checkout; `context` one about the session's size; both may say they are unknown.
 */
export function renderHandoff({ title, date, session, where, context, body, eol = "\n" }) {
  const text = [
    `# Hand-off: ${title}`,
    "",
    `**Status:** open · opened ${date}`,
    "",
    `- **From session:** \`${session}\`, whose transcript \`node scripts/agent.mjs recall <term>\` searches.`,
    `- **Where:** ${where}`,
    `- **Context at hand-off:** ${context}`,
    "",
    String(body).replace(/\r\n/g, "\n").trim(),
    "",
    "**Settles when:** the session that continues this work closes it and deletes this file.",
    "",
  ].join("\n");
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

const FROM = /\*\*From session:\*\* `([^`]+)`/;

/** The session a hand-off file records, or null. */
export const sessionOf = (text) => FROM.exec(text)?.[1] ?? null;

/** The hand-offs in a checkout, newest first. */
export function readHandoffs(top) {
  const dir = join(top, HANDOFF_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(HANDOFF_PREFIX) && name.endsWith(".md"))
    .map((name) => {
      const path = join(dir, name);
      const text = readFileSync(path, "utf8");
      return {
        file: `${HANDOFF_DIR}/${name}`,
        path,
        title: /^# (?:Hand-off: )?(.+?)\s*$/m.exec(text)?.[1] ?? name,
        session: sessionOf(text),
        opened: /opened (\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null,
        mtime: statSync(path).mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime || (a.file < b.file ? -1 : 1));
}
