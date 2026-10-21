/**
 * `node scripts/agent.mjs meter`: the context meter. An agent cannot count its own tokens, and every
 * call it makes re-reads its whole context: 58% of what this repo's sessions cost was calls made
 * above 400K, and 12% was big sessions re-writing their cache after more than an hour idle
 * (`tasks/open/agent-scripts-must-cut-what-a-session-costs.md`). So the meter reads the real size
 * from the session's transcript and, at the owner's hand-off levels, adds one line to the agent's
 * context saying what a call now costs and when to hand off. It never compacts anything.
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
 */

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CACHE_TTL_MINUTES, PRICES, USAGE_FIELDS, priceKey, ratesFor } from "./usage.mjs";
import { findTranscript, projectsDir, readTail } from "./transcript.mjs";

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

const requestKey = (record) => record.requestId || record.message?.id || record.uuid;
const isRequest = (record) =>
  record?.type === "assistant" && record.message?.usage && typeof record.message.usage === "object" && record.message.model !== "<synthetic>";
const isBoundary = (record) => record?.type === "system" && record.subtype === "compact_boundary";

/**
 * The meter's reading from a transcript's records, oldest first: the last model request that has
 * written its usage. Lines of one request share a `requestId` and repeat its usage with a growing
 * output, so each field is the maximum over the request's lines, as `usage` does.
 *
 * - `ctx`: what the next request carries at least, which is this request's prompt (fresh input,
 *   cache reads and cache writes) plus its output.
 * - `start`: when its first line was written, which is when it last read the cache, in ms.
 * - `ttl`: in minutes, the cache lifetime that holds most of what the requests in view wrote since
 *   the last compaction, which decides whether the whole context expires, as in `usage`'s
 *   `coldResumes`; 60 when nothing written is in view.
 * - `speed`, `geo`, `tier`: what the request was served at, which its price depends on.
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
 * this repo's 18 main-session transcripts (10,562 requests) on 2026-10-21: this function agreed
 * with `usage`'s extraction on the last request of all 18 (size, model and start), and the next
 * request's prompt was larger than the reading by a median of 280 tokens, 1.5K at the 90th
 * percentile, 6.5K at the 99th and 90K at most (13.8K at the 99th when the reading is a request
 * behind). Against levels of 250K and up, a line can come a call late, not a level late; against
 * Haiku's, see `RULES`.
 */
export function readingOf(records) {
  let last = -1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (isBoundary(records[i])) return null;
    if (isRequest(records[i])) {
      last = i;
      break;
    }
  }
  if (last < 0) return null;
  const key = requestKey(records[last]);
  const usage = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  const served = {};
  let start = Date.parse(records[last].timestamp);
  for (const record of records) {
    if (!isRequest(record) || requestKey(record) !== key) continue;
    const u = record.message.usage;
    for (const field of USAGE_FIELDS) usage[field] = Math.max(usage[field], Number(u[field]) || 0);
    if (u.speed != null) served.speed = u.speed;
    if (u.inference_geo != null) served.geo = u.inference_geo;
    if (u.service_tier != null) served.tier = u.service_tier;
    const at = Date.parse(record.timestamp);
    if (at < start) start = at;
  }
  // Each request's writes, merged over its lines, back to the last compaction in view.
  const writes = new Map();
  for (let i = last; i >= 0; i--) {
    const record = records[i];
    if (isBoundary(record)) break;
    if (!isRequest(record)) continue;
    const c = record.message.usage.cache_creation || {};
    const [five, hour] = writes.get(requestKey(record)) ?? [0, 0];
    writes.set(requestKey(record), [Math.max(five, Number(c.ephemeral_5m_input_tokens) || 0), Math.max(hour, Number(c.ephemeral_1h_input_tokens) || 0)]);
  }
  let held5 = 0;
  let held1h = 0;
  for (const [five, hour] of writes.values()) {
    held5 += five;
    held1h += hour;
  }
  return {
    model: String(records[last].message.model),
    ctx: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens,
    start,
    ttl: held5 > held1h ? CACHE_TTL_MINUTES["5m"] : CACHE_TTL_MINUTES["1h"],
    ...served,
  };
}

/**
 * What one call costs at this size, priced by the context it re-reads rather than by what it
 * prints, and what a cold turn costs over a warm one. Null for a model, speed, region or service
 * tier with no price.
 */
export function priceOf(reading) {
  try {
    const rates = ratesFor({ model: reading.model, prompt: reading.ctx, speed: reading.speed, geo: reading.geo, tier: reading.tier });
    const write = reading.ttl === CACHE_TTL_MINUTES["5m"] ? rates.write5m : rates.write1h;
    return { read: (reading.ctx * rates.cacheRead) / 1e6, rewrite: (reading.ctx * (write - rates.cacheRead)) / 1e6 };
  } catch {
    return null;
  }
}

// ================================ what it says ================================

const tokens = (n) => `${Math.round(n / 1000)}K`;
const dollars = (x) => (x >= 0.01 ? `$${x.toFixed(2)}` : "under $0.01");

export function ago(minutes) {
  if (minutes < 1) return "under a minute";
  if (minutes < 120) return `${Math.round(minutes)} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

/** The price step a model's requests pay past some prompt size, as "past 100K ... 5x". */
function stepNote(model) {
  const table = Object.hasOwn(PRICES, priceKey(model)) ? PRICES[priceKey(model)] : undefined;
  if (!table?.over) return "";
  return ` On this model a request whose prompt passes ${tokens(table.over.prompt)} costs ${table.over.input / table.input} times as much.`;
}

/** What a level asks the agent to do. */
export function advice(kind, model) {
  if (kind === "quiet") return `From now on, before you end a turn that waits on a person, write your hand-off state (${HANDOFF}).`;
  const then = `write your hand-off state (${HANDOFF}) and ask to continue in a fresh session.${stepNote(model)}`;
  return kind === "milestone" ? `At the next milestone, ${then}` : `Hand off now: ${then}`;
}

const sizeLine = (reading, price) =>
  `context ${tokens(reading.ctx)} on ${reading.model}${price ? `; every call re-reads it, about ${dollars(price.read)} each` : ""}`;

const levelLine = (kind, reading, price) => `meter: ${sizeLine(reading, price)}. ${advice(kind, reading.model)}`;

function coldLine(reading, idleMinutes, price) {
  const life = reading.ttl === CACHE_TTL_MINUTES["5m"] ? "5 minutes" : "1 hour";
  return (
    `meter: cold resume. The last request was ${ago(idleMinutes)} ago and this session's cache lives ${life}, ` +
    `so this turn re-writes the whole ${tokens(reading.ctx)} context` +
    `${price ? `, about ${dollars(price.rewrite)} more than a warm turn` : ""}. ` +
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
  const rearm = [...fired].filter((key) => reading.ctx < REARM * levelSize(key));
  const live = new Set([...fired].filter((key) => !rearm.includes(key)));
  const fresh = rule.levels.filter(([kind, at]) => reading.ctx >= at && !live.has(levelKey(kind, at)));
  const price = priceOf(reading);
  const idleMinutes = (now - reading.start) / 60_000;
  const cold = event === "UserPromptSubmit" && idleMinutes > reading.ttl && reading.ctx >= rule.cold;
  const top = fresh.at(-1);
  return {
    lines: cold ? [coldLine(reading, idleMinutes, price)] : top ? [levelLine(top[0], reading, price)] : [],
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

The context meter: this session's real context size, what each call costs at that size, and
whether its cache is still warm, read from the session's transcript. Read-only, except that the
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
 * Grows the tail read until it holds a request or a compaction, or is the whole file. Reading
 * further back past a compaction cannot find a request after it.
 */
export function readLatest(path, first = 256 * 1024) {
  for (let bytes = first; ; bytes *= 8) {
    const { records, whole } = readTail(path, bytes);
    const reading = readingOf(records);
    if (reading || whole || records.some(isBoundary)) return reading;
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

const safeName = (id) => String(id).replace(/[^A-Za-z0-9-]/g, "_");

function hook({ stdin, env, tmp, now, out }) {
  const input = JSON.parse(stdin);
  // A subagent's tool call carries `agent_id`; its context is not the session's, and a line about
  // the session's size would land in the wrong agent. Without a session there is nowhere to keep
  // which levels it was told, and a shared folder would silence one session's levels for another.
  if (input.agent_id || typeof input.session_id !== "string" || !input.session_id) return;
  const event = input.hook_event_name;
  if (event !== "PostToolUse" && event !== "UserPromptSubmit") return;
  const path = input.transcript_path || findTranscript(projectsDir(env), input.session_id)?.path;
  if (!path || !existsSync(path)) return;
  const reading = readLatest(path);
  if (!reading) return;
  const dir = join(tmp, "claude-meter", safeName(input.session_id));
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
  const id = session ?? env.CLAUDE_CODE_SESSION_ID;
  if (!id) return fail("no session: CLAUDE_CODE_SESSION_ID is not set", "pass --session <id>");
  const found = findTranscript(projectsDir(env), id);
  if (!found) return fail(`no transcript for session ${id} in ${projectsDir(env)}`);
  const reading = readLatest(found.path);
  if (!reading) return fail(`no model request in ${found.path} yet, or none since its last compaction`);
  const price = priceOf(reading);
  const idleMinutes = (now - reading.start) / 60_000;
  const warm = idleMinutes <= reading.ttl;
  const crossed = ruleFor(reading.model).levels.filter(([, at]) => reading.ctx >= at).at(-1);
  if (json) {
    out.write(`${JSON.stringify({ session: found.session, transcript: found.path, ...reading, idleMinutes, warm, price, level: crossed?.[0] ?? null }, null, 2)}\n`);
    return 0;
  }
  const lines = [
    `meter: PASS ${sizeLine(reading, price)}`,
    `cache: last request ${ago(idleMinutes)} ago; it lives ${reading.ttl === CACHE_TTL_MINUTES["5m"] ? "5 minutes" : "1 hour"}, so it is ${warm ? "warm" : "cold"}`,
  ];
  if (crossed) lines.push(`next: ${advice(crossed[0], reading.model)}`);
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
      if (v === undefined || v.startsWith("--")) throw new Error("--session needs a value");
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
