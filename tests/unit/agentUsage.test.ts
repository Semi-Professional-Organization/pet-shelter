import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import {
  PRICES,
  UnpriceableError,
  carriedOutput,
  coldResumes,
  commandClass,
  createExtractor,
  defaultDirs,
  commonClasses,
  parseArgs,
  RARE_CLASS,
  triggerOf,
  familiesOf,
  familyUsage,
  formatReport,
  isTargetedRun,
  orderTranscripts,
  splitChain,
  vitestScripts,
  jsonlLines,
  main,
  priceFiles,
  ratesFor,
  summarize,
} from "../../scripts/agent/usage.mjs";

/**
 * `node scripts/agent.mjs usage` is the measuring stick every later agent script is judged by, so a
 * wrong price or a double-counted request would make every later "saving" fiction. The fixtures
 * are synthetic transcript records in the shapes Claude Code writes, small enough that each
 * expected dollar figure can be worked by hand.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

/** This repo's own test scripts, as the command reads them. */
const VITEST = vitestScripts(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts);
const families = (tool: string, cmd: string) => familiesOf(tool, cmd, VITEST);

/** Text that must never reach the report: it stands in for message and tool-output content. */
const SECRET = "SECRET-CONTENT-7f3a";

type Usage = {
  input?: number;
  read?: number;
  w5?: number;
  w1h?: number;
  out?: number;
  speed?: string;
  geo?: string;
};

function assistant(
  requestId: string,
  usage: Usage,
  {
    model = "claude-opus-5-5",
    ts = "2026-10-01T10:00:00.000Z",
    tools = [] as { id: string; name: string; command?: string; input?: Record<string, string> }[],
  } = {},
) {
  return {
    type: "assistant",
    requestId,
    timestamp: ts,
    message: {
      id: `msg_${requestId}`,
      model,
      content: [
        { type: "text", text: SECRET },
        ...tools.map((t) => ({ type: "tool_use", id: t.id, name: t.name, input: t.input ?? { command: t.command ?? "", description: SECRET } })),
      ],
      usage: {
        input_tokens: usage.input ?? 0,
        cache_read_input_tokens: usage.read ?? 0,
        cache_creation_input_tokens: (usage.w5 ?? 0) + (usage.w1h ?? 0),
        cache_creation: { ephemeral_5m_input_tokens: usage.w5 ?? 0, ephemeral_1h_input_tokens: usage.w1h ?? 0 },
        output_tokens: usage.out ?? 0,
        speed: usage.speed ?? "standard",
        inference_geo: usage.geo ?? "global",
      },
    },
  };
}

/** A message someone typed. */
const PERSON = { type: "user", origin: { kind: "human" }, message: { content: "back again" } };

const toolResult = (id: string, chars: number) => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: "x".repeat(chars) }] }] },
});

/** One file through the same pricing path the command uses. */
const priceFile = (file: ReturnType<typeof extract>) => priceFiles([file])[0];

function extract(records: unknown[], meta = { session: "s1", sub: false }, seen = new Set<string>()) {
  const e = createExtractor(meta, seen, VITEST);
  for (const r of records) e.add(r);
  return e.finish();
}

describe("agent usage: prices", () => {
  it("prices a request at the model that served it, at its own rates", () => {
    expect(ratesFor({ model: "claude-opus-5-5", prompt: 900_000 })).toEqual(PRICES["claude-opus-5-5"]);
    expect(ratesFor({ model: "claude-opus-5", prompt: 10 }).cacheRead).toBe(0.5);
  });

  it("refuses a model, a speed or a region it has no price for, rather than guessing", () => {
    expect(() => ratesFor({ model: "claude-opus-9", prompt: 1 })).toThrow(UnpriceableError);
    // Names an object inherits are not prices; they would price at NaN and exit 0.
    expect(() => ratesFor({ model: "toString", prompt: 1 })).toThrow(UnpriceableError);
    expect(() => ratesFor({ model: "claude-opus-5-5", prompt: 1, geo: "constructor" })).toThrow(UnpriceableError);
    expect(() => ratesFor({ model: "claude-sonnet-5-5", prompt: 1, speed: "fast" })).toThrow(/speed fast/);
    expect(() => ratesFor({ model: "claude-opus-5-5", prompt: 1, speed: "turbo" })).toThrow(/speed turbo/);
    expect(() => ratesFor({ model: "claude-opus-5-5", prompt: 1, geo: "eu" })).toThrow(/inference_geo eu/);
  });

  it("refuses a prompt over 200K on a model from before 4.6, which has no published price for it", () => {
    expect(() => ratesFor({ model: "claude-sonnet-4-5", prompt: 200_001 })).toThrow(/above a 200K prompt/);
    expect(ratesFor({ model: "claude-sonnet-4-5", prompt: 200_000 }).input).toBe(3);
    expect(ratesFor({ model: "claude-opus-4-6", prompt: 900_000 }).input).toBe(5);
  });

  it("refuses US-only inference on a model from before 4.6, which does not take it", () => {
    expect(() => ratesFor({ model: "claude-haiku-4-5", prompt: 1, geo: "us" })).toThrow(UnpriceableError);
    expect(ratesFor({ model: "claude-opus-4-6", prompt: 1, geo: "us" }).input).toBeCloseTo(5.5);
  });

  it("keeps the cache-read discounts the pricing page gives by footnote", () => {
    // Footnotes 1 and 2 on the page as checked: 0.025x input for Fable 5.1, 0.05x for Opus 5.5 and
    // Sonnet 5.5, 0.1x for every other model. Easy to "correct" back to 0.1x by memory.
    expect(PRICES["claude-fable-5-1"].cacheRead).toBe(0.25);
    expect(PRICES["claude-opus-5-5"].cacheRead).toBe(0.2);
    expect(PRICES["claude-sonnet-5-5"].cacheRead).toBe(0.1);
    expect(PRICES["claude-sonnet-5"].cacheRead).toBe(0.2);
  });

  it("prices a dated snapshot id as its model", () => {
    expect(ratesFor({ model: "claude-haiku-4-5-20251001", prompt: 1 })).toEqual(PRICES["claude-haiku-4-5"]);
  });

  it("charges fast mode at the published fast rates, with the cache multipliers on top", () => {
    // Opus 5.5 fast: $8 in, $40 out; caching keeps its multipliers of input.
    expect(ratesFor({ model: "claude-opus-5-5", prompt: 1, speed: "fast" })).toMatchObject({ input: 8, output: 40, cacheRead: 0.4, write1h: 16 });
    expect(ratesFor({ model: "claude-opus-5", prompt: 1, speed: "fast" })).toMatchObject({ input: 10, output: 50 });
    expect(ratesFor({ model: "claude-opus-5-5", prompt: 1, speed: "fast", geo: "us" }).output).toBeCloseTo(44);
    // Under --price-as, the fast premium the request paid is applied to the rates it is priced at.
    expect(ratesFor({ model: "claude-sonnet-5", served: "claude-opus-5-5", prompt: 1, speed: "fast" }).output).toBe(20);
  });

  it("prices the older models the page still lists, by their dated ids", () => {
    expect(ratesFor({ model: "claude-opus-4-1-20250805", prompt: 1 }).output).toBe(75);
    expect(ratesFor({ model: "claude-3-5-haiku-20241022", prompt: 1 }).input).toBe(0.8);
  });

  it("charges US-only inference 1.1x on every category", () => {
    const us = ratesFor({ model: "claude-opus-5-5", prompt: 1, geo: "us" });
    expect(us.output).toBeCloseTo(22);
    expect(us.cacheRead).toBeCloseTo(0.22);
  });

  it("moves every Haiku 5.5 rate, output included, only when the prompt is OVER 100,000", () => {
    expect(ratesFor({ model: "claude-haiku-5-5", prompt: 100_000 }).output).toBe(0.5);
    const over = ratesFor({ model: "claude-haiku-5-5", prompt: 100_001 });
    expect(over).toMatchObject({ input: 0.5, write5m: 0.625, write1h: 1, cacheRead: 0.05, output: 2.5 });
  });

  it("counts cache reads and cache writes toward the Haiku prompt length", () => {
    const file = priceFile(extract([assistant("r1", { input: 1, read: 60_000, w1h: 40_000, out: 1_000_000 }, { model: "claude-haiku-5-5" })]));
    // 100,001 prompt tokens, so a million output tokens bill at $2.50, not $0.50.
    expect(file.requests[0].usd.output).toBeCloseTo(2.5);
  });
});

describe("agent usage: reading transcripts", () => {
  it("merges the streamed lines of one request, keeping the largest output, even when not adjacent", () => {
    const file = extract([
      assistant("r1", { read: 1000, w1h: 10, out: 8 }),
      assistant("r2", { read: 2000, out: 5 }),
      assistant("r1", { read: 1000, w1h: 10, out: 408 }),
    ]);
    expect(file.requests).toHaveLength(2);
    expect(file.requests[0].output_tokens).toBe(408);
  });

  it("counts a request copied into a second transcript once", () => {
    const seen = new Set<string>();
    const a = extract([assistant("r1", { out: 10 })], { session: "s1", sub: false }, seen);
    const b = extract([assistant("r1", { out: 10 }), assistant("r1", { out: 12 })], { session: "s2", sub: true }, seen);
    expect(a.requests).toHaveLength(1);
    expect(b.requests).toHaveLength(0);
    expect(b.duplicates).toBe(1);
  });

  it("skips Claude Code's synthetic messages, which no model served", () => {
    const file = extract([assistant("r1", { out: 3 }, { model: "<synthetic>" })]);
    expect(file.requests).toHaveLength(0);
    expect(file.synthetic).toBe(1);
  });

  it("keeps numbers and labels only, never message text, tool input or tool output", () => {
    const file = extract([
      assistant("r1", { out: 1 }, { tools: [{ id: "t1", name: "Bash", command: `cat ${SECRET}.txt` }] }),
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: SECRET }] } },
    ]);
    expect(file.calls[0]).toMatchObject({ tool: "Bash", class: "cat", resultChars: SECRET.length });
    expect(JSON.stringify(file)).not.toContain(SECRET);
  });

  it("splits lines on newline only, because JSON allows a raw U+2028 inside a string", async () => {
    const ls = String.fromCharCode(0x2028);
    const chunks = ['{"a":"x', `${ls}y"}\n{"b"`, ":1}\n"];
    const lines: string[] = [];
    for await (const line of jsonlLines(chunks)) lines.push(line);
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ a: `x${ls}y` }, { b: 1 }]);
  });
});

describe("agent usage: command classes", () => {
  it("labels a shell call by its leading verb, past cd and env prefixes", () => {
    expect(commandClass("Bash", "cd /x && FOO=1 git diff --stat")).toBe("git diff");
    expect(commandClass("Bash", "npm run test -- tests/unit/x.test.ts")).toBe("npm run test");
    expect(commandClass("PowerShell", "Get-ChildItem C:/")).toBe("Get-ChildItem");
    expect(commandClass("Read", "/any/path")).toBe("Read");
    expect(commandClass("mcp__hearthbot__reply", "")).toBe("mcp__hearthbot");
  });

  it("falls back to a fixed label when the leading words are not plain", () => {
    expect(commandClass("Bash", `'${SECRET} with spaces' arg`)).toBe("Bash other");
    expect(commandClass("Bash", "$(whoami)")).toBe("Bash other");
  });

  it("never turns argument text into a label: paths, flags, or a half-stripped assignment", () => {
    // Each of these leaked a path or a flag into the report before review round 1.
    expect(commandClass("Bash", 'C2="src/lib/a.ts src/app/admin/pets/page.tsx"; git diff $C2')).toBe("Bash other");
    expect(commandClass("PowerShell", "pid=$(netstat -ano | grep 5432)")).toBe("PowerShell other");
    expect(commandClass("Bash", "./scripts/deploy-prod.sh --token=abc")).toBe("Bash other");
    expect(commandClass("Bash", "C:/Users/User/secret-notes.txt")).toBe("Bash other");
    expect(commandClass("Bash", "git --no-pager log")).toBe("Bash other");
    // Separators and npm flags do not hide the verb.
    expect(commandClass("Bash", "npm run typecheck; echo done")).toBe("npm run typecheck");
    expect(commandClass("Bash", "npm run -s test")).toBe("npm run test");
    expect(commandClass("PowerShell", "$env:FOO='1'; npm run lint")).toBe("npm run lint");
    // A key pasted where a command goes: digits keep it out of the report.
    expect(commandClass("Bash", "sk-ant-api03-abcDEF")).toBe("Bash other");
  });
});

describe("agent usage: workflow families", () => {
  it("files a targeted test run under targeted tests only, whichever way it is invoked", () => {
    expect(families("Bash", "npm run test:components -- tests/components/x.test.tsx")).toEqual(["targeted tests"]);
    expect(families("Bash", "npx vitest run tests/unit/x.test.ts")).toEqual(["targeted tests"]);
    expect(families("PowerShell", "npx vitest run tests\\unit\\x.test.ts")).toEqual(["targeted tests"]);
  });

  it("counts ledger and orient reads in PowerShell spellings and through the Read tool", () => {
    expect(families("PowerShell", "Get-ChildItem tasks\\lessons")).toEqual(["orient", "ledger"]);
    expect(families("PowerShell", "Get-Content tasks\\todo.md")).toEqual(["ledger"]);
    expect(families("Read", "D:\\x\\tasks\\open\\a.md")).toEqual(["ledger"]);
    expect(families("Read", "D:/x/src/tasks.ts")).toEqual([]);
  });

  it("does not take a shell redirection for a test filter", () => {
    expect(families("Bash", "npx vitest run --project components 2>&1 | tail -30")).toEqual(["gates"]);
    expect(families("Bash", "npx vitest run > out.txt")).toEqual(["gates"]);
  });

  it("keeps a quoted pipe inside one command, and does not take a test:e2e run for vitest", () => {
    expect(splitChain('grep -E "a|b" tasks/open/x.md | wc -l')).toEqual(['grep -E "a|b" tasks/open/x.md ', " wc -l"]);
    expect(families("Bash", 'grep -E "a|b" tasks/open/x.md')).toEqual(["ledger"]);
    expect(isTargetedRun("npm run test:e2e -- tests/e2e/login.spec.ts", VITEST)).toBe(false);
    expect(families("Bash", "npm run -s test:components -- tests/components/x.test.tsx")).toEqual(["targeted tests"]);
    expect(families("PowerShell", "npm test *>&1")).toEqual(["gates"]);
  });

  it("counts Glob and Grep over the ledger as ledger reads, by the path they were given", () => {
    const file = extract([
      assistant("r1", { out: 1 }, {
        tools: [
          { id: "g1", name: "Grep", input: { pattern: "kill condition", path: "tasks/lessons" } },
          { id: "g2", name: "Glob", input: { pattern: "tasks/open/*.md" } },
          { id: "g3", name: "Grep", input: { pattern: "tasks", path: "src" } },
        ],
      }),
    ]);
    expect(file.calls.map((c: { families: string[] }) => c.families)).toEqual([["ledger"], ["ledger"], []]);
  });

  it("reads the other spellings of the same commands", () => {
    expect(families("Bash", "npm -s run lint")).toEqual(["gates"]);
    expect(families("Bash", "npx tsc -p . --noEmit")).toEqual(["gates"]);
    expect(families("Bash", "npx vitest --run tests/unit/foo.test.ts")).toEqual(["targeted tests"]);
    expect(families("Bash", "npm -s run test:components -- tests/components/A.test.tsx")).toEqual(["targeted tests"]);
    expect(families("Bash", "git -C /d/x worktree list")).toEqual(["orient"]);
    expect(families("Bash", 'git -C "D:/a b" merge-tree --write-tree HEAD origin/master')).toEqual(["merge"]);
  });

  it("files a run that names a whole tier beside a file as the whole tier", () => {
    // vitest ORs paths, so the file adds nothing to tests/unit.
    expect(families("Bash", "npx vitest run tests/unit/a.test.ts tests/unit")).toEqual(["gates"]);
    expect(families("Bash", "npm run test:components -- tests/components/F.test.tsx tests/components")).toEqual(["gates"]);
  });

  it("takes a heredoc's body and a here-string for text, not commands", () => {
    const commit = "git commit -F - <<'EOF'\nfix: x\n\nnpm run lint passes now\ngh pr checks were green\nEOF";
    expect(families("Bash", commit)).toEqual([]);
    expect(families("Bash", "cat > m.txt <<'EOF'\nfix: don't break\nEOF\nnpm run typecheck")).toEqual(["gates"]);
    expect(families("PowerShell", "$m = @'\nnpm run lint, don't\n'@\nnpm run typecheck")).toEqual(["gates"]);
  });

  it("reads a PowerShell path ending in a backslash as a path, not an escape", () => {
    expect(families("PowerShell", 'Set-Location "D:\\Dev\\Repos\\pet-shelter\\"; npm run lint')).toEqual(["gates"]);
  });

  it("looks past wrappers and npx's flags to the program", () => {
    expect(families("Bash", "npx -y tsc --noEmit")).toEqual(["gates"]);
    expect(families("Bash", "npx --yes vitest run tests/unit/a.test.ts")).toEqual(["targeted tests"]);
    expect(families("Bash", "timeout 600 npm run build")).toEqual(["gates"]);
    expect(families("Bash", "time npm run lint")).toEqual(["gates"]);
    expect(families("Bash", "LC_ALL=C cat tasks/todo.md")).toEqual(["ledger"]);
    expect(families("Bash", "node -e \"require('net').connect(5432)\"")).toEqual(["ports"]);
  });

  it("reads vitest's subcommands and an absolute tier path for what they run", () => {
    expect(families("Bash", "npx vitest watch")).toEqual([]);
    expect(families("Bash", "npx vitest related src/lib/x.ts")).toEqual(["targeted tests"]);
    expect(families("Bash", "npx vitest run D:/Dev/Repos/pet-shelter/tests/unit")).toEqual(["gates"]);
  });

  it("matches every family's command where it runs, not where a search mentions it", () => {
    expect(families("Bash", 'grep -n "next build" CLAUDE.md')).toEqual([]);
    expect(families("Bash", 'git log --grep "npx tsc --noEmit"')).toEqual([]);
    expect(families("Bash", 'grep -rn "gh pr checks" tasks/lessons')).toEqual(["ledger"]);
    expect(families("Bash", "gh pr checks 5")).toEqual(["pr"]);
    expect(families("Bash", "npx vitest list tests/unit")).toEqual([]);
    expect(families("Bash", 'echo "a" & npm run lint')).toEqual(["gates"]);
    expect(families("Bash", "npx vitest run 2>&1 | tail")).toEqual(["gates"]);
  });

  it("matches a program where it runs, not where it is mentioned", () => {
    expect(families("Bash", "grep vitest notes.md")).toEqual([]);
    expect(families("Bash", "echo npm test")).toEqual([]);
    expect(families("Bash", "npx vitest tests/unit/a.test.ts")).toEqual(["targeted tests"]);
    expect(families("Bash", "FOO=1 npx vitest run")).toEqual(["gates"]);
    expect(families("Bash", "npm --prefix . run lint")).toEqual(["gates"]);
  });

  it("reads a package.json script only up to the end of its vitest command", () => {
    const scripts = vitestScripts({ a: "vitest run --project unit && eslint", b: "vitest --run --project x", c: "playwright test" });
    expect(scripts.get("a")).toEqual({ filtered: false });
    expect(scripts.get("b")).toEqual({ filtered: false });
    expect(scripts.has("c")).toBe(false);
  });

  it("splits a chain at a newline, and keeps an escaped quote inside its string", () => {
    expect(families("Bash", "npx vitest run tests/unit/a.test.ts\nnpm run lint")).toEqual(["gates", "targeted tests"]);
    expect(families("Bash", 'echo "a\\"b" && cat tasks/todo.md')).toEqual(["ledger"]);
  });

  it("takes a name filter as narrowing even a script that already passes a path", () => {
    expect(families("Bash", 'npm test -- -t "prices"')).toEqual(["targeted tests"]);
    expect(families("Bash", "npm run test -- --testNamePattern=prices")).toEqual(["targeted tests"]);
  });

  it("does not take a write into the ledger, or making a folder there, for a read", () => {
    expect(families("Bash", "cat > tasks/open/x.md <<'EOF'")).toEqual([]);
    expect(families("Bash", "mkdir -p tasks/lessons")).toEqual([]);
  });

  it("counts a shell read of any ledger file, not only todo.md", () => {
    for (const cmd of ["cat tasks/open/a.md", "sed -n 1,80p tasks/open/a.md", "head -20 tasks/decisions/x.md"]) {
      expect(families("Bash", cmd), cmd).toEqual(["ledger"]);
    }
    expect(families("PowerShell", "Get-Content tasks/lessons/README.md")).toEqual(["ledger"]);
  });

  it("files a run over a whole test directory as a gate, not a targeted run", () => {
    expect(families("Bash", "npm run test -- tests/unit")).toEqual(["gates"]);
    expect(families("Bash", "npx vitest run --project unit")).toEqual(["gates"]);
    expect(families("PowerShell", "npx vitest run .\\tests\\unit")).toEqual(["gates"]);
    expect(families("PowerShell", 'npx vitest run "tests/unit"')).toEqual(["gates"]);
    expect(families("Bash", "npx vitest run tests/unit --bail 1 --retry 2")).toEqual(["gates"]);
    expect(families("Bash", "npx vitest run --exclude e2e --hookTimeout 20000")).toEqual(["gates"]);
    expect(families("PowerShell", "npm.cmd run lint")).toEqual(["gates"]);
  });

  it("files a run narrowed by a name filter or a test pattern as targeted", () => {
    for (const cmd of [
      "npx vitest run agentUsage",
      "npm run test:components -- AdminInvitePage",
      'npx vitest run -t "prices"',
      "npx vitest run --testNamePattern=prices",
      "npm run test:integration tests/integration/foo.test.ts",
      "npx vitest run --project unit tests/unit/a.test.ts",
    ]) {
      expect(isTargetedRun(cmd, VITEST), cmd).toBe(true);
      expect(families("Bash", cmd), cmd).toEqual(["targeted tests"]);
    }
  });

  it("classes each command of a chain on its own", () => {
    expect(families("Bash", "npx vitest run tests/unit/a.test.ts && npm run lint")).toEqual(["gates", "targeted tests"]);
    expect(families("Bash", "npm run test:components -- tests/components/a.test.tsx")).toEqual(["targeted tests"]);
  });

  it("files every spelling of a whole-suite gate under gates", () => {
    for (const cmd of ["npm run test", "npm test", "npx vitest run", "npm run test:db", "npm run typecheck"]) {
      expect(families("Bash", cmd), cmd).toEqual(["gates"]);
    }
  });

  it("counts port checks as ports, not every command carrying a database URL", () => {
    expect(families("Bash", "DATABASE_URL=postgresql://u:p@localhost:5432/db npm run db:push:local")).toEqual([]);
    expect(families("PowerShell", "Get-NetTCPConnection -LocalPort 5432")).toEqual(["ports"]);
  });
});

describe("agent usage: the analyses", () => {
  it("splits cost into reads, writes, output and input at the request's rates", () => {
    const [r] = priceFile(extract([assistant("r1", { input: 1_000_000, read: 1_000_000, w5: 1_000_000, w1h: 1_000_000, out: 1_000_000 })])).requests;
    expect(r.usd).toMatchObject({ input: 4, read: 0.2, write: 13, output: 20 });
    expect(r.cost).toBeCloseTo(37.2);
  });

  it("counts a cold resume only after more than an hour idle, a whole-context write, and in a main session", () => {
    const records = [
      assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
      assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T11:01:00.000Z" }), // 61 min: counted
      assistant("r3", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T11:59:00.000Z" }), // 58 min: not
      assistant("r4", { read: 380_000, w1h: 20_000, out: 1 }, { ts: "2026-10-01T14:00:00.000Z" }), // small write: not
    ];
    const main = priceFile(extract(records));
    const cold = coldResumes(main);
    expect(cold).toHaveLength(1);
    // 400K at the $8 one-hour write rate, less the $0.20 read a warm cache would have charged.
    expect(cold[0].cost).toBeCloseTo(3.12);
    expect(coldResumes(priceFile(extract(records, { session: "s1", sub: true })))).toHaveLength(0);
  });

  it("tells a cold resume on a person's message from one after a tool that ran over an hour", () => {
    const person = { type: "user", message: { content: "back again" } };
    const file = priceFile(
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z", tools: [{ id: "t1", name: "Agent" }] }),
        toolResult("t1", 10),
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T11:30:00.000Z" }),
        person,
        assistant("r3", { w1h: 400_000, out: 1 }, { ts: "2026-10-02T09:00:00.000Z" }),
      ]),
    );
    expect(coldResumes(file).map((c: { trigger: string }) => c.trigger)).toEqual(["tool", "person"]);
    const report = summarize([file]);
    expect(report.coldResumes.count).toBe(1);
    expect(report.coldOnAnythingElse.count).toBe(1);
  });

  it("does not take a background notice, or a meta record riding along, for a person's message", () => {
    const notice = { type: "user", origin: { kind: "task-notification" }, message: { content: "task done" } };
    const meta = { type: "user", isMeta: true, message: { content: "reminder" } };
    const human = { type: "user", origin: { kind: "human" }, message: { content: "hi" } };
    expect(triggerOf(notice)).toBe("event");
    expect(triggerOf(meta)).toBeUndefined();
    expect(triggerOf(human)).toBe("person");
    expect(triggerOf({ type: "user", isCompactSummary: true, message: { content: "summary" } })).toBeUndefined();
    // Another session's message carries isMeta as well, and still woke the session.
    expect(triggerOf({ type: "user", isMeta: true, origin: { kind: "peer" }, message: { content: "note" } })).toBe("event");
    expect(triggerOf({ type: "attachment", attachment: { type: "queued_command", isMeta: true, origin: { kind: "peer" } } })).toBe("event");
    const file = priceFile(
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        notice,
        meta,
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T12:00:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)[0].trigger).toBe("event");
  });

  it("takes a queued message from a person for a person, whatever record comes after it", () => {
    const queued = (kind: string | undefined, mode = "prompt") => ({
      type: "attachment",
      attachment: { type: "queued_command", commandMode: mode, ...(kind ? { origin: { kind } } : {}) },
    });
    expect(triggerOf(queued("human"))).toBe("person");
    expect(triggerOf(queued("peer"))).toBe("event");
    expect(triggerOf(queued(undefined, "task-notification"))).toBe("event");
    expect(triggerOf(queued(undefined, "prompt"))).toBe("person");
    expect(triggerOf({ type: "attachment", attachment: { type: "date" } })).toBeUndefined();
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "gh pr checks 5" }] }),
        queued("human"),
        toolResult("a", 10),
        assistant("r2", { out: 50_000 }, { tools: [{ id: "b", name: "Bash", command: "gh pr checks 5" }] }),
      ]),
    );
    expect(file.requests[1].trigger).toBe("person");
    expect(familyUsage([file]).pr).toMatchObject({ bursts: 2, saving: 0 });
  });

  it("takes the answer to AskUserQuestion for the person who gave it", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z", tools: [{ id: "q", name: "AskUserQuestion" }] }),
        toolResult("q", 10),
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T16:00:00.000Z" }),
      ]),
    );
    expect(file.requests[1].trigger).toBe("person");
  });

  it("counts a re-write woken by nothing it can name as neither a person's nor a notice's", () => {
    const report = summarize([
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        { type: "user", isMeta: true, message: { content: "reminder" } },
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T12:00:00.000Z" }),
      ]),
    ]);
    expect(report.coldResumes.count).toBe(0);
    expect(report.coldOnAnythingElse.count).toBe(1);
  });

  it("leaves a request with no readable time out of any --since window", () => {
    const record = assistant("r1", { out: 1_000_000 });
    delete (record as { timestamp?: string }).timestamp;
    const files = [extract([record, assistant("r2", { out: 1 }, { ts: "2026-10-05T10:00:00.000Z" })])];
    expect(summarize(files, { since: "2026-10-02" }).totals.requests).toBe(1);
  });

  it("keeps a burst going across a compaction mid-turn", () => {
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "gh pr checks 5" }] }),
        // No result, then only a compaction's summary: nothing named woke the next request.
        { type: "user", isCompactSummary: true, message: { content: "summary" } },
        assistant("r2", { out: 50_000 }, { tools: [{ id: "b", name: "Bash", command: "gh pr checks 5" }] }),
      ]),
    );
    expect(file.requests[1].trigger).toBeUndefined();
    expect(familyUsage([file]).pr).toMatchObject({ bursts: 1 });
  });

  it("ends a burst when a person's message arrives mid-turn", () => {
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "gh pr checks 5" }] }),
        { type: "user", origin: { kind: "human" }, message: { content: "stop, check again" } },
        assistant("r2", { out: 50_000 }, { tools: [{ id: "b", name: "Bash", command: "gh pr checks 5" }] }),
      ]),
    );
    expect(familyUsage([file]).pr).toMatchObject({ bursts: 2, saving: 0 });
  });

  it("still charges a result from before --since for the reads made inside the window", () => {
    const records = [
      assistant("r1", { read: 10_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z", tools: [{ id: "t1", name: "Read" }] }),
      toolResult("t1", 4_000_000),
      assistant("r2", { read: 10_000, w1h: 1_000_000, out: 1 }, { ts: "2026-10-01T10:01:00.000Z", tools: [{ id: "t2", name: "Read" }] }),
      toolResult("t2", 0),
      assistant("r3", { read: 1_010_000, out: 1 }, { ts: "2026-10-02T10:00:00.000Z" }),
    ];
    // Written before the window, read once inside it at $0.20 per million.
    expect(summarize([extract(records)], { since: "2026-10-02" }).carried.cost).toBeCloseTo(0.2);
  });

  it("leaves a compaction copied into a fork to the parent that had it", () => {
    const seen = new Set<string>();
    const history = [
      assistant("r0", { read: 800_000, out: 1 }, { ts: "2026-10-01T09:00:00.000Z" }),
      { type: "system", subtype: "compact_boundary", uuid: "cb1" },
      assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
    ];
    extract(history, { session: "s1", sub: false }, seen);
    const fork = priceFile(
      extract([...history, assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T14:00:00.000Z" })], { session: "s2", sub: false }, seen),
    );
    expect(fork.compactions).toEqual([]);
    expect(coldResumes(fork)).toHaveLength(1);
  });

  it("measures idle time from when the previous request started, when its cache was last read", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        assistant("r1", { read: 400_000, out: 900 }, { ts: "2026-10-01T10:03:00.000Z" }),
        assistant("r2", { w5: 400_000, out: 1 }, { ts: "2026-10-01T10:06:30.000Z" }),
      ]),
    );
    // 6.5 minutes after r1 started, though only 3.5 after its last line: past a 5-minute cache.
    expect(coldResumes(file)).toHaveLength(1);
  });

  it("does not count the first request after a compaction, which re-writes a new context anyway", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 800_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        { type: "system", subtype: "compact_boundary" },
        assistant("r2", { w1h: 100_000, out: 1 }, { ts: "2026-10-01T12:00:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)).toHaveLength(0);
  });

  it("times a cold resume by the lifetime the context was last written with", () => {
    const file = priceFile(
      extract([
        assistant("r1", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        // 10 minutes later, a 5-minute write: the 1-hour entry was still warm.
        assistant("r2", { read: 100_000, w5: 300_000, out: 1 }, { ts: "2026-10-01T10:10:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)).toHaveLength(0);
  });

  it("measures idle time from a request's start even when its lines interleave with another's", () => {
    const file = priceFile(
      extract([
        assistant("a", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        assistant("b", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:01:00.000Z" }),
        assistant("a", { read: 400_000, out: 9 }, { ts: "2026-10-01T10:02:00.000Z" }),
        assistant("c", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T11:30:00.000Z" }),
      ]),
    );
    expect(file.requests[2].prevTs).toBe("2026-10-01T10:01:00.000Z");
  });

  it("times a cold resume by the lifetime holding most of the context, not the last small write", () => {
    const file = priceFile(
      extract([
        assistant("r1", { w5: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        assistant("r2", { read: 400_000, w1h: 5_000, out: 1 }, { ts: "2026-10-01T10:01:00.000Z" }),
        // 30 minutes later: the 5-minute bulk has expired and is written again.
        assistant("r3", { read: 5_000, w5: 400_000, out: 1 }, { ts: "2026-10-01T10:31:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)).toHaveLength(1);
  });

  it("counts the lifetimes afresh after a compaction, which replaced the context", () => {
    const file = priceFile(
      extract([
        assistant("r1", { w1h: 800_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        { type: "system", subtype: "compact_boundary", uuid: "cb-lifetimes" },
        assistant("r2", { w5: 100_000, out: 1 }, { ts: "2026-10-01T10:01:00.000Z" }),
        // 30 minutes on: the new context was all 5-minute cache, so it expired.
        assistant("r3", { w5: 100_000, out: 1 }, { ts: "2026-10-01T10:31:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)).toHaveLength(1);
  });

  it("charges an uncached result at the input rate where it first went in", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 10_000, out: 1 }, { tools: [{ id: "t1", name: "Read" }] }),
        toolResult("t1", 4_000_000),
        assistant("r2", { input: 1_000_000, read: 10_000, out: 1 }),
        assistant("r3", { read: 1_010_000, out: 1 }),
      ]),
    );
    // r2 took it as fresh input at $4 per million, then r3 read it at $0.20.
    expect(carriedOutput(file).total).toBeCloseTo(4.2);
  });

  it("takes a 5-minute cache as expired after 5 minutes, not an hour", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        assistant("r2", { w5: 400_000, out: 1 }, { ts: "2026-10-01T10:30:00.000Z" }),
      ]),
    );
    expect(coldResumes(file)).toHaveLength(1);
  });

  it("checks a US-only request against both the model that served it and the one it is priced at", () => {
    const record = () => assistant("r1", { out: 1, geo: "us" }, { model: "claude-opus-5-5" });
    expect(() => summarize([extract([record()])], { priceAs: "claude-opus-5" })).not.toThrow();
    // Opus 4.5 has no US-only price, so pricing a US-only request at its rates would invent one.
    expect(() => summarize([extract([record()])], { priceAs: "claude-opus-4-5" })).toThrow(/claude-opus-4-5 with inference_geo us/);
    const served = assistant("r1", { out: 1, geo: "us" }, { model: "claude-opus-4-5" });
    expect(() => summarize([extract([served])], { priceAs: "claude-opus-5-5" })).toThrow(/claude-opus-4-5 with inference_geo us/);
  });

  it("files `npm test` with a file as the whole unit suite, because the script already passes tests/unit", () => {
    // package.json: "test": "vitest run --project unit tests/unit"; vitest ORs path filters.
    expect(VITEST.get("test")).toEqual({ filtered: true });
    for (const cmd of ["npm test -- tests/unit/a.test.ts", "npm test tests/unit/a.test.ts", "npm run -s test -- tests/unit/x.test.ts"]) {
      expect(families("Bash", cmd), cmd).toEqual(["gates"]);
    }
    expect(VITEST.has("test:e2e")).toBe(false);
  });

  it("still sees a cold resume as the first new request of a forked transcript", () => {
    const seen = new Set<string>();
    const history = [assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" })];
    extract(history, { session: "s1", sub: false }, seen);
    const fork = priceFile(
      extract([...history, assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-01T12:00:00.000Z" })], { session: "s2", sub: false }, seen),
    );
    expect(fork.requests).toHaveLength(1);
    expect(coldResumes(fork)).toHaveLength(1);
  });

  it("charges a tool result one cache write and one read per later request, until a compaction", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 10_000, out: 1 }, { tools: [{ id: "t1", name: "Read" }] }),
        toolResult("t1", 4_000_000), // a million tokens, so the dollars are the rates
        assistant("r2", { read: 10_000, w1h: 1_000_000, out: 1 }),
        assistant("r3", { read: 1_010_000, out: 1 }),
        assistant("r4", { read: 1_010_000, out: 1 }),
        { type: "system", subtype: "compact_boundary" },
        assistant("r5", { read: 1_010_000, out: 1 }),
      ]),
    );
    const carried = carriedOutput(file);
    // Written once at $8, read by r3 and r4 at $0.20 each; r5 is past the compaction.
    expect(carried.total).toBeCloseTo(8.4);
    expect(carried.byClass).toEqual({ Read: carried.total });
  });

  it("also ends a segment where the context falls by more than 40%", () => {
    const file = priceFile(
      extract([
        assistant("r1", { read: 10_000, out: 1 }, { tools: [{ id: "t1", name: "Read" }] }),
        toolResult("t1", 4_000_000),
        assistant("r2", { read: 10_000, w1h: 1_000_000, out: 1 }),
        assistant("r3", { read: 100_000, out: 1 }),
      ]),
    );
    expect(carriedOutput(file).total).toBeCloseTo(8);
  });

  it("counts a run of consecutive calls of one family as one burst, and the rest of the run as the saving", () => {
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "npm run typecheck" }] }),
        toolResult("a", 10),
        assistant("r2", { out: 50_000 }, { tools: [{ id: "b", name: "Bash", command: "npm run lint" }] }),
        toolResult("b", 10),
        assistant("r3", { out: 50_000 }, { tools: [{ id: "c", name: "Bash", command: "ls" }] }),
        toolResult("c", 10),
        assistant("r4", { out: 50_000 }, { tools: [{ id: "d", name: "Bash", command: "npm run build" }] }),
      ]),
    );
    const gates = familyUsage([file]).gates;
    expect(gates).toMatchObject({ calls: 3, bursts: 2, sessions: 1 });
    expect(gates.saving).toBeCloseTo(1); // r2: 50K output at $20 per million
  });

  it("ends a burst at the end of a turn, since a call after the person's next message is new work", () => {
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "gh pr checks 5" }] }),
        toolResult("a", 10),
        assistant("r2", { out: 10 }),
        { type: "user", origin: { kind: "human" }, message: { content: "next day" } },
        assistant("r3", { out: 50_000 }, { tools: [{ id: "b", name: "Bash", command: "gh pr checks 5" }] }),
      ]),
    );
    expect(familyUsage([file]).pr).toMatchObject({ calls: 2, bursts: 2, saving: 0 });
  });

  it("counts a tool_use block repeated on a second line of its request once", () => {
    const tool = [{ id: "a", name: "Bash", command: "npm run lint" }];
    const file = priceFile(extract([assistant("r1", { out: 10 }, { tools: tool }), assistant("r1", { out: 20 }, { tools: tool })]));
    expect(file.requests[0].tools).toBe(1);
    expect(file.calls).toHaveLength(1);
  });

  it("keeps a burst going past a Read made in parallel with a family call", () => {
    const file = priceFile(
      extract([
        assistant("r1", { out: 50_000 }, { tools: [{ id: "a", name: "Bash", command: "git fetch origin master" }, { id: "b", name: "Read" }] }),
        toolResult("a", 10),
        toolResult("b", 10),
        assistant("r2", { out: 50_000 }, { tools: [{ id: "c", name: "Bash", command: "git worktree list" }] }),
      ]),
    );
    expect(familyUsage([file]).orient).toMatchObject({ calls: 2, bursts: 1 });
    expect(familyUsage([file]).orient.saving).toBeCloseTo(1);
  });

  it("prices only the --since window, so an unpriceable request before it cannot stop the measurement", () => {
    const files = () => [
      extract([
        assistant("r1", { out: 1 }, { model: "claude-x-1", ts: "2026-10-01T10:00:00.000Z" }),
        assistant("r2", { out: 1_000_000 }, { ts: "2026-10-02T10:00:00.000Z" }),
      ]),
    ];
    expect(() => summarize(files())).toThrow(UnpriceableError);
    expect(summarize(files(), { since: "2026-10-02" }).totals.output).toBeCloseTo(20);
  });

  it("saves nothing for calls issued in parallel from one request, since one command removes no request", () => {
    const parallel = priceFile(
      extract([
        assistant("r1", { out: 30_000 }, {
          tools: [
            { id: "a", name: "Bash", command: "npm run typecheck" },
            { id: "b", name: "Bash", command: "npm run lint" },
            { id: "c", name: "Bash", command: "npm run build" },
          ],
        }),
      ]),
    );
    expect(familyUsage([parallel]).gates).toMatchObject({ calls: 3, bursts: 1, saving: 0 });
  });

  it("refuses a cache write whose 5m/1h split does not account for it, rather than pick a rate", () => {
    const record = assistant("r1", { w1h: 1000, out: 1 });
    record.message.usage.cache_creation = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 };
    expect(() => summarize([extract([record])])).toThrow(/5m\/1h split/);
  });

  it("names every unpriceable request kind at once, and reports nothing partial", () => {
    const files = [extract([assistant("r1", { out: 1 }), assistant("r2", { out: 1 }, { model: "claude-x-1" })])];
    expect(() => summarize(files)).toThrow(/no price for model claude-x-1 \(1 requests\)/);
  });

  it("gives the same report twice from the same records, whatever window came before", () => {
    const files = [
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        PERSON,
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-03T10:00:00.000Z" }),
        PERSON,
        assistant("r3", { w1h: 400_000, out: 1 }, { ts: "2026-10-05T10:00:00.000Z" }),
      ]),
    ];
    summarize(files, { since: "2026-09-01" });
    const later = summarize(files, { since: "2026-10-04" });
    expect(later.totals.requests).toBe(1);
    expect(later.coldResumes.count).toBe(1);
  });

  it("pools a command class seen in one session only, so a pasted secret cannot surface as a label", () => {
    const sessions = { git: new Set(["s1", "s2"]), hunter_secretpassword: new Set(["s1"]) };
    expect(commonClasses({ git: 1, hunter_secretpassword: 2 }, sessions)).toEqual({ git: 1, [RARE_CLASS]: 2 });
  });

  it("prices every request at one model's rates when asked, so a model change cannot pose as a saving", () => {
    const files = () => [extract([assistant("r1", { read: 1_000_000 }, { model: "claude-opus-5" })])];
    expect(summarize(files()).totals.read).toBeCloseTo(0.5);
    expect(summarize(files(), { priceAs: "claude-opus-5-5" }).totals.read).toBeCloseTo(0.2);
  });

  it("windows the totals with --since without losing the earlier gap that makes a resume cold", () => {
    const files = [
      extract([
        assistant("r1", { read: 400_000, out: 1 }, { ts: "2026-10-01T10:00:00.000Z" }),
        PERSON,
        assistant("r2", { w1h: 400_000, out: 1 }, { ts: "2026-10-02T10:00:00.000Z" }),
      ]),
    ];
    const report = summarize(files, { since: "2026-10-02" });
    expect(report.totals.requests).toBe(1);
    expect(report.coldResumes.count).toBe(1);
  });

  it("prints a verdict line first, at most 30 lines, and no content", () => {
    const report = summarize([
      extract([
        assistant("r1", { read: 300_000, out: 10 }, { tools: [{ id: "t1", name: "Bash", command: "git status" }] }),
        toolResult("t1", 100),
        assistant("r2", { read: 300_100, out: 10 }),
      ]),
    ]);
    const text = formatReport(report, { logPath: "/tmp/log.json" });
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^usage: PASS \$\d/);
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(lines.at(-1)).toBe("log: /tmp/log.json");
    expect(lines.at(-2)).toBe("not counted: 0 unreadable lines, 0 copied requests, 0 synthetic messages");
    expect(text).not.toContain(SECRET);
  });
});

describe("agent usage: the command", () => {
  const fixtureDir = (records: unknown[]) => {
    const dir = mkdtempSync(join(tmpdir(), "agent-usage-"));
    mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
    writeFileSync(join(dir, "s1.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
    writeFileSync(join(dir, "s1", "subagents", "agent-a1.jsonl"), JSON.stringify(assistant("sub1", { out: 1000 })) + "\n");
    return dir;
  };
  const cli = (args: string[], cwd = ROOT) => {
    try {
      return { code: 0, out: execFileSync("node", [join(ROOT, "scripts", "agent.mjs"), ...args], { cwd, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "test" } }) };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };

  it("reads a parent before its subagents even where the filesystem records no creation time", () => {
    const parent = { path: "s1.jsonl", born: 0, written: 300, sub: false };
    const fork = { path: "s1/subagents/agent-a.jsonl", born: 0, written: 200, sub: true };
    expect(orderTranscripts([fork, parent])).toEqual(["s1.jsonl", "s1/subagents/agent-a.jsonl"]);
    // With creation times, those decide.
    expect(orderTranscripts([{ ...parent, born: 20 }, { ...fork, born: 10 }])).toEqual(["s1/subagents/agent-a.jsonl", "s1.jsonl"]);
  });

  it("finds this repo's transcript folders whatever case the drive letter was stored in, and no neighbour's", () => {
    // The folder keeps the case of the cwd that first created it (`d:` typed gives `d--`). One
    // case per name, because Windows folders are case-insensitive and the second mkdir would fail.
    const projects = mkdtempSync(join(tmpdir(), "agent-usage-projects-"));
    for (const d of ["d--Dev-Repos-pet-shelter", "D--Dev-Repos-pet-shelter--claude-worktrees-x", "D--Dev-Repos-pet-shelter2"]) {
      mkdirSync(join(projects, d));
    }
    const found = defaultDirs(projects, "D:\\Dev\\Repos\\pet-shelter").map((d: string) => d.slice(projects.length + 1)).sort();
    expect(found).toEqual(["D--Dev-Repos-pet-shelter--claude-worktrees-x", "d--Dev-Repos-pet-shelter"]);
  });

  it("lists usage in --help with its side-effect class", () => {
    expect(cli(["--help"])).toMatchObject({ code: 0, out: expect.stringMatching(/usage\s+\[read-only\]/) });
  });

  it("reports main sessions and subagents from a transcript folder, exit 0", () => {
    const dir = fixtureDir([assistant("r1", { read: 1000, out: 1000 })]);
    const { code, out } = cli(["usage", "--dir", dir, "--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report.who).toMatchObject({ main: { requests: 1 }, subagents: { requests: 1 } });
    expect(Object.keys(report.sessions)).toEqual(["s1"]);
    expect(out).not.toContain(SECRET);
  });

  it("exits 2 on a model with no price, an empty folder, and an unknown argument", () => {
    expect(cli(["usage", "--dir", fixtureDir([assistant("r1", { out: 1 }, { model: "claude-x-1" })])])).toMatchObject({
      code: 2,
      out: expect.stringMatching(/^usage: ERROR no price for model claude-x-1/),
    });
    expect(cli(["usage", "--dir", mkdtempSync(join(tmpdir(), "agent-usage-empty-"))]).code).toBe(2);
    // One folder that does not exist fails the run, rather than leaving its sessions out.
    const real = fixtureDir([assistant("r1", { out: 1 })]);
    expect(cli(["usage", "--dir", real, "--dir", join(real, "typo")])).toMatchObject({ code: 2, out: expect.stringMatching(/no such transcript folder/) });
    expect(cli(["usage", "--frobnicate"]).code).toBe(2);
    expect(cli(["nonesuch"]).code).toBe(2);
    expect(cli([])).toMatchObject({ code: 2, out: expect.stringMatching(/^agent: ERROR no command/) });
  });

  it("reads the test scripts from the checkout's top level when run from a subdirectory", async () => {
    const dir = fixtureDir([assistant("r1", { out: 1 }, { tools: [{ id: "t", name: "Bash", command: "npm test" }] })]);
    let out = "";
    const code = await main(["--dir", dir, "--json"], { cwd: join(ROOT, "src"), out: { write: (s: string) => (out += s) } });
    expect(code).toBe(0);
    expect(JSON.parse(out).families.gates.calls).toBe(1);
  });

  it("resolves --dir against the working directory it was given", async () => {
    const dir = fixtureDir([assistant("r1", { out: 1 })]);
    let out = "";
    const code = await main(["--dir", basename(dir), "--json"], { cwd: dirname(dir), out: { write: (s: string) => (out += s) } });
    expect(code).toBe(0);
    expect(JSON.parse(out).totals.requests).toBe(2);
  });

  it("will not take the next flag as an option's value, and takes a dated id for --price-as", () => {
    expect(() => parseArgs(["--dir", "--json"])).toThrow(/--dir needs a value/);
    expect(parseArgs(["--price-as", "claude-haiku-4-5-20251001"]).priceAs).toBe("claude-haiku-4-5-20251001");
  });

  it("takes --since only as a UTC date or a time with a zone, which mean the same on every machine", () => {
    const dir = fixtureDir([assistant("r1", { out: 1 })]);
    expect(cli(["usage", "--dir", dir, "--since", "2026-10-01T09:00"]).code).toBe(2);
    expect(cli(["usage", "--dir", dir, "--since", "2026-02-30"]).code).toBe(2);
    expect(cli(["usage", "--dir", dir, "--since", "2026-10-01"]).code).toBe(0);
    expect(cli(["usage", "--dir", dir, "--since", "2026-10-01T09:00:00+08:00"]).code).toBe(0);
  });

  it("answers any failure in its own line-1 contract, and refuses to guess the repo without git", () => {
    const notADir = join(fixtureDir([]), "s1.jsonl");
    expect(cli(["usage", "--dir", notADir])).toMatchObject({ code: 2, out: expect.stringMatching(/^usage: ERROR /) });
    const outside = mkdtempSync(join(tmpdir(), "agent-usage-nogit-"));
    expect(cli(["usage"], outside)).toMatchObject({ code: 2, out: expect.stringMatching(/^usage: ERROR git could not name/) });
  });
});
