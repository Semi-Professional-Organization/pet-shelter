/**
 * `node scripts/agent.mjs usage`: what agent sessions in this repo cost, so every later agent
 * script can prove it saved something.
 *
 * Reads the Claude Code transcripts for this repo (the main checkout and every worktree, subagents
 * included), groups the transcript lines of one model request together, prices each request at its
 * own model's official rates, and reports aggregates only. It never prints message text or tool
 * output: the report holds counts, token totals, dollars, session ids, tool names and coarse
 * command classes such as `git diff` or `npm run test`.
 *
 * The core (everything exported) is pure and takes parsed records; `main` is the I/O shell.
 * Spec: the agent-scripts catalog, sections 1a, 3, 4 (`usage`) and 7.
 *
 * Exit codes, as the rest of the repo: 0 the report was produced, 2 it could not be. There is no
 * exit 1, because a measurement has no failing state. An unpriceable request (unknown model, fast
 * mode, an unknown inference region) is a 2, never a guess.
 */

import { createReadStream, existsSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

// ================================ prices ================================

export const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const PRICES_CHECKED = "2026-10-20";

/** USD per million tokens, copied from the "Model pricing" table at PRICE_SOURCE. */
const rates = (input, write5m, write1h, cacheRead, output) => ({ input, write5m, write1h, cacheRead, output });

export const PRICES = {
  "claude-fable-5-1": rates(10, 12.5, 20, 0.25, 50),
  "claude-fable-5": rates(10, 12.5, 20, 1, 50),
  "claude-opus-5-5": rates(4, 5, 8, 0.2, 20),
  "claude-opus-5": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-6": rates(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-5": rates(5, 6.25, 10, 0.5, 25),
  "claude-sonnet-5-5": rates(2, 2.5, 4, 0.1, 10),
  "claude-sonnet-5": rates(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": rates(3, 3.75, 6, 0.3, 15),
  "claude-sonnet-4-5": rates(3, 3.75, 6, 0.3, 15),
  // "A request whose prompt is over 100,000 tokens pays higher prices. A request's prompt length
  // counts all of its input tokens, including cache reads and cache writes. Each request is priced
  // on its own." Every rate moves, output included.
  "claude-haiku-5-5": { ...rates(0.1, 0.125, 0.2, 0.01, 0.5), over: { prompt: 100_000, ...rates(0.5, 0.625, 1, 0.05, 2.5) } },
  "claude-haiku-4-5": rates(1, 1.25, 2, 0.1, 5),
};

/** "Web search is $10 per 1,000 searches"; web fetch costs only its tokens. */
const WEB_SEARCH_USD = 0.01;

/** `inference_geo` values priced at standard rates. "us" is 1.1x on every category. */
const GEO_MULTIPLIER = { global: 1, not_available: 1, us: 1.1 };

export class UnpriceableError extends Error {}

/**
 * The rates one request pays, or a throw. `model` is the model that served the request
 * (`message.model`), not the one asked for: a fallback bills at the model that answered.
 *
 * @param {{ model: string, prompt: number, speed?: string | null, geo?: string | null }} request
 */
export function ratesFor({ model, prompt, speed, geo }) {
  const table = Object.hasOwn(PRICES, model) ? PRICES[model] : undefined;
  if (!table) throw new UnpriceableError(`no price for model ${model}`);
  if (speed != null && speed !== "standard") throw new UnpriceableError(`no price for ${model} at speed ${speed}`);
  const multiplier = geo == null ? 1 : Object.hasOwn(GEO_MULTIPLIER, geo) ? GEO_MULTIPLIER[geo] : undefined;
  if (multiplier === undefined) throw new UnpriceableError(`no price for inference_geo ${geo}`);
  const base = table.over && prompt > table.over.prompt ? table.over : table;
  return {
    input: base.input * multiplier,
    write5m: base.write5m * multiplier,
    write1h: base.write1h * multiplier,
    cacheRead: base.cacheRead * multiplier,
    output: base.output * multiplier,
  };
}

// ================================ classification ================================

const SHELLS = new Set(["Bash", "PowerShell"]);

/**
 * The workflow families of catalog section 4: the runs of calls one proposed command would
 * replace. Matched against the command string at extraction time; only the family name is kept.
 */
export const FAMILIES = {
  gates: (tool, cmd) =>
    SHELLS.has(tool) &&
    /npm run (-s )?(typecheck|lint|docs:check|build|check|test:all|test:components|test:integration|test)(\s|$|;|&|\|)|npx tsc --noEmit|next build/.test(cmd) &&
    !FAMILIES["targeted tests"](tool, cmd),
  "targeted tests": (tool, cmd) =>
    SHELLS.has(tool) && /vitest run[^;&|]*tests\/[^ ]+\.test\.tsx?|npm run test[^;&|]* -- [^;&|]*tests\//.test(cmd),
  orient: (tool, cmd) =>
    SHELLS.has(tool) &&
    /git (worktree list|branch -a|branch --list|rev-parse --show-toplevel|log --oneline (master|HEAD)\.\.origin\/master|fetch)|gh pr list|ls tasks\/(open|lessons|decisions)|ls -la \.git\/[^ ]*lock/.test(cmd),
  ledger: (tool, cmd) =>
    (SHELLS.has(tool) &&
      /ls tasks\/(lessons|open|decisions)|grep [^|;&]*tasks\/(lessons|open|decisions)|(cat|head|sed -n|tail|grep|awk)[^|;&]*tasks\/todo\.md/.test(cmd)) ||
    (tool === "Read" && /todo\.md$/.test(cmd)),
  merge: (tool, cmd) => SHELLS.has(tool) && /git merge-tree|HEAD\.\.origin\/master|merge-base HEAD origin\/master/.test(cmd),
  drift: (tool, cmd) => SHELLS.has(tool) && /agent-drift\.log/.test(cmd),
  pr: (tool, cmd) =>
    SHELLS.has(tool) && /gh pr (checks|view)|gh run (view|watch|list)|commits\/[^ ]+\/status|gh api [^ ]*deployments/.test(cmd),
  ports: (tool, cmd) =>
    // Port checks and process kills, not every command that carries a `:5432` database URL.
    SHELLS.has(tool) &&
    /Get-NetTCPConnection|Test-NetConnection|netstat|lsof -i|net\.connect|Stop-Process|taskkill|Get-CimInstance Win32_Process/.test(cmd),
};

/** Families a call belongs to. A call can count toward more than one, as in the catalog. */
export function familiesOf(tool, cmd) {
  return Object.keys(FAMILIES).filter((name) => FAMILIES[name](tool, cmd));
}

/** A command word: starts with a letter; no path separator, flag, quote or substitution. */
const VERB = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;
/** An npm script name may also carry colons (`test:components`). */
const SCRIPT = /^[A-Za-z][A-Za-z0-9_.:-]{0,39}$/;
const SUBCOMMAND = new Set(["git", "gh", "npx"]);

/**
 * A coarse, content-free label for what a tool call was: the tool name, or for a shell the leading
 * verb (`git diff`, `npm run test`, `cat`). Leading `cd ... &&` and `VAR=x` are skipped. A word
 * that could be argument text (a path, a flag, a quoted or substituted value) turns the whole label
 * into `<tool> other`, so no argument text reaches the report.
 */
export function commandClass(tool, cmd) {
  if (tool.startsWith("mcp__")) return tool.split("__").slice(0, 2).join("__");
  if (!SHELLS.has(tool)) return tool;
  let rest = String(cmd).trim();
  for (;;) {
    const cd = /^(cd|Set-Location|pushd)\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/.exec(rest);
    const env = /^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'[^']*'|[^\s"';&|]*)\s+/.exec(rest);
    const match = cd || env;
    if (!match) break;
    rest = rest.slice(match[0].length);
  }
  const words = rest.split(/\s+/);
  const take = words[0] === "npm" && words[1] === "run" ? 3 : SUBCOMMAND.has(words[0]) || words[0] === "npm" ? 2 : 1;
  const label = words.slice(0, take).filter(Boolean);
  const plain = label.length > 0 && label.every((w, i) => (i === 2 ? SCRIPT : VERB).test(w));
  if (!plain) return `${tool} other`;
  return label.join(" ");
}

// ================================ extraction ================================

const textLength = (content) =>
  typeof content === "string"
    ? content.length
    : Array.isArray(content)
      ? content.reduce((n, block) => n + (block && block.type === "text" ? String(block.text).length : 0), 0)
      : 0;

/** Token fields a request's lines are merged on. Streamed lines repeat them; output grows. */
const USAGE_FIELDS = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"];

/**
 * One transcript file, fed record by record. Keeps numbers and labels only.
 *
 * Lines of one request share a `requestId` and need not be adjacent; their usage is merged by
 * taking the maximum of each field, because streamed lines carry a growing `output_tokens`.
 * `seen` is shared across files: a request copied into a second file (a fork, a relocated
 * subagent) is counted once, in the first file read.
 */
export function createExtractor({ session, sub }, seen = new Set()) {
  const requests = [];
  const byKey = new Map();
  const calls = new Map();
  const results = [];
  const compactions = [];
  let synthetic = 0;
  let duplicates = 0;
  const dupKeys = new Set();
  let lastTs;

  return {
    add(record) {
      if (!record || typeof record !== "object") return;
      if (record.type === "system" && record.subtype === "compact_boundary") {
        compactions.push(requests.length);
        return;
      }
      const message = record.message;
      if (!message || typeof message !== "object") return;

      if (record.type === "assistant") {
        if (message.model === "<synthetic>") {
          synthetic++;
          return;
        }
        const key = record.requestId || message.id || record.uuid;
        // The previous assistant line's time, copied history included, so the first new request
        // of a forked or relocated transcript still knows how long the session sat idle.
        const prevTs = lastTs;
        lastTs = record.timestamp;
        if (dupKeys.has(key)) return;
        let request = byKey.get(key);
        if (!request) {
          if (seen.has(key)) {
            dupKeys.add(key);
            duplicates++;
            return;
          }
          seen.add(key);
          request = {
            index: requests.length,
            ts: record.timestamp,
            prevTs,
            model: message.model,
            speed: undefined,
            geo: undefined,
            webSearch: 0,
            w5: 0,
            w1h: 0,
            tools: 0,
          };
          for (const field of USAGE_FIELDS) request[field] = 0;
          byKey.set(key, request);
          requests.push(request);
        }
        const usage = message.usage || {};
        for (const field of USAGE_FIELDS) request[field] = Math.max(request[field], Number(usage[field]) || 0);
        const creation = usage.cache_creation || {};
        const w5 = Number(creation.ephemeral_5m_input_tokens) || 0;
        // Older lines carry only the total; Claude Code's cache is the 1-hour one.
        const w1h = Number(creation.ephemeral_1h_input_tokens) || Math.max(0, request.cache_creation_input_tokens - w5);
        request.w5 = Math.max(request.w5, w5);
        request.w1h = Math.max(request.w1h, w1h);
        if (usage.speed != null) request.speed = usage.speed;
        if (usage.inference_geo != null) request.geo = usage.inference_geo;
        request.webSearch = Math.max(request.webSearch, Number(usage.server_tool_use?.web_search_requests) || 0);
        for (const block of Array.isArray(message.content) ? message.content : []) {
          if (block?.type !== "tool_use") continue;
          request.tools++;
          const input = block.input || {};
          const cmd = String(input.command ?? input.file_path ?? input.pattern ?? "");
          calls.set(block.id, {
            request: request.index,
            tool: String(block.name),
            class: commandClass(String(block.name), cmd),
            families: familiesOf(String(block.name), cmd),
          });
        }
      } else if (record.type === "user" && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block?.type === "tool_result") results.push({ id: block.tool_use_id, chars: textLength(block.content) });
        }
      }
    },
    finish() {
      // A call's order is the order its tool_use appeared, which is the order of `calls`.
      const callList = [...calls.entries()].map(([id, call]) => ({ id, ...call }));
      const chars = new Map(results.map((r) => [r.id, r.chars]));
      for (const call of callList) call.resultChars = chars.get(call.id) ?? 0;
      return { session, sub, requests, calls: callList, compactions, synthetic, duplicates };
    },
  };
}

// ================================ pricing a file ================================

const promptOf = (r) => r.input_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens;

/** Prices every request in an extracted file in place. Throws UnpriceableError. */
export function priceFile(file, { priceAs } = {}) {
  for (const r of file.requests) priceRequest(r, priceAs);
  return file;
}

/**
 * Prices one request in place. `priceAs` prices it at another model's rates (speed and region
 * still apply), which is how a before/after comparison removes a change of model from the result.
 */
function priceRequest(r, priceAs) {
  r.ctx = promptOf(r);
    const p = ratesFor({ model: priceAs ?? r.model, prompt: r.ctx, speed: r.speed, geo: r.geo });
    r.rates = p;
    // The 5m/1h split can disagree with the total on old lines; the total is what was written,
    // and whatever the split does not attribute to 5m was the 1-hour cache Claude Code uses.
    const w5 = Math.min(r.w5, r.cache_creation_input_tokens);
    const w1h = r.cache_creation_input_tokens - w5;
    r.usd = {
      read: (r.cache_read_input_tokens * p.cacheRead) / 1e6,
      write: (w5 * p.write5m + w1h * p.write1h) / 1e6,
      output: (r.output_tokens * p.output) / 1e6,
      input: (r.input_tokens * p.input) / 1e6,
      search: r.webSearch * WEB_SEARCH_USD,
    };
    r.cost = r.usd.read + r.usd.write + r.usd.output + r.usd.input + r.usd.search;
}

// ================================ the analyses ================================

export const CONTEXT_BUCKETS = [
  { label: "under 200K", max: 200_000 },
  { label: "200K-400K", max: 400_000 },
  { label: "400K-600K", max: 600_000 },
  { label: "over 600K", max: Infinity },
];

/** A context drop larger than this between consecutive requests is a compaction. */
const COMPACTION_DROP = 0.6;

/** Index of the last request each request's context survives to. */
function segmentEnds(file) {
  const n = file.requests.length;
  const breaks = new Set(file.compactions);
  for (let i = 1; i < n; i++) if (file.requests[i].ctx < COMPACTION_DROP * file.requests[i - 1].ctx) breaks.add(i);
  const ends = new Array(n);
  let end = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    ends[i] = end;
    if (breaks.has(i)) end = i - 1;
  }
  return ends;
}

/**
 * What carrying tool output cost. A result enters the context with the next request, which writes
 * it to the cache, and every later request in the same segment reads it again. Tokens are
 * estimated as characters / 4, which is why the report calls this an estimate.
 */
export function carriedOutput(file) {
  const reqs = file.requests;
  const ends = segmentEnds(file);
  const readPrefix = [0];
  for (const r of reqs) readPrefix.push(readPrefix[readPrefix.length - 1] + r.rates.cacheRead);
  const byClass = {};
  let total = 0;
  for (const call of file.calls) {
    const writeAt = call.request + 1;
    if (!call.resultChars || writeAt >= reqs.length || writeAt > ends[call.request]) continue;
    const w = reqs[writeAt];
    const writeRate = w.w1h >= w.w5 ? w.rates.write1h : w.rates.write5m;
    const reads = readPrefix[ends[call.request] + 1] - readPrefix[writeAt + 1];
    const usd = ((call.resultChars / 4) * (writeRate + reads)) / 1e6;
    total += usd;
    byClass[call.class] = (byClass[call.class] || 0) + usd;
  }
  return { total, byClass };
}

export const COLD_IDLE_MINUTES = 60;

/**
 * Main-session requests that came after the 1-hour cache expired and re-wrote the whole context.
 * "Whole" is a write of at least half the context and at least 50K tokens, so a cold resume of a
 * small session is not counted.
 */
export function coldResumes(file) {
  if (file.sub) return [];
  const out = [];
  for (const r of file.requests) {
    if (!r.prevTs) continue;
    const idle = (Date.parse(r.ts) - Date.parse(r.prevTs)) / 60_000;
    if (!(idle > COLD_IDLE_MINUTES)) continue;
    if (r.cache_creation_input_tokens < Math.max(50_000, 0.5 * r.ctx)) continue;
    out.push({ session: file.session, ts: r.ts, idleMinutes: idle, ctx: r.ctx, cost: r.usd.write });
  }
  return out;
}

/**
 * Per family: calls, bursts (runs of consecutive matching calls in one file), and the cost a single
 * command per burst would have saved. A call costs its request's cost split evenly across the
 * request's tool calls.
 */
export function familyUsage(files) {
  const out = Object.fromEntries(Object.keys(FAMILIES).map((name) => [name, { calls: 0, bursts: 0, sessions: new Set(), cost: 0, saving: 0 }]));
  for (const file of files) {
    for (const name of Object.keys(FAMILIES)) {
      const f = out[name];
      let inRun = false;
      for (const call of file.calls) {
        if (!call.families.includes(name)) {
          inRun = false;
          continue;
        }
        const r = file.requests[call.request];
        const cost = r.cost / Math.max(1, r.tools);
        f.calls++;
        f.cost += cost;
        f.sessions.add(file.session);
        if (inRun) f.saving += cost;
        else f.bursts++;
        inRun = true;
      }
    }
  }
  for (const f of Object.values(out)) f.sessions = f.sessions.size;
  return out;
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The whole report, from extracted files. Prices everything first and throws one
 * UnpriceableError naming every unpriceable request kind, so a run never reports a partial total.
 *
 * `since` filters requests, and the calls they made, after pricing, so segments and idle gaps are
 * still measured against the requests before the window.
 */
export function summarize(files, { since, priceAs } = {}) {
  const sinceMs = since ? Date.parse(since) : -Infinity;
  const inWindow = (ts) => !(Date.parse(ts) < sinceMs);

  const unpriceable = {};
  for (const f of files) {
    for (const r of f.requests) {
      try {
        priceRequest(r, priceAs);
      } catch (error) {
        if (!(error instanceof UnpriceableError)) throw error;
        unpriceable[error.message] = (unpriceable[error.message] || 0) + 1;
      }
    }
  }
  if (Object.keys(unpriceable).length) {
    throw new UnpriceableError(Object.entries(unpriceable).map(([m, n]) => `${m} (${n} requests)`).join("; "));
  }

  const totals = { cost: 0, read: 0, write: 0, output: 0, input: 0, search: 0, requests: 0 };
  const models = {};
  const who = { main: { cost: 0, requests: 0 }, subagents: { cost: 0, requests: 0 } };
  const buckets = CONTEXT_BUCKETS.map((b) => ({ label: b.label, requests: 0, cost: 0 }));
  const sessions = {};
  const carried = { cost: 0, byClass: {} };
  const cold = [];
  const windowed = [];
  let first = null;
  let last = null;

  for (const f of files) {
    for (const r of f.requests) {
      if (!inWindow(r.ts)) continue;
      totals.requests++;
      totals.cost += r.cost;
      for (const k of ["read", "write", "output", "input", "search"]) totals[k] += r.usd[k];
      const m = (models[r.model] ||= { cost: 0, requests: 0 });
      m.cost += r.cost;
      m.requests++;
      const w = f.sub ? who.subagents : who.main;
      w.cost += r.cost;
      w.requests++;
      const b = buckets[CONTEXT_BUCKETS.findIndex((x) => r.ctx < x.max)];
      b.requests++;
      b.cost += r.cost;
      const s = (sessions[f.session] ||= { cost: 0, requests: 0, subagentRequests: 0, peakContext: 0 });
      s.cost += r.cost;
      if (f.sub) s.subagentRequests++;
      else {
        s.requests++;
        s.peakContext = Math.max(s.peakContext, r.ctx);
      }
      if (!first || r.ts < first) first = r.ts;
      if (!last || r.ts > last) last = r.ts;
    }
    if (!f.requests.length) continue;
    const calls = f.calls.filter((c) => inWindow(f.requests[c.request].ts));
    const c = carriedOutput({ ...f, calls });
    carried.cost += c.total;
    for (const [k, v] of Object.entries(c.byClass)) carried.byClass[k] = (carried.byClass[k] || 0) + v;
    cold.push(...coldResumes(f).filter((x) => inWindow(x.ts)));
    windowed.push({ ...f, calls });
  }

  return {
    prices: { source: PRICE_SOURCE, checked: PRICES_CHECKED, priceAs: priceAs ?? null },
    window: { since: since ?? null, first, last },
    totals,
    models,
    who,
    contextBuckets: buckets,
    coldResumes: {
      count: cold.length,
      cost: cold.reduce((a, x) => a + x.cost, 0),
      medianContext: median(cold.map((x) => x.ctx)),
      medianIdleHours: median(cold.map((x) => x.idleMinutes / 60)),
    },
    carried,
    families: familyUsage(windowed),
    sessions,
    skipped: {
      synthetic: files.reduce((a, f) => a + f.synthetic, 0),
      duplicates: files.reduce((a, f) => a + f.duplicates, 0),
    },
  };
}

// ================================ output ================================

const usd = (x) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x, of) => `${of ? ((100 * x) / of).toFixed(1) : "0.0"}%`;
const kTok = (x) => `${Math.round(x / 1000)}K`;
const top = (obj, n, key = (v) => v) =>
  Object.entries(obj)
    .sort((a, b) => key(b[1]) - key(a[1]))
    .slice(0, n);

/** The human report: line 1 is the verdict, at most 30 lines, aggregates only. */
export function formatReport(report, { logPath } = {}) {
  const t = report.totals;
  const day = (ts) => (ts ? ts.slice(0, 10) : "?");
  const sessionCount = Object.keys(report.sessions).length;
  const lines = [
    `usage: PASS ${usd(t.cost)} across ${sessionCount} sessions, ${t.requests.toLocaleString("en-US")} requests (${day(report.window.first)} to ${day(report.window.last)})`,
    `prices: per request at ${report.prices.priceAs ? `${report.prices.priceAs} rates for every model` : "the serving model's rates"}, ${report.prices.source} checked ${report.prices.checked}`,
    `split: cache reads ${pct(t.read, t.cost)} | cache writes ${pct(t.write, t.cost)} | output ${pct(t.output, t.cost)} | fresh input ${pct(t.input + t.search, t.cost)}`,
    `models: ${top(report.models, 6, (m) => m.cost)
      .map(([name, m]) => `${name} ${usd(m.cost)} (${m.requests})`)
      .join(" | ")}`,
    `who: main sessions ${usd(report.who.main.cost)} (${report.who.main.requests}) | subagents ${usd(report.who.subagents.cost)} (${report.who.subagents.requests})`,
    "context size when called: share of requests / share of cost",
    ...report.contextBuckets.map((b) => `  ${b.label.padEnd(11)} ${pct(b.requests, t.requests).padStart(6)} / ${pct(b.cost, t.cost).padStart(6)}`),
  ];
  const c = report.coldResumes;
  lines.push(
    `cold resumes: ${c.count} main-session re-writes of the whole context after >1h idle, ${usd(c.cost)} = ${pct(c.cost, t.cost)}` +
      (c.count ? `; median context ${kTok(c.medianContext)}, median idle ${c.medianIdleHours.toFixed(1)}h` : ""),
  );
  lines.push(
    `carried tool output (estimate, chars/4): ${usd(report.carried.cost)} = ${pct(report.carried.cost, t.cost)}; top: ` +
      top(report.carried.byClass, 5)
        .map(([k, v]) => `${k} ${pct(v, t.cost)}`)
        .join(", "),
  );
  lines.push("workflow families: calls, bursts, sessions, cost share, saving at one call per burst");
  for (const [name, f] of Object.entries(report.families)) {
    lines.push(
      `  ${name.padEnd(15)} ${String(f.calls).padStart(6)} ${String(f.bursts).padStart(6)} ${String(f.sessions).padStart(3)} ${pct(f.cost, t.cost).padStart(6)} ${pct(f.saving, t.cost).padStart(6)}`,
    );
  }
  lines.push(
    `top sessions: ${top(report.sessions, 4, (s) => s.cost)
      .map(([id, s]) => `${id.slice(0, 8)} ${usd(s.cost)} peak ${kTok(s.peakContext)}`)
      .join(" | ")}`,
  );
  if (logPath) lines.push(`log: ${logPath}`);
  return lines.join("\n");
}

// ================================ shell ================================

const HELP = `usage: node scripts/agent.mjs usage [--since <date>] [--price-as <model>] [--dir <path>]... [--json]

What agent sessions in this repo cost, at official per-model API rates. Read-only.

  --since <date>  only requests at or after this date or ISO time
  --price-as <model>  price every request at this model's rates, so a before/after comparison
                  is not moved by a change of model (e.g. claude-opus-5-5)
  --dir <path>    a transcript directory to read instead of the default (repeatable);
                  default: every ~/.claude/projects folder for this repo and its worktrees
  --json          print the full report as JSON instead of the summary

Exit codes: 0 report produced, 2 could not run (no transcripts, a model with no price, bad args).`;

/** The ~/.claude/projects folder name Claude Code uses for a working directory. */
export const projectFolderName = (dir) => resolve(dir).replace(/[^A-Za-z0-9]/g, "-");

function mainCheckoutRoot(cwd) {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" }).trim();
    return dirname(common);
  } catch {
    return cwd;
  }
}

/** This repo's transcript folders: the main checkout's and every `.claude/worktrees/*` one. */
export function defaultDirs(projectsDir, root) {
  if (!existsSync(projectsDir)) return [];
  const name = projectFolderName(root);
  return readdirSync(projectsDir)
    // Claude Code keeps the drive letter's case as typed, so `d:` and `D:` give two folders.
    .filter((d) => {
      const lower = d.toLowerCase();
      return lower === name.toLowerCase() || lower.startsWith(`${name}--claude-worktrees-`.toLowerCase());
    })
    .map((d) => join(projectsDir, d));
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

/** Session id and subagent flag from a transcript path: `<session>.jsonl` or `<session>/subagents/*.jsonl`. */
export function fileMeta(file) {
  const sub = file.includes(`${sep}subagents${sep}`);
  return { sub, session: sub ? basename(dirname(dirname(file))) : basename(file, ".jsonl") };
}

export function parseArgs(argv) {
  const opts = { dirs: [], json: false, since: undefined, priceAs: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--since" || a === "--dir" || a === "--price-as") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === "--dir") opts.dirs.push(v);
      else if (a === "--price-as") {
        if (!Object.hasOwn(PRICES, v)) throw new Error(`--price-as has no price for ${v}`);
        opts.priceAs = v;
      }
      else if (Number.isNaN(Date.parse(v))) throw new Error(`--since is not a date: ${v}`);
      else opts.since = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

/**
 * Lines split on "\n" only. `node:readline` also ends a line at U+2028 and U+2029, which JSON
 * allows raw inside a string, so it cut 78 real transcript records in half here.
 */
export async function* jsonlLines(chunks) {
  let pending = [];
  for await (const chunk of chunks) {
    let start = 0;
    let end;
    while ((end = chunk.indexOf("\n", start)) !== -1) {
      pending.push(chunk.slice(start, end));
      yield pending.join("");
      pending = [];
      start = end + 1;
    }
    pending.push(chunk.slice(start));
  }
  if (pending.join("")) yield pending.join("");
}

async function readFile(file, seen) {
  const extractor = createExtractor(fileMeta(file), seen);
  let malformed = 0;
  for await (const line of jsonlLines(createReadStream(file, { encoding: "utf8" }))) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformed++; // a line still being written when the file was read
      continue;
    }
    extractor.add(record);
  }
  return { ...extractor.finish(), malformed };
}

export async function main(argv, { env = process.env, cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const fail = (message) => {
    out.write(`usage: ERROR ${message}\n`);
    return 2;
  };
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    return fail(`${error.message}\nnext: node scripts/agent.mjs usage --help`);
  }
  if (opts.help) {
    out.write(`${HELP}\n`);
    return 0;
  }

  const projectsDir = join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  const dirs = opts.dirs.length ? opts.dirs : defaultDirs(projectsDir, mainCheckoutRoot(cwd));
  const files = dirs.filter((d) => existsSync(d)).flatMap((d) => walk(d)).sort();
  if (!files.length) return fail(`no transcripts found in ${dirs.length ? dirs.join(", ") : projectsDir}`);

  const seen = new Set();
  const extracted = [];
  for (const file of files) extracted.push(await readFile(file, seen));

  let report;
  try {
    report = summarize(extracted, { since: opts.since, priceAs: opts.priceAs });
  } catch (error) {
    if (!(error instanceof UnpriceableError)) throw error;
    return fail(`${error.message}\nnext: add the model to PRICES in scripts/agent/usage.mjs from ${PRICE_SOURCE}`);
  }
  if (!report.totals.requests) return fail(`no priced requests in ${files.length} transcripts${opts.since ? ` since ${opts.since}` : ""}`);
  report.input = { files: files.length, dirs, malformedLines: extracted.reduce((a, f) => a + f.malformed, 0) };

  const key = createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 8);
  const logPath = join(tmpdir(), `agent-usage-${env.CLAUDE_CODE_SESSION_ID || "nosession"}-${key}.json`);
  try {
    writeFileSync(logPath, JSON.stringify(report, null, 2));
  } catch (error) {
    err.write(`usage: could not write ${logPath}: ${error.message}\n`);
  }
  out.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report, { logPath })}\n`);
  return 0;
}

