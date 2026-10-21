import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

import { COMMANDS, cli } from "../../scripts/agent.mjs";
import { REARM, RULES, assess, helpText, main, priceOf, readLatest, readingOf, settle } from "../../scripts/agent/meter.mjs";
import { createExtractor } from "../../scripts/agent/usage.mjs";

/**
 * The context meter tells an agent its real context size and when to hand off, from the session's
 * transcript. It runs after tool calls and before every message, in every session in this repo,
 * so two things matter most: it says each level once, at the owner's sizes, and it can never fail
 * or block the call it rides on. Fixtures are transcript records in the shapes Claude Code writes.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const T0 = Date.parse("2026-10-21T10:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

type Usage = { input?: number; read?: number; w5?: number; w1h?: number; out?: number; model?: string };

/** One streamed line of a model request. */
function line(id: string, minutes: number, { input = 0, read = 0, w5 = 0, w1h = 0, out = 0, model = "claude-opus-5-5" }: Usage = {}) {
  return {
    type: "assistant",
    requestId: id,
    timestamp: at(minutes),
    message: {
      id: `msg_${id}`,
      model,
      content: [],
      usage: {
        input_tokens: input,
        cache_read_input_tokens: read,
        cache_creation_input_tokens: w5 + w1h,
        cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1h },
        output_tokens: out,
      },
    },
  };
}

const toolResult = (minutes: number) => ({
  type: "user",
  timestamp: at(minutes),
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
});

/** A reading at `ctx` tokens whose last request started `idle` minutes before T0. */
const reading = (ctx: number, { idle = 1, ttl = 60, model = "claude-opus-5-5" } = {}) => ({ model, ctx, start: T0 - idle * 60_000, ttl });

const levels = (r: ReturnType<typeof reading>, fired: string[] = [], event = "PostToolUse") => assess({ event, reading: r, fired: new Set(fired), now: T0 });

describe("the reading", () => {
  it("is the last request's prompt plus its output, merged over its streamed lines", () => {
    const records = [
      line("r1", 0, { input: 5, read: 100_000, w1h: 2_000, out: 50 }),
      toolResult(1),
      // Streamed lines repeat the prompt and grow the output; the first line is the request's start.
      line("r2", 2, { input: 3, read: 102_000, w1h: 1_000, out: 10 }),
      line("r2", 3, { input: 3, read: 102_000, w1h: 1_000, out: 400 }),
      toolResult(4),
    ];
    expect(readingOf(records)).toEqual({ model: "claude-opus-5-5", ctx: 3 + 102_000 + 1_000 + 400, start: Date.parse(at(2)), ttl: 60 });
  });

  it("skips a synthetic message and returns null when no request is in view", () => {
    const synthetic = { ...line("s", 9, { read: 1 }), message: { ...line("s", 9).message, model: "<synthetic>" } };
    expect(readingOf([line("r1", 0, { read: 7 }), synthetic])?.ctx).toBe(7);
    expect(readingOf([toolResult(0)])).toBeNull();
  });

  it("takes the cache lifetime that holds most of what was written since the last compaction", () => {
    expect(readingOf([line("a", 0, { w5: 10 })])?.ttl).toBe(5);
    expect(readingOf([line("a", 0, { w5: 10 }), line("b", 1, { read: 10 })])?.ttl).toBe(5);
    expect(readingOf([line("a", 0, { read: 10 })])?.ttl).toBe(60);
    // A small 5-minute write on top of a context cached for an hour does not expire the context.
    expect(readingOf([line("a", 0, { w1h: 300_000 }), line("b", 1, { w5: 2_000 })])?.ttl).toBe(60);
    // It is the total that counts, not the oldest write or the newest.
    expect(readingOf([line("a", 0, { w5: 1_000 }), line("b", 1, { w1h: 900 }), line("c", 2, { w1h: 900 }), line("d", 3, { w5: 10 })])?.ttl).toBe(60);
    // What was written before a compaction is no longer in the context.
    const boundary = { type: "system", subtype: "compact_boundary", timestamp: at(2) };
    expect(readingOf([line("a", 0, { w1h: 300_000 }), boundary, line("b", 3, { w5: 2_000 })])?.ttl).toBe(5);
  });

  it("has none after a compaction until the new context's first request", () => {
    // Claude Code writes no request for the compaction itself, so the last one before the boundary
    // measured the context the compaction replaced.
    const boundary = { type: "system", subtype: "compact_boundary", timestamp: at(5), compactMetadata: { trigger: "auto", preTokens: 480_000, postTokens: 21_000 } };
    const summary = { type: "user", isCompactSummary: true, timestamp: at(5), message: { role: "user", content: "the summary" } };
    const compacted = [line("r1", 0, { read: 480_000 }), boundary, summary];
    expect(readingOf(compacted)).toBeNull();
    expect(readingOf([...compacted, line("r2", 6, { w1h: 21_000 })])?.ctx).toBe(21_000);
  });

  it("reads a request as usage does: the same size, model and start", () => {
    const records = [
      line("r1", 0, { input: 4, read: 10_000, w1h: 500, out: 20 }),
      toolResult(1),
      line("r2", 2, { input: 2, read: 10_500, w5: 30, out: 5 }),
      line("r2", 3, { input: 2, read: 10_500, w5: 30, out: 70 }),
    ];
    const extractor = createExtractor({ session: "s", sub: false });
    for (const record of records) extractor.add(record);
    const last = extractor.finish().requests.at(-1);
    const prompt = last.input_tokens + last.cache_read_input_tokens + last.cache_creation_input_tokens;
    expect(readingOf(records)).toMatchObject({ ctx: prompt + last.output_tokens, model: last.model, start: Date.parse(last.ts) });
  });

  it("finds the last request beyond a first tail read, past a tool result bigger than the read", () => {
    const dir = mkdtempSync(join(tmpdir(), "meter-tail-"));
    try {
      const path = join(dir, "s.jsonl");
      const big = { ...toolResult(5), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x".repeat(4096) }] } };
      writeFileSync(path, [line("r1", 0, { read: 1_000 }), line("r2", 4, { read: 2_000 }), big].map((r) => JSON.stringify(r)).join("\n") + "\n");
      expect(readLatest(path, 512)?.ctx).toBe(2_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the levels", () => {
  it("says nothing below 250K", () => {
    expect(levels(reading(249_000))).toMatchObject({ lines: [], fire: [], announce: null });
  });

  it("asks for the hand-off before going quiet from 250K, at the next milestone from 300K, and now from 500K", () => {
    expect(levels(reading(260_000)).lines[0]).toMatch(/^meter: context 260K on claude-opus-5-5; every call re-reads it, about \$0\.05 each\. From now on, before you end a turn that waits on a person, write your hand-off state/);
    expect(levels(reading(310_000), ["quiet-250000"]).lines[0]).toMatch(/At the next milestone, write your hand-off state .* and ask to continue in a fresh session\.$/);
    expect(levels(reading(520_000), ["quiet-250000", "milestone-300000"]).lines[0]).toMatch(/\$0\.10 each\. Hand off now: write your hand-off state/);
  });

  it("announces each level once, and only the highest of several crossed at once", () => {
    const first = levels(reading(520_000));
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toContain("Hand off now");
    expect(first.fire).toEqual(["quiet-250000", "milestone-300000", "now-500000"]);
    expect(first.announce).toBe("now-500000");
    expect(levels(reading(900_000), first.fire).lines).toEqual([]);
  });

  it("re-arms a level only when the context falls well below it, as after a compaction", () => {
    const fired = ["quiet-250000", "milestone-300000"];
    // Hovering just under a level is not a new context.
    expect(levels(reading(240_000), fired).rearm).toEqual([]);
    const compacted = levels(reading(100_000), fired);
    expect(compacted.rearm).toEqual(["quiet-250000", "milestone-300000"]);
    expect(REARM * 250_000).toBeGreaterThan(100_000);
    expect(levels(reading(260_000), []).announce).toBe("quiet-250000");
  });

  it("lists in its help the levels it acts on, read from the same table", () => {
    const help = helpText();
    for (const [model, rule] of Object.entries(RULES)) {
      const section = help.slice(help.indexOf(model === "default" ? "any other model:" : `${model}:`));
      for (const [, size] of rule.levels) expect(section).toMatch(new RegExp(`^ {4}${Number(size) / 1000}K `, "m"));
    }
    expect(help).toContain("    250K  and up: the cold-resume line");
  });

  it("warns a Haiku 5.5 session at 80K and hands it off at 90K, naming the price step", () => {
    const haiku = { model: "claude-haiku-5-5" };
    expect(levels(reading(79_000, haiku)).lines).toEqual([]);
    const warn = levels(reading(85_000, haiku));
    expect(warn.announce).toBe("milestone-80000");
    expect(warn.lines[0]).toMatch(/At the next milestone, .* On this model a request whose prompt passes 100K costs 5 times as much\.$/);
    expect(levels(reading(92_000, haiku), warn.fire).lines[0]).toContain("Hand off now");
  });

  it("prices a call by the context it re-reads, and leaves the price out for a model it cannot price", () => {
    // Opus 5.5: cache reads $0.20 and 1-hour cache writes $8 per million tokens.
    const opus = priceOf(reading(600_000));
    expect(opus?.read).toBeCloseTo(0.12, 10);
    expect(opus?.rewrite).toBeCloseTo(600_000 * (8 - 0.2) / 1e6, 10);
    // A 5-minute lifetime re-writes at the 5-minute rate, $5.
    expect(priceOf(reading(600_000, { ttl: 5 }))?.rewrite).toBeCloseTo(600_000 * (5 - 0.2) / 1e6, 10);
    expect(priceOf(reading(600_000, { model: "claude-unknown-9" }))).toBeNull();
    // Fast mode doubles Opus 5.5's rates and US-only inference adds a tenth, as usage prices them.
    const plain = line("f", 0, { read: 600_000 });
    const fast = readingOf([{ ...plain, message: { ...plain.message, usage: { ...plain.message.usage, speed: "fast", inference_geo: "us", service_tier: "standard" } } }]);
    expect(fast).toMatchObject({ speed: "fast", geo: "us", tier: "standard" });
    expect(priceOf(fast)?.read).toBeCloseTo((600_000 * 0.2 * 2 * 1.1) / 1e6, 10);
    expect(priceOf({ ...reading(600_000), tier: "batch" })).toBeNull();
    expect(levels(reading(300_000, { model: "claude-unknown-9" })).lines[0]).toMatch(/^meter: context 300K on claude-unknown-9\. At the next milestone/);
  });
});

describe("a cold resume", () => {
  const cold = (r: ReturnType<typeof reading>, event = "UserPromptSubmit") => levels(r, ["quiet-250000"], event);

  it("is a message that arrives after the cache expired in a session of 250K or more, priced", () => {
    const result = cold(reading(600_000, { idle: 22 * 60 }));
    expect(result.cold).toBe(true);
    expect(result.lines).toEqual([
      "meter: cold resume. The last request was 22 hours ago and this session's cache lives 1 hour, so this turn re-writes the whole 600K context, about $4.68 more than a warm turn. Answer this message, then write your hand-off state (node scripts/agent.mjs ledger handoff --help) and ask to continue in a fresh session.",
    ]);
    // Its line stands in for the level's, and the level is still marked announced.
    expect(result.announce).toBeNull();
    expect(result.fire).toEqual(["milestone-300000", "now-500000"]);
  });

  it("follows the lifetime the cache was written with", () => {
    expect(cold(reading(300_000, { idle: 59 })).cold).toBe(false);
    expect(cold(reading(300_000, { idle: 61 })).cold).toBe(true);
    expect(cold(reading(300_000, { idle: 6, ttl: 5 })).cold).toBe(true);
  });

  it("is not called in a small session, or after a tool call, which a person was not waiting on", () => {
    expect(cold(reading(249_000, { idle: 600 })).cold).toBe(false);
    expect(cold(reading(600_000, { idle: 600 }), "PostToolUse").cold).toBe(false);
  });
});

describe("the hook", () => {
  const tmp = mkdtempSync(join(tmpdir(), "meter-hook-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const transcript = (name: string, records: object[]) => {
    const path = join(tmp, `${name}.jsonl`);
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
    return path;
  };
  const big = transcript("big", [line("r1", 0, { read: 520_000, w1h: 1_000, out: 100 })]);

  async function run(event: object, now = T0 + 60_000) {
    let out = "";
    const code = await main(["--hook"], { stdin: JSON.stringify(event), tmp, now, out: { write: (s: string) => (out += s) } });
    return { code, out };
  }

  it("adds its line to the agent's context once, as the hook's additional context", async () => {
    const event = { session_id: "s-once", transcript_path: big, hook_event_name: "PostToolUse", tool_name: "Bash" };
    const first = await run(event);
    expect(first.code).toBe(0);
    expect(JSON.parse(first.out)).toEqual({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: expect.stringMatching(/^meter: context 521K .* Hand off now/) },
    });
    expect(readdirSync(join(tmp, "claude-meter", "s-once")).sort()).toEqual(["milestone-300000", "now-500000", "quiet-250000"]);
    expect(await run(event)).toEqual({ code: 0, out: "" });
  });

  it("answers a message under its own event name", async () => {
    const { out } = await run({ session_id: "s-prompt", transcript_path: big, hook_event_name: "UserPromptSubmit", prompt: "hi" }, T0 + 3 * 3_600_000);
    const added = JSON.parse(out).hookSpecificOutput;
    expect(added.hookEventName).toBe("UserPromptSubmit");
    expect(added.additionalContext).toMatch(/^meter: cold resume\. The last request was 3 hours ago/);
  });

  it("says nothing when a message arrives after a compaction, before the new context's first request", async () => {
    // Idle compaction runs shortly before the cache expires, so the next message comes after it.
    const compacted = transcript("compacted", [line("r1", 0, { read: 520_000, w1h: 1_000 }), { type: "system", subtype: "compact_boundary", timestamp: at(55) }]);
    expect(await run({ session_id: "s-compacted", transcript_path: compacted, hook_event_name: "UserPromptSubmit", prompt: "back" }, T0 + 3 * 3_600_000)).toEqual({ code: 0, out: "" });
  });

  it("says nothing for an event with no session, which has nowhere of its own to keep its levels", async () => {
    expect(await run({ transcript_path: big, hook_event_name: "PostToolUse", tool_name: "Read" })).toEqual({ code: 0, out: "" });
    expect(existsSync(join(tmp, "claude-meter", "nosession"))).toBe(false);
  });

  it("says nothing inside a subagent, whose context is not the session's", async () => {
    expect(await run({ session_id: "s-sub", agent_id: "a1", agent_type: "Explore", transcript_path: big, hook_event_name: "PostToolUse" })).toEqual({ code: 0, out: "" });
    expect(existsSync(join(tmp, "claude-meter", "s-sub"))).toBe(false);
  });

  it("never fails or blocks the call: bad input is logged and exits 0 in silence", async () => {
    let out = "";
    const write = (s: string) => (out += s);
    expect(await main(["--hook"], { stdin: "not json", tmp, now: T0, out: { write } })).toBe(0);
    expect(await main(["--hook", "--bogus"], { stdin: "{}", tmp, now: T0, out: { write } })).toBe(0);
    expect(await run({ session_id: "s-missing", transcript_path: join(tmp, "nope.jsonl"), hook_event_name: "PostToolUse" })).toEqual({ code: 0, out: "" });
    expect(out).toBe("");
    expect(readFileSync(join(tmp, "claude-meter", "errors.log"), "utf8")).toContain("SyntaxError");
  });

  it("shows a level once when two hooks read the markers before either wrote one", () => {
    const dir = join(tmp, "claude-meter", "s-race");
    mkdirSync(dir, { recursive: true });
    // Both parallel tool calls' hooks saw no markers, so both assessed the same level as new.
    const first = assess({ event: "PostToolUse", reading: reading(260_000), fired: new Set(), now: T0 });
    const second = assess({ event: "PostToolUse", reading: reading(260_000), fired: new Set(), now: T0 });
    expect(settle(dir, first)).toHaveLength(1);
    expect(settle(dir, second)).toEqual([]);
  });

  it("exits 0 and says nothing as a hook, even when a command's module will not load", async () => {
    let out = "";
    const write = (s: string) => (out += s);
    const broken = { meter: { load: () => Promise.reject(new Error("SyntaxError in meter.mjs")) } };
    expect(await cli(["meter", "--hook"], { commands: broken, out: { write } })).toBe(0);
    expect(await cli(["gone", "--hook"], { commands: broken, out: { write } })).toBe(0);
    expect(out).toBe("");
    // The same failures, run by hand, could not run.
    expect(await cli(["meter"], { commands: broken, out: { write } })).toBe(2);
    expect(out).toBe("agent: ERROR SyntaxError in meter.mjs\n");
  });

  it("exits 0 from the entry point whatever goes wrong, since exit 2 on UserPromptSubmit drops the message", () => {
    const agent = join(ROOT, "scripts", "agent.mjs");
    for (const args of [["meter", "--hook"], ["no-such-command", "--hook"]]) {
      // execFileSync throws on a non-zero exit, so returning at all is the assertion.
      expect(execFileSync(process.execPath, [agent, ...args], { input: "not json", encoding: "utf8", env: { ...process.env, TMP: tmp, TEMP: tmp, TMPDIR: tmp } })).toBe("");
    }
  });

  it("is wired after tool calls, when a message arrives, and orient when a session starts", () => {
    const hooks = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8")).hooks;
    const commands = (event: string) => hooks[event].flatMap((entry: { hooks: { command: string }[] }) => entry.hooks.map((h) => h.command));
    const meter = 'node "${CLAUDE_PROJECT_DIR}/scripts/agent.mjs" meter --hook';
    // After every tool, not only the shells and edits the drift log's matcher names: Read, Grep
    // and Agent results are what grow a context fastest. An entry with no matcher was seen firing
    // after Read, Grep and Glob on Claude Code 2.1.304.
    const after = hooks.PostToolUse.filter((entry: { hooks: { command: string }[] }) => entry.hooks.some((h) => h.command === meter));
    expect(after).toHaveLength(1);
    expect(after[0].matcher).toBeUndefined();
    expect(commands("UserPromptSubmit")).toEqual([meter]);
    expect(commands("SessionStart")).toEqual(['node "${CLAUDE_PROJECT_DIR}/scripts/agent.mjs" orient --brief --hook']);
    // Every hook that runs the entry point names a command it has.
    for (const event of Object.keys(hooks)) {
      for (const command of commands(event)) {
        const name = /scripts\/agent\.mjs" (\S+)/.exec(command)?.[1];
        if (name) expect(Object.hasOwn(COMMANDS, name)).toBe(true);
      }
    }
    // Each has a timeout of its own, so a hung meter cannot hold a session for the 600 s default.
    for (const event of ["PostToolUse", "UserPromptSubmit", "SessionStart"]) {
      for (const entry of hooks[event]) {
        for (const h of entry.hooks) if (h.command.includes("scripts/agent.mjs")) expect(h.timeout).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe("by hand", () => {
  it("reads the named session from the transcript folders, and says when the cache has gone cold", async () => {
    const config = mkdtempSync(join(tmpdir(), "meter-config-"));
    try {
      const folder = join(config, "projects", "D--some-repo");
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "0123456789abcdef.jsonl"), JSON.stringify(line("r1", 0, { read: 310_000, w1h: 0, out: 0 })) + "\n");
      let out = "";
      const code = await main(["--session", "01234567"], { env: { CLAUDE_CONFIG_DIR: config }, now: T0 + 90 * 60_000, out: { write: (s: string) => (out += s) } });
      expect(code).toBe(0);
      expect(out.split("\n")[0]).toBe("meter: PASS context 310K on claude-opus-5-5; every call re-reads it, about $0.06 each");
      expect(out).toContain("cache: last request 90 minutes ago; it lives 1 hour, so it is cold");
      expect(out).toContain("next: At the next milestone, write your hand-off state");
      out = "";
      expect(await main([], { env: {}, now: T0, out: { write: (s: string) => (out += s) } })).toBe(2);
      expect(out).toMatch(/^meter: ERROR no session/);
    } finally {
      rmSync(config, { recursive: true, force: true });
    }
  });
});
