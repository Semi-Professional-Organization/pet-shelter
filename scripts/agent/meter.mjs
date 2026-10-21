/**
 * `node scripts/agent.mjs meter`: the context meter. An agent cannot count its own tokens, and every
 * call it makes re-reads its whole context: 58% of what this repo's sessions cost was calls made
 * above 400K, and 12% was big sessions re-writing their cache after more than an hour idle
 * (`tasks/open/agent-scripts-must-cut-what-a-session-costs.md`). So the meter reads the real size
 * from the session's transcript and, at the owner's hand-off levels, adds one line to the agent's
 * context saying how big it is and when to hand off. It never compacts anything.
 *
 * Run three ways:
 *   - by the PostToolUse hook in `.claude/settings.json`, after tool calls: a level's line, once
 *     per level per context;
 *   - by the UserPromptSubmit hook, when a message arrives: the same, plus the cold-resume line
 *     when the cache has expired in a big session;
 *   - by hand, without `--hook`: this session's reading.
 *
 * As a hook it never blocks and never fails the call it follows: any error is appended to
 * `<tmp>/claude-meter/errors.log` and it exits 0 having printed nothing. Exit 2 from a
 * UserPromptSubmit hook would throw the person's message away.
 *
 * The core (`readingOf`, `assess`) does no I/O; `main` is the shell. Which levels this session has
 * announced is kept as one marker file per level in `<tmp>/claude-meter/<session>/`, created
 * exclusively, so tool calls that finish together still announce a level once.
 *
 * ceiling: one user per temp folder, as on Windows, where `TEMP` is per user and these scripts
 * run. Where users share `/tmp`, the first user's `claude-meter` folder would shut the others'
 * meters off and let them read or pre-create its markers; a per-user folder is the upgrade
 * (`tasks/open/agent-scripts-must-cut-what-a-session-costs.md`).
 */

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CACHE_TTL_MINUTES, createExtractor, lifetimeHolding, priceKey, segmentBreaks } from "./usage.mjs";
import { findTranscript, hookEvent, projectsDir, readTail, resolveSession } from "./transcript.mjs";

// ================================ the rule ================================

/**
 * The owner's hand-off rule (2026-10-19), in tokens of context. `quiet`: from here on, write the
 * hand-off state before ending a turn that waits on a person. `milestone`: write it at the next
 * milestone. `now`: hand off now. `cold`: a message that arrives after the cache expired, in a
 * session at least this big, gets the cold-resume line.
 *
 * Opus and Sonnet are priced the same per token at every size, so their levels are about the
 * re-reading. Haiku 5.5 charges five times as much for everything in a request whose prompt passes
 * 100K, so it warns at 80K and hands off at 90K, leaving room for the turn that writes the
 * hand-off.
 *
 * ceiling: Haiku's 90K level leaves 10K below its 100K step. How far the next request outgrows the
 * reading was measured on Opus sessions only (`readingOf`); none here ran on Haiku. Its 99th
 * percentile, 6.5K, fits in that room and its largest, 90K, does not, so a request carrying a big
 * tool result can pass 100K before the line arrives.
 */
export const RULES = {
  default: {
    levels: [
      ["quiet", 250_000],
      ["milestone", 300_000],
      ["now", 500_000],
    ],
    cold: 250_000,
  },
  "claude-haiku-5-5": {
    levels: [
      ["milestone", 80_000],
      ["now", 90_000],
    ],
    cold: 80_000,
  },
};

export const ruleFor = (model) => (Object.hasOwn(RULES, priceKey(model)) ? RULES[priceKey(model)] : RULES.default);

/**
 * A level announced once re-arms when the context falls below this share of it, which only a
 * compaction does; the gap keeps a context that hovers at a level from announcing it twice.
 */
export const REARM = 0.6;

/** The marker name of a level, and the size it stands for. */
const levelKey = (kind, at) => `${kind}-${at}`;
const levelSize = (key) => Number(String(key).split("-").pop());

const HANDOFF = "node scripts/agent.mjs ledger handoff --help";

// ================================ the reading ================================

/** A transcript's records as `usage` extracts them, so the meter and `usage` read alike. */
function extract(records) {
  const extractor = createExtractor({ session: "", sub: false });
  for (const record of records) extractor.add(record);
  return extractor.finish();
}

/**
 * The meter's reading from an extraction: the last model request, as `usage` reads it (lines of
 * one request merged, synthetic messages skipped).
 *
 * - `size`: what the next request carries at least, which is this request's prompt (fresh input,
 *   cache reads and cache writes) plus its output. `usage` calls the prompt alone `ctx`.
 * - `start`: when its first line was written, which is when it last read the cache, in ms.
 * - `ttl`: in minutes, the cache lifetime holding most of what the requests in view wrote since
 *   the context last began, at a compaction or at the drop `usage` takes for an unmarked one
 *   (`segmentBreaks`), decided as `coldResumes` decides it (`lifetimeHolding`); 60 when nothing
 *   written is in view.
 *
 * Null when no request is in view, or none since the last compaction: Claude Code writes no
 * request for the compaction itself, so the one before the boundary measured the context the
 * compaction replaced, and the first one after it writes the new, smaller context whatever the
 * cache did, which is why `coldResumes` leaves it out too. Checked on 2026-10-21 against the 7
 * compactions in the 341 transcripts on the owner's machine: in none was a request made before
 * the boundary, such as a kept message, written again after it.
 *
 * ceiling: the reading is a floor, not the size of the next request: it leaves out the tool
 * results and messages that request will add. The transcript "is written asynchronously and may
 * lag", so it can also be one request behind; `start` is the first line of the request in the
 * records given, so a request that began before them reads as starting later; and `ttl` counts
 * only the writes in view, where `usage` counts every write since the compaction. Replayed over
 * this repo's 18 main-session transcripts (10,562 requests) on 2026-10-21, the next request's
 * prompt was larger than the reading by a median of 280 tokens, 1.5K at the 90th percentile, 6.5K
 * at the 99th and 90K at most (13.8K at the 99th when the reading is a request behind). Against
 * levels of 250K and up, a line can come a call late, not a level late; against Haiku's, see
 * `RULES`.
 */
function readingFrom(extraction) {
  const { requests, compactions } = extraction;
  if ((compactions.at(-1) ?? 0) >= requests.length) return null;
  const last = requests.at(-1);
  const since = requests.slice(Math.max(0, ...[...segmentBreaks(extraction)].filter((i) => i < requests.length)));
  return {
    model: String(last.model),
    size: last.input_tokens + last.cache_read_input_tokens + last.cache_creation_input_tokens + last.output_tokens,
    start: Date.parse(last.ts),
    ttl: lifetimeHolding(since.reduce((n, r) => n + r.w5, 0), since.reduce((n, r) => n + r.w1h, 0)),
  };
}

/** The reading from a transcript's records, oldest first (`readingFrom`), or null. */
export const readingOf = (records) => readingFrom(extract(records));

// ================================ what it says ================================

export const tokens = (n) => `${Math.round(n / 1000)}K`;

export function ago(minutes) {
  if (minutes < 1) return "under a minute";
  if (minutes < 120) return `${Math.round(minutes)} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

/** What a level asks the agent to do. */
export function advice(kind) {
  if (kind === "quiet") return `From now on, before you end a turn that waits on a person, write your hand-off state (${HANDOFF}).`;
  const then = `write your hand-off state (${HANDOFF}) and ask to continue in a fresh session.`;
  return kind === "milestone" ? `At the next milestone, ${then}` : `Hand off now: ${then}`;
}

const sizeLine = (reading) => `context ${tokens(reading.size)} on ${reading.model}`;

const levelLine = (kind, reading) => `meter: ${sizeLine(reading)}. ${advice(kind)}`;

function coldLine(reading, idleMinutes) {
  const life = reading.ttl === CACHE_TTL_MINUTES["5m"] ? "5 minutes" : "1 hour";
  return (
    `meter: cold resume. The last request was ${ago(idleMinutes)} ago and this session's cache lives ${life}, ` +
    `so this turn re-writes the whole ${tokens(reading.size)} context. ` +
    `Answer this message, then write your hand-off state (${HANDOFF}) and ask to continue in a fresh session.`
  );
}

/**
 * What the meter says for one event. `fired` holds the keys of the levels already announced in
 * this context. Returns the lines, the level keys to mark announced (`fire`), the one whose line
 * is shown (`announce`, null when nothing or the cold line is), and the keys to re-arm.
 *
 * Several levels crossed at once (a resumed session, a big tool result) get the highest one's
 * line and are all marked. A cold resume's line replaces a level's, since it already says to hand
 * off.
 *
 * ceiling: "cold" is idle longer than the cache lifetime `readingOf` gives; the cache's own expiry
 * is not in the transcript. Replayed on 2026-10-21 through this function and `readingOf`, over the
 * 122 messages from a person that reached a main session of 250K or more in this repo's 18
 * transcripts, each read as the hook reads it (the transcript's last 256 KB before the message):
 * it called 30 cold and 92 warm, and each was right by what the answering request then did. Every
 * one called cold re-wrote at least half its context, and none called warm did.
 */
export function assess({ event, reading, fired = new Set(), now }) {
  const rule = ruleFor(reading.model);
  const rearm = [...fired].filter((key) => reading.size < REARM * levelSize(key));
  const live = new Set([...fired].filter((key) => !rearm.includes(key)));
  const fresh = rule.levels.filter(([kind, at]) => reading.size >= at && !live.has(levelKey(kind, at)));
  const idleMinutes = (now - reading.start) / 60_000;
  const cold = event === "UserPromptSubmit" && idleMinutes > reading.ttl && reading.size >= rule.cold;
  const top = fresh.at(-1);
  return {
    lines: cold ? [coldLine(reading, idleMinutes)] : top ? [levelLine(top[0], reading)] : [],
    fire: fresh.map(([kind, at]) => levelKey(kind, at)),
    announce: !cold && top ? levelKey(top[0], top[1]) : null,
    rearm,
    cold,
  };
}

// ================================ the shell ================================

const WHAT = { quiet: "write the hand-off state before ending a turn that waits on a person", milestone: "write it at the next milestone", now: "hand off now" };

/** The help, with the levels read from RULES so the two cannot disagree. */
export function helpText() {
  const levels = Object.entries(RULES).map(([model, rule]) =>
    [
      `  ${model === "default" ? "any other model" : model}:`,
      ...rule.levels.map(([kind, at]) => `    ${tokens(at).padEnd(5)} ${WHAT[kind]}`),
      `    ${tokens(rule.cold).padEnd(5)} and up: the cold-resume line`,
    ].join("\n"),
  );
  return `usage: node scripts/agent.mjs meter [--session <id>] [--json]
       node scripts/agent.mjs meter --hook   (reads a hook event on stdin; .claude/settings.json runs it)

The context meter: this session's real context size and whether its cache is still warm, read
from the session's transcript. Read-only, except that the
hook keeps which levels it has announced in <tmp>/claude-meter/<session>/.

As a hook it adds one line to the agent's context at each level of the hand-off rule, once per
level, and a line when a message arrives after the cache expired, saying what that turn re-wrote:

${levels.join("\n")}

  --session <id>  the session to read (default: CLAUDE_CODE_SESSION_ID); a prefix of 8 or more
                  characters will do
  --json          print the reading as JSON

Exit codes: 0 reading printed (and always, as a hook), 2 could not run.`;
}

/**
 * The latest reading in a transcript, as `{ reading }`, or `{ reading: null, why }`, where `why`
 * finishes "no model request": "yet", or "since its last compaction". Grows the tail read until
 * it holds a request or a compaction, or is the whole file: reading further back past a compaction
 * cannot find a request after it.
 */
export function readLatest(path, first = 256 * 1024) {
  for (let bytes = first; ; bytes *= 8) {
    const { records, whole } = readTail(path, bytes);
    const extraction = extract(records);
    const reading = readingFrom(extraction);
    if (reading) return { reading };
    if (extraction.compactions.length) return { reading: null, why: "since its last compaction" };
    if (whole) return { reading: null, why: "yet" };
  }
}

/** Creates a marker if no one has; true when this call created it. */
function claim(path) {
  try {
    closeSync(openSync(path, "wx"));
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

function hook({ stdin, env, tmp, now, out }) {
  const { event, session, transcript, subagent } = hookEvent(stdin);
  // A subagent's context is not the session's, and a line about the session's size would land in
  // the wrong agent. Without a session id there is nowhere to keep which levels it was told, and a
  // shared folder would silence one session's levels for another; with one, it names the folder.
  if (subagent || !session) return;
  if (event !== "PostToolUse" && event !== "UserPromptSubmit") return;
  const path = transcript || findTranscript(projectsDir(env), session)?.path;
  if (!path || !existsSync(path)) return;
  const { reading } = readLatest(path);
  if (!reading) return;
  const dir = join(tmp, "claude-meter", session);
  mkdirSync(dir, { recursive: true });
  const lines = settle(dir, assess({ event, reading, fired: new Set(readdirSync(dir)), now }));
  if (lines.length) out.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: lines.join("\n") } }));
}

/**
 * Records an assessment in the session's marker folder and returns the lines to show. Parallel
 * tool calls fire PostToolUse hooks together, and two can read the folder before either writes
 * to it; the exclusive create decides which one shows a level's line.
 */
export function settle(dir, result) {
  for (const key of result.rearm) rmSync(join(dir, key), { force: true });
  let mine = false;
  for (const key of result.fire) if (claim(join(dir, key)) && key === result.announce) mine = true;
  return result.announce && !mine ? [] : result.lines;
}

function manual({ session, json, env, now, out }) {
  const fail = (message, next) => {
    out.write(`meter: ERROR ${message}\n${next ? `next: ${next}\n` : ""}`);
    return 2;
  };
  let found;
  try {
    found = resolveSession(session ?? env.CLAUDE_CODE_SESSION_ID, projectsDir(env));
  } catch (error) {
    return fail(error.message, error.next);
  }
  if (!found.path) return fail(`no transcript for session ${found.session} in ${projectsDir(env)}`);
  const { reading, why } = readLatest(found.path);
  if (!reading) return fail(`no model request in ${found.path} ${why}`);
  const idleMinutes = (now - reading.start) / 60_000;
  const warm = idleMinutes <= reading.ttl;
  const crossed = ruleFor(reading.model).levels.filter(([, at]) => reading.size >= at).at(-1);
  if (json) {
    out.write(`${JSON.stringify({ session: found.session, transcript: found.path, ...reading, idleMinutes, warm, level: crossed?.[0] ?? null }, null, 2)}\n`);
    return 0;
  }
  const lines = [
    `meter: PASS ${sizeLine(reading)}`,
    `cache: last request ${ago(idleMinutes)} ago; it lives ${reading.ttl === CACHE_TTL_MINUTES["5m"] ? "5 minutes" : "1 hour"}, so it is ${warm ? "warm" : "cold"}`,
  ];
  if (crossed) lines.push(`next: ${advice(crossed[0])}`);
  lines.push(`transcript: ${found.path}`);
  out.write(`${lines.join("\n")}\n`);
  return 0;
}

export function parseArgs(argv) {
  const opts = { hook: false, json: false, help: false, session: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hook") opts.hook = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--session") {
      const v = argv[++i];
      if (v === undefined || !v.trim() || v.startsWith("--")) throw new Error("--session needs a value");
      opts.session = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export async function main(argv, io = {}) {
  const out = io.out ?? process.stdout;
  const env = io.env ?? process.env;
  const tmp = io.tmp ?? tmpdir();
  const now = io.now ?? Date.now();
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    // A hook must not fail the call it follows, even when its own command line is wrong.
    if (argv.includes("--hook")) return 0;
    out.write(`meter: ERROR ${error.message}\nnext: node scripts/agent.mjs meter --help\n`);
    return 2;
  }
  if (opts.help) {
    out.write(`${helpText()}\n`);
    return 0;
  }
  if (opts.hook) {
    try {
      hook({ stdin: io.stdin ?? readFileSync(0, "utf8"), env, tmp, now, out });
    } catch (error) {
      try {
        mkdirSync(join(tmp, "claude-meter"), { recursive: true });
        appendFileSync(join(tmp, "claude-meter", "errors.log"), `${new Date(now).toISOString()} ${error?.stack ?? error}\n`);
      } catch {
        // Nowhere left to say it; the call still goes ahead.
      }
    }
    return 0;
  }
  try {
    return manual({ session: opts.session, json: opts.json, env, now, out });
  } catch (error) {
    out.write(`meter: ERROR ${error.message}\n`);
    return 2;
  }
}
