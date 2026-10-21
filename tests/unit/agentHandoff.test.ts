import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { SECTIONS, checkBody, readHandoffs, readHeader, renderHandoff, slugOf } from "../../scripts/agent/handoff.mjs";
import { main as ledger } from "../../scripts/agent/ledger.mjs";
import { main as orient, orientLines, whereAmI } from "../../scripts/agent/orient.mjs";
import { SHOWN, main as recall, piecesOf, search, snippet } from "../../scripts/agent/recall.mjs";

/**
 * A fresh session is cheap only if the old one's state survives the move: `ledger handoff` writes
 * it in a fixed shape, `orient` (the SessionStart hook) says one is waiting, and `recall` gets back
 * what the hand-off left out. These run against throwaway git repositories and transcript folders.
 */

const scratch = mkdtempSync(join(tmpdir(), "agent-handoff-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let made = 0;

/** A git repository with the ledger's folder, its README in `eol` line endings. */
function repo(eol = "\n") {
  const dir = join(scratch, `repo-${made++}`);
  mkdirSync(join(dir, "tasks", "open"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  writeFileSync(join(dir, "tasks", "README.md"), `# The ledger${eol}${eol}Two categories.${eol}`);
  return dir;
}

/** A Claude config folder holding one session's transcript. */
function config(session: string, records: object[]) {
  const dir = join(scratch, `config-${made++}`);
  const folder = join(dir, "projects", "D--Dev-Repos-x");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${session}.jsonl`), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { dir, folder };
}

const BODY = SECTIONS.map(([name]) => `## ${name}\n\n${name} goes here.\n`).join("\n");
const SESSION = "aaaaaaaa-1111-2222-3333-444444444444";
const OTHER = "bbbbbbbb-1111-2222-3333-444444444444";
const NOW = Date.parse("2026-10-21T10:00:00.000Z");

function io(extra: Record<string, unknown> = {}) {
  const sink = { text: "" };
  return { sink, io: { out: { write: (s: string) => (sink.text += s) }, now: NOW, ...extra } };
}

describe("the hand-off file", () => {
  it("is named after its title", () => {
    expect(slugOf("Context meter: PR 2!")).toBe("context-meter-pr-2");
    expect(slugOf("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugOf("名前")).toBe("");
    const long = slugOf("a ".repeat(50) + "end");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("needs all six sections, each with something in it", () => {
    expect(checkBody(BODY)).toEqual([]);
    expect(checkBody(BODY.replace("## Verified\n\nVerified goes here.\n", "## Verified\n\n"))).toEqual(['its "## Verified" section is empty']);
    expect(checkBody(BODY.replace(/## Paths\n\nPaths goes here.\n/, ""))).toEqual(['it has no "## Paths" section']);
    // Any case; trailing hashes are still a heading.
    expect(checkBody(BODY.replace("## Next step", "## next STEP ##"))).toEqual([]);
  });

  it("reads the header by position, so no title or body can pose as a field", () => {
    const top = repo();
    // Each title quotes a field's words, and the body repeats the whole header: none of it is read.
    const body = `# Its own title\n\n**Status:** open · opened 1999-01-01\n\n- **From session:** \`${OTHER}\`\n\n${BODY}`;
    const titles = ["Migration opened 2020-01-01 by mistake", "Fix **From session:** `other`", "Hand-off: nested", "`code`, ~~~ and ```"];
    titles.forEach((title, i) => {
      const text = renderHandoff({ title, date: "2026-10-21", session: SESSION, where: "w.", context: "c.", body });
      expect(readHeader(text)).toEqual({ title, opened: "2026-10-21", session: SESSION });
      writeFileSync(join(top, "tasks", "open", `HANDOFF-${i}.md`), text);
    });
    expect(readHandoffs(top).map((h) => [h.title, h.opened, h.session]).sort()).toEqual(titles.map((title) => [title, "2026-10-21", SESSION]).sort());
    // Lines that are not the header's read as unknown, never as something found further down.
    expect(readHeader(`Notes\n\n${body}`)).toEqual({ title: null, opened: null, session: null });
  });

  it("checks only that each section is a heading with something under it", () => {
    // An H1, the header's fields and fenced blocks are only text in a body.
    const pasted = BODY.replace("Commands and results goes here.\n", "```\n$ cat x.md\n# Title\n**Status:** open\n~~~\n```\n");
    expect(checkBody(`# My own title\n\n${pasted}\n**Settles when:** never\n`)).toEqual([]);
    // ceiling: a heading inside a code block counts as its section, which lets a body through and
    // never refuses one.
    expect(checkBody(BODY.replace("## Open\n\nOpen goes here.\n", "```\n## Open\nnot a section\n```\n"))).toEqual([]);
  });

  it("reads back what it was written with, in the checkout's line endings", () => {
    const top = repo("\r\n");
    const text = renderHandoff({ title: "The meter", date: "2026-10-21", session: SESSION, where: "here.", context: "300K.", body: BODY, eol: "\r\n" });
    expect(text.startsWith("# Hand-off: The meter\r\n\r\n**Status:** open · opened 2026-10-21\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(text).toContain("**Settles when:** the session that continues this work closes it and deletes this file.");
    expect(readHeader(text)).toEqual({ title: "The meter", opened: "2026-10-21", session: SESSION });
    writeFileSync(join(top, "tasks", "open", "HANDOFF-the-meter.md"), text);
    writeFileSync(join(top, "tasks", "open", "not-a-handoff.md"), "# Something open\n");
    expect(readHandoffs(top)).toEqual([
      expect.objectContaining({ file: "tasks/open/HANDOFF-the-meter.md", title: "The meter", session: SESSION, opened: "2026-10-21" }),
    ]);
  });
});

describe("ledger handoff", () => {
  const run = async (args: string[], extra: Record<string, unknown>) => {
    const { sink, io: opts } = io(extra);
    const code = await ledger(args, opts);
    return { code, out: sink.text };
  };

  it("writes the body under a header of what it found out itself", async () => {
    const top = repo("\r\n");
    const { dir } = config(SESSION, [
      { type: "assistant", requestId: "r1", timestamp: "2026-10-21T09:00:00.000Z", message: { id: "m", model: "claude-opus-5-5", content: [], usage: { input_tokens: 1, cache_read_input_tokens: 299_000, cache_creation_input_tokens: 0, output_tokens: 999 } } },
    ]);
    const result = await run(["handoff", "Context meter"], { cwd: top, stdin: BODY, env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: dir } });
    expect(result).toEqual({ code: 0, out: expect.stringMatching(/^ledger: PASS wrote tasks\/open\/HANDOFF-context-meter\.md\nnext: start a fresh session in .* and tell it: Continue from tasks\/open\/HANDOFF-context-meter\.md\n$/) });
    const text = readFileSync(join(top, "tasks", "open", "HANDOFF-context-meter.md"), "utf8");
    expect(text).toContain("\r\n");
    expect(text).toContain(`- **From session:** \`${SESSION}\``);
    expect(text).toMatch(/- \*\*Where:\*\* `.*` on `main` at `no commit`; no `origin\/master` to compare with; \d+ uncommitted paths\./);
    expect(text).toContain("- **Context at hand-off:** 300K tokens on claude-opus-5-5.");
    expect(text).toContain("## Commands and results\r\n\r\nCommands and results goes here.");
    expect(text).toContain("opened 2026-10-21");
  });

  it("takes the body from a file, and says so when it cannot find the session's transcript", async () => {
    const top = repo();
    writeFileSync(join(top, "body.md"), BODY);
    const result = await run(["handoff", "From a file", "--from", "body.md"], { cwd: top, env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: join(scratch, "nowhere") } });
    expect(result.code).toBe(0);
    expect(readFileSync(join(top, "tasks", "open", "HANDOFF-from-a-file.md"), "utf8")).toContain("- **Context at hand-off:** unknown: no transcript of this session was found.");
  });

  it("says the size is unknown, not the transcript missing, when nothing has been asked since a compaction", async () => {
    const top = repo();
    const { dir } = config(SESSION, [
      { type: "assistant", requestId: "r1", timestamp: "2026-10-21T09:00:00.000Z", message: { id: "m", model: "claude-opus-5-5", content: [], usage: { input_tokens: 1, cache_read_input_tokens: 480_000, cache_creation_input_tokens: 0, output_tokens: 9 } } },
      { type: "system", subtype: "compact_boundary", timestamp: "2026-10-21T09:05:00.000Z" },
    ]);
    expect((await run(["handoff", "Compacted"], { cwd: top, stdin: BODY, env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: dir } })).code).toBe(0);
    expect(readFileSync(join(top, "tasks", "open", "HANDOFF-compacted.md"), "utf8")).toContain(
      "- **Context at hand-off:** unknown: no model request in its transcript since its last compaction.",
    );
  });

  it("refuses a body missing a section, and writes nothing", async () => {
    const top = repo();
    const result = await run(["handoff", "Short"], { cwd: top, stdin: "## Decided\n\nyes\n", env: { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: join(scratch, "nowhere") } });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/^ledger: FAIL not written: it has no "## Open" section;/);
    expect(readHandoffs(top)).toEqual([]);
  });

  it("replaces its own session's hand-off, never another session's", async () => {
    const top = repo();
    const env = (session: string) => ({ CLAUDE_CODE_SESSION_ID: session, CLAUDE_CONFIG_DIR: join(scratch, "nowhere") });
    expect((await run(["handoff", "Shared title"], { cwd: top, stdin: BODY, env: env(SESSION) })).code).toBe(0);
    expect((await run(["handoff", "Shared title"], { cwd: top, stdin: BODY.replace("Decided goes here.", "Changed my mind."), env: env(SESSION) })).code).toBe(0);
    const mine = readFileSync(join(top, "tasks", "open", "HANDOFF-shared-title.md"), "utf8");
    expect(mine).toContain("Changed my mind.");
    const theirs = await run(["handoff", "Shared title"], { cwd: top, stdin: BODY, env: env(OTHER) });
    expect(theirs.code).toBe(1);
    expect(theirs.out).toContain(`was written by session ${SESSION}, not this one`);
    // A session continuing that one's work is the one that should replace it.
    expect(theirs.out).toContain("next: if you are continuing its work, delete tasks/open/HANDOFF-shared-title.md and run this again; if not, choose another title");
    expect(readFileSync(join(top, "tasks", "open", "HANDOFF-shared-title.md"), "utf8")).toBe(mine);
  });

  it("records the full session id when given a prefix, so the session can replace its own file", async () => {
    const top = repo();
    const { dir } = config(SESSION, [{ type: "user", uuid: "u", timestamp: "2026-10-21T09:00:00Z", message: { content: "hi" } }]);
    const env = { CLAUDE_CONFIG_DIR: dir };
    expect((await run(["handoff", "Prefixed", "--session", SESSION.slice(0, 8)], { cwd: top, stdin: BODY, env })).code).toBe(0);
    expect(readHeader(readFileSync(join(top, "tasks", "open", "HANDOFF-prefixed.md"), "utf8")).session).toBe(SESSION);
    expect((await run(["handoff", "Prefixed"], { cwd: top, stdin: BODY, env: { ...env, CLAUDE_CODE_SESSION_ID: SESSION } })).code).toBe(0);
    expect((await run(["handoff", "Prefixed", "--session", "short"], { cwd: top, stdin: BODY, env })).code).toBe(2);
    // With no transcript to expand it, a prefix would be recorded as the session and lock it out
    // of its own file.
    const lost = await run(["handoff", "Lost", "--session", SESSION.slice(0, 8)], { cwd: top, stdin: BODY, env: { CLAUDE_CONFIG_DIR: join(scratch, "nowhere") } });
    expect(lost.code).toBe(2);
    expect(lost.out).toBe("ledger: ERROR no transcript of session aaaaaaaa here, and it is not a whole session id to record as it is\nnext: pass the session's full id, a lower-case UUID\n");
    // Session ids are compared as written, so an upper-case one would lock the session out too.
    const upper = await run(["handoff", "Lost", "--session", SESSION.toUpperCase()], { cwd: top, stdin: BODY, env: { CLAUDE_CONFIG_DIR: join(scratch, "nowhere") } });
    expect(upper.code).toBe(2);
    expect(readHandoffs(top).map((h) => h.file)).toEqual(["tasks/open/HANDOFF-prefixed.md"]);
  });

  it("checks the body before it looks for the session, and keeps the title to one line", async () => {
    const top = repo();
    // A prefix that names two sessions makes the lookup fail, so a refused body shows it never ran.
    const { dir, folder } = config(SESSION, []);
    writeFileSync(join(folder, `${SESSION.slice(0, 8)}-ffff-2222-3333-444444444444.jsonl`), "");
    const env = { CLAUDE_CONFIG_DIR: dir };
    expect((await run(["handoff", "Short", "--session", SESSION.slice(0, 8)], { cwd: top, stdin: "## Decided\n\nyes\n", env })).code).toBe(1);
    expect((await run(["handoff", "Long", "--session", SESSION.slice(0, 8)], { cwd: top, stdin: BODY, env })).code).toBe(2);
    expect((await run(["handoff", "Line one\n# Injected"], { cwd: top, stdin: BODY, env: { ...env, CLAUDE_CODE_SESSION_ID: SESSION } })).code).toBe(0);
    expect(readFileSync(join(top, "tasks", "open", "HANDOFF-line-one-injected.md"), "utf8")).toMatch(/^# Hand-off: Line one # Injected\n\n\*\*Status:\*\*/);
    // The session is read from its own field, not from a title that quotes one.
    expect((await run(["handoff", "Fix **From session:** `other`"], { cwd: top, stdin: BODY, env: { ...env, CLAUDE_CODE_SESSION_ID: SESSION } })).code).toBe(0);
    expect(readHeader(readFileSync(join(top, "tasks", "open", "HANDOFF-fix-from-session-other.md"), "utf8")).session).toBe(SESSION);
  });

  it("could not run without a session, a body, a usable title or a known subcommand", async () => {
    const top = repo();
    // Never the developer's own transcripts, should a run get as far as looking up the session.
    const env = { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: join(scratch, "nowhere") };
    expect((await run(["handoff", "x"], { cwd: top, stdin: BODY, env: {} })).code).toBe(2);
    expect((await run(["handoff", "x"], { cwd: top, stdin: "  \n", env })).code).toBe(2);
    expect((await run(["handoff", "名前"], { cwd: top, stdin: BODY, env })).code).toBe(2);
    expect((await run(["handoff", "two", "words"], { cwd: top, stdin: BODY, env })).code).toBe(2);
    expect((await run(["lint"], { cwd: top, env })).out).toMatch(/^ledger: ERROR unknown subcommand lint: only handoff exists yet/);
  });
});

describe("orient", () => {
  const where = {
    top: "D:/repo",
    worktree: false,
    branch: "master",
    head: "abc1234",
    ahead: 2,
    behind: 5,
    uncommitted: 3,
    fetchedMinutesAgo: 90,
    stray: null,
  };
  const handoff = (n: number, session: string) => ({ file: `tasks/open/HANDOFF-h${n}.md`, title: `H${n}`, session, opened: "2026-10-21" });

  it("says where the session is, against origin/master as last fetched", () => {
    expect(orientLines(where, [])).toEqual([
      "orient: PASS main checkout D:/repo on master at abc1234",
      "git: 2 ahead and 5 behind origin/master as of the last fetch, 90 minutes ago; 3 uncommitted paths",
    ]);
    expect(orientLines({ ...where, worktree: true, branch: null, ahead: null }, [])).toEqual([
      "orient: PASS worktree D:/repo on a detached HEAD at abc1234",
      "git: no origin/master to compare with; 3 uncommitted paths",
    ]);
  });

  it("names the hand-offs other sessions left, three at most, and the meter when run as the hook", () => {
    const lines = orientLines(where, [handoff(1, SESSION), handoff(2, OTHER), handoff(3, OTHER), handoff(4, OTHER), handoff(5, OTHER)], { hook: true, session: SESSION });
    expect(lines.slice(2)).toEqual([
      'hand-off: tasks/open/HANDOFF-h2.md "H2", from session bbbbbbbb on 2026-10-21',
      'hand-off: tasks/open/HANDOFF-h3.md "H3", from session bbbbbbbb on 2026-10-21',
      'hand-off: tasks/open/HANDOFF-h4.md "H4", from session bbbbbbbb on 2026-10-21',
      "hand-off: 1 more in tasks/open/HANDOFF-*.md",
      "meter: on. It adds a line when this session should write its hand-off: node scripts/agent.mjs ledger handoff --help",
    ]);
  });

  it("warns when the folder is a .claude/worktrees/ one git does not know, and still exits 0 as the hook", async () => {
    const top = repo();
    const ghost = join(top, ".claude", "worktrees", "ghost");
    mkdirSync(ghost, { recursive: true });
    const w = whereAmI(ghost, { now: NOW });
    expect(w?.stray).toMatch(/\/\.claude\/worktrees\/ghost$/);
    expect(whereAmI(top, { now: NOW })?.stray).toBeNull();
    const plain = io({ cwd: ghost, env: {} });
    expect(await orient([], plain.io)).toBe(1);
    expect(plain.sink.text).toMatch(/^orient: FAIL .*ghost is not a registered worktree, so git resolves it to .*: edits here land in that checkout\nwhere: main checkout /);
    const hook = io({ cwd: ghost, env: {}, stdin: "{}" });
    expect(await orient(["--brief", "--hook"], hook.io)).toBe(0);
    expect(hook.sink.text).toContain("orient: FAIL");
  });

  it("dates the last fetch by the newest FETCH_HEAD, since each worktree writes its own", () => {
    const top = repo();
    expect(whereAmI(top, { now: NOW })?.fetchedMinutesAgo).toBeNull();
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: top, encoding: "utf8" }).trim();
    mkdirSync(join(common, "worktrees", "wt"), { recursive: true });
    writeFileSync(join(common, "worktrees", "wt", "FETCH_HEAD"), "");
    expect(whereAmI(top, { now: Date.now() })?.fetchedMinutesAgo).toBeLessThan(5);
  });

  it("as the hook, knows its own session from the event, so its own hand-off is not news to it", async () => {
    const top = repo();
    writeFileSync(join(top, "tasks", "open", "HANDOFF-mine.md"), renderHandoff({ title: "Mine", date: "2026-10-21", session: SESSION, where: "w", context: "c", body: BODY }));
    const resumed = io({ cwd: top, env: {}, stdin: JSON.stringify({ hook_event_name: "SessionStart", source: "resume", session_id: SESSION }) });
    expect(await orient(["--brief", "--hook"], resumed.io)).toBe(0);
    expect(resumed.sink.text).not.toContain("HANDOFF-mine.md");
    // The event names the session; the environment is only a fallback.
    const fresh = io({ cwd: top, env: { CLAUDE_CODE_SESSION_ID: SESSION }, stdin: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", session_id: OTHER }) });
    expect(await orient(["--brief", "--hook"], fresh.io)).toBe(0);
    expect(fresh.sink.text).toContain('hand-off: tasks/open/HANDOFF-mine.md "Mine", from session aaaaaaaa on 2026-10-21');
  });

  it("exits 0 as the hook even outside a repository, where it could not run", async () => {
    const outside = mkdtempSync(join(tmpdir(), "not-a-repo-"));
    try {
      const plain = io({ cwd: outside, env: {} });
      expect(await orient([], plain.io)).toBe(2);
      expect(await orient(["--hook"], io({ cwd: outside, env: {}, stdin: "not json" }).io)).toBe(0);
      expect(await orient(["--brief"], io({ cwd: outside, env: {} }).io)).toBe(2);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("recall", () => {
  const records = [
    { type: "user", uuid: "u0", isMeta: true, timestamp: "2026-10-21T09:00:00Z", message: { role: "user", content: "the meter, in an injected reminder" } },
    { type: "user", uuid: "u1", timestamp: "2026-10-21T09:01:00Z", message: { role: "user", content: "Build the METER please" } },
    { type: "assistant", uuid: "a1", timestamp: "2026-10-21T09:02:00Z", message: { content: [{ type: "thinking", thinking: "the meter needs a tail read" }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "node scripts/agent.mjs meter" } }] } },
    { type: "user", uuid: "u2", timestamp: "2026-10-21T09:03:00Z", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "meter: PASS context 262K" }] }] } },
    { type: "attachment", uuid: "q1", timestamp: "2026-10-21T09:04:00Z", attachment: { type: "queued_command", prompt: "also check the meter's cold line" } },
  ];

  it("searches what people, the model and the tools wrote, but not the harness's reminders", () => {
    const hits = search(piecesOf(records), "meter");
    expect(hits.map((h) => h.kind)).toEqual(["user", "thinking", "Bash", "Bash result", "user"]);
    expect(search(piecesOf(records, { sub: true }), "tail read").map((h) => h.kind)).toEqual(["sub thinking"]);
    // A piece copied into a second file (a fork) is found once.
    expect(search([...piecesOf(records), ...piecesOf(records)], "please")).toHaveLength(1);
  });

  it("keeps records with no uuid apart, and finds a match where it is in the text as written", () => {
    const bare = (text: string) => [{ type: "user", timestamp: "2026-10-21T09:00:00Z", message: { content: text } }];
    expect(search([...piecesOf(bare("main has the meter")), ...piecesOf(bare("sub has the meter"), { sub: true })], "meter")).toHaveLength(2);
    // Lower-casing turns each "İ" into two characters; the offset must not move with it.
    const [hit] = search(piecesOf(bare(`${"İ".repeat(200)} needle`)), "NEEDLE");
    expect(snippet(hit.text, hit.match, hit.length)).toMatch(/needle$/);
    expect(search(piecesOf(bare("a.b(c) and a+b")), "a.b(c")).toHaveLength(1);
  });

  it("trims to the text around the match, on one line", () => {
    const text = `${"a".repeat(300)} needle\n\n here ${"b".repeat(300)}`;
    const cut = snippet(text, text.indexOf("needle"), 6);
    expect(cut).toMatch(/^…a+ needle here b+…$/);
    expect(cut.length).toBeLessThan(300);
    expect(snippet("short needle", 6, 6)).toBe("short needle");
  });

  const leave = (top: string, name: string, session: string) =>
    writeFileSync(join(top, "tasks", "open", `HANDOFF-${name}.md`), renderHandoff({ title: name, date: "2026-10-21", session, where: "w", context: "c", body: BODY }));

  it("searches the session the hand-off from another session records, subagents included", async () => {
    const top = repo();
    const { dir, folder } = config(OTHER, records);
    mkdirSync(join(folder, OTHER, "subagents"), { recursive: true });
    writeFileSync(join(folder, OTHER, "subagents", "agent-1.jsonl"), JSON.stringify({ type: "user", uuid: "s1", timestamp: "2026-10-21T09:05:00Z", message: { content: "subagent saw the meter" } }) + "\n");
    leave(top, "x", OTHER);
    // This session's own hand-off is not the one it continues from.
    leave(top, "mine", SESSION);
    const { sink, io: opts } = io({ cwd: top, env: { CLAUDE_CONFIG_DIR: dir, CLAUDE_CODE_SESSION_ID: SESSION }, tmp: scratch });
    expect(await recall(["Meter"], opts)).toBe(0);
    const lines = sink.text.trimEnd().split("\n");
    expect(lines[0]).toBe('recall: PASS 6 matches for "Meter" in session bbbbbbbb');
    expect(lines[1]).toBe("10-21 09:01Z user: Build the METER please");
    expect(lines[6]).toBe("10-21 09:05Z sub user: subagent saw the meter");
    expect(lines[7]).toMatch(/^log: .*agent-recall-bbbbbbbb-[0-9a-f]{8}\.txt$/);
  });

  it("asks which session to search when hand-offs from more than one other session are waiting", async () => {
    // Threads share a checkout, so the newest hand-off is not necessarily the one being continued.
    const top = repo();
    const { dir } = config(OTHER, records);
    leave(top, "x", OTHER);
    leave(top, "y", "cccccccc-1111-2222-3333-444444444444");
    leave(top, "mine", SESSION);
    const { sink, io: opts } = io({ cwd: top, env: { CLAUDE_CONFIG_DIR: dir, CLAUDE_CODE_SESSION_ID: SESSION }, tmp: scratch });
    expect(await recall(["meter"], opts)).toBe(2);
    expect(sink.text).toMatch(/^recall: ERROR hand-offs from 2 other sessions are waiting here: /);
    expect(sink.text).toContain("tasks/open/HANDOFF-x.md (bbbbbbbb)");
    expect(sink.text).toContain("tasks/open/HANDOFF-y.md (cccccccc)");
    expect(sink.text).not.toContain("HANDOFF-mine.md");
    expect(sink.text).toMatch(/\nnext: pass --session <id> from the hand-off you are continuing\n$/);
  });

  it(`shows the last ${SHOWN} matches and logs them all; no match is a finding`, async () => {
    const many = Array.from({ length: SHOWN + 5 }, (_, i) => ({ type: "user", uuid: `m${i}`, timestamp: `2026-10-21T09:${String(i).padStart(2, "0")}:00Z`, message: { content: `match ${i}` } }));
    const { dir } = config(OTHER, many);
    const { sink, io: opts } = io({ env: { CLAUDE_CONFIG_DIR: dir }, tmp: scratch });
    expect(await recall(["match", "--session", OTHER.slice(0, 8)], opts)).toBe(0);
    const lines = sink.text.trimEnd().split("\n");
    expect(lines[0]).toBe(`recall: PASS ${SHOWN + 5} matches for "match" in session bbbbbbbb, the last ${SHOWN} shown`);
    expect(lines[1]).toContain("match 5");
    const log = lines.at(-1)!.replace(/^log: /, "");
    expect(readFileSync(log, "utf8")).toContain("match 0");
    // Windows keeps no owner-only mode bits; elsewhere the temp folder may be shared.
    if (process.platform !== "win32") expect(statSync(log).mode & 0o777).toBe(0o600);
    const none = io({ env: { CLAUDE_CONFIG_DIR: dir }, tmp: scratch });
    expect(await recall(["absent", "--session", OTHER], none.io)).toBe(1);
    expect(await recall(["x", "--session", "short"], io({ env: { CLAUDE_CONFIG_DIR: dir } }).io)).toBe(2);
  });
});
