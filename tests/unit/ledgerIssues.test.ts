import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";
// The shipped planner, not a copy of it.
import {
  isMirroredPath,
  markerFor,
  pathFromMarker,
  parseEntry,
  renderIssue,
  planSync,
  issuesFromPages,
  applyActions,
} from "../../scripts/ledger-issues.mjs";

/**
 * Tests for `scripts/ledger-issues.mjs`, the one-way mirror from `tasks/open/` to GitHub issues.
 *
 * Only the pure half is tested here. The `gh` calls are a thin shell around `planSync`, and
 * exercising them would publish to a public repository, which is a one-way door.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "ledger-issues.mjs");
const TARGET = { repo: "owner/repo", branch: "master" };

const entryText = [
  "# The pet reader cannot tell an empty table from an unreachable one",
  "",
  "**Status:** ASSERTED · opened 2026-09-03",
  "",
  "Body paragraph with `code`.",
  "",
  "# A second top-level heading stays in the body",
  "",
  "**Settles when:** someone decides.",
  "",
].join("\n");

const rendered = (path: string, text = entryText) => renderIssue(parseEntry(path, text), TARGET);

describe("which files are mirrored", () => {
  it("mirrors a top-level entry in tasks/open", () => {
    expect(isMirroredPath("tasks/open/drift-test-not-run.md")).toBe(true);
  });

  it("skips session claims, which are locks rather than threads", () => {
    expect(isMirroredPath("tasks/open/CLAIM-home-bulletins.md")).toBe(false);
  });

  it("skips hand-offs, which are one session's working state for the next", () => {
    expect(isMirroredPath("tasks/open/HANDOFF-context-meter.md")).toBe(false);
    // The prefix is the file name's, not a word anywhere in it.
    expect(isMirroredPath("tasks/open/the-HANDOFF-rule.md")).toBe(true);
  });

  it("mirrors any name, because the marker percent-encodes it into printable ASCII", () => {
    // Each of these broke a raw marker: `-->` ends the comment, a regex `.` stops at line breaks
    // (U+2028 and U+2029 included), and GitHub may strip control characters it is sent.
    for (const name of ["a-->b", "a\nb", "a\u2028b", "a\u2029b", "a\tb", "a\u0001b", "a\u0085b", "foo bar", "café"]) {
      const path = `tasks/open/${name}.md`;
      expect(isMirroredPath(path)).toBe(true);
      expect(markerFor(path)).toMatch(/^[\x20-\x7e]+$/);
      expect(pathFromMarker(markerFor(path))).toBe(path);
    }
  });

  it("skips anything outside tasks/open, nested, or not markdown", () => {
    expect(isMirroredPath("tasks/decisions/2026-09-08-x.md")).toBe(false);
    expect(isMirroredPath("tasks/open/archive/old.md")).toBe(false);
    expect(isMirroredPath("tasks/open/notes.txt")).toBe(false);
  });
});

describe("parsing an entry", () => {
  it("takes the title from the first H1 and drops only that line from the body", () => {
    const entry = parseEntry("tasks/open/x.md", entryText);
    expect(entry.title).toBe("The pet reader cannot tell an empty table from an unreachable one");
    expect(entry.body.startsWith("**Status:** ASSERTED")).toBe(true);
    expect(entry.body).toContain("# A second top-level heading stays in the body");
  });

  it("normalises CRLF, because a Windows checkout stores entries that way", () => {
    const entry = parseEntry("tasks/open/x.md", entryText.replace(/\n/g, "\r\n"));
    expect(entry.title).not.toContain("\r");
    expect(entry.body).not.toContain("\r");
  });

  it("falls back to the slug when an entry has no H1", () => {
    expect(parseEntry("tasks/open/no-heading.md", "just a body\n").title).toBe("no-heading");
  });

  it("collapses whitespace in a slug title, so an odd file name cannot re-edit its issue every run", () => {
    expect(parseEntry("tasks/open/a\r\nb.md", "no heading").title).toBe("a b");
    expect(parseEntry("tasks/open/foo .md", "no heading").title).toBe("foo");
  });

  it("clips an over-long title below GitHub's limit, the same way every run", () => {
    const title = parseEntry("tasks/open/x.md", `# ${"word ".repeat(80)}\n\nbody`).title;
    expect([...title].length).toBeLessThanOrEqual(240);
    expect(title.endsWith("…")).toBe(true);
    expect(parseEntry("tasks/open/x.md", `# ${"word ".repeat(80)}\n\nbody`).title).toBe(title);
  });

  it("replaces control characters in a title, which a command-line argument cannot carry", () => {
    // Node refuses a NUL in an argument outright, and the title goes to gh as `--title <title>`.
    const title = parseEntry("tasks/open/x.md", "# Bad\u0000title\u0007here\u007f\n\nbody").title;
    expect([...title].every((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)).toBe(true);
    expect(title).toBe("Bad title here");
    expect(parseEntry("tasks/open/a\u0000b.md", "no heading").title).toBe("a b");
  });

  it("never produces an empty title, which GitHub refuses and which would stall every later run", () => {
    for (const path of ["tasks/open/.md", "tasks/open/ .md"]) {
      expect(parseEntry(path, "no heading").title.trim()).not.toBe("");
    }
  });
});

describe("rendering an issue", () => {
  it("links the source file on the mirrored branch and warns that edits are overwritten", () => {
    const { body } = rendered("tasks/open/x.md");
    expect(body).toContain("https://github.com/owner/repo/blob/master/tasks/open/x.md");
    expect(body.toLowerCase()).toContain("overwritten");
  });

  it("carries a marker that round-trips to the source path, even after GitHub adds CRLF", () => {
    const { body } = rendered("tasks/open/x.md");
    expect(pathFromMarker(body)).toBe("tasks/open/x.md");
    expect(pathFromMarker(body.replace(/\n/g, "\r\n"))).toBe("tasks/open/x.md");
    expect(body.startsWith(markerFor("tasks/open/x.md"))).toBe(true);
  });

  it("finds no marker in an issue a human wrote", () => {
    expect(pathFromMarker("Something is broken on the donate page")).toBeNull();
    expect(pathFromMarker(null)).toBeNull();
  });

  it("reads a marker with broken percent-encoding as no marker, rather than throwing", () => {
    expect(pathFromMarker("<!-- ledger-mirror: tasks/open/%E0%A4%A.md -->")).toBeNull();
  });

  it("round-trips a path with a space or non-ASCII characters, and encodes it in the link", () => {
    for (const path of ["tasks/open/foo bar.md", "tasks/open/café.md"]) {
      expect(pathFromMarker(rendered(path).body)).toBe(path);
    }
    expect(rendered("tasks/open/foo bar.md").body).toContain("/blob/master/tasks/open/foo%20bar.md)");
  });

  it("clips an over-long body below GitHub's limit, keeping the marker and pointing at the file", () => {
    const { body } = renderIssue(parseEntry("tasks/open/x.md", `# Big\n\n${"x".repeat(70_000)}`), TARGET);
    expect([...body].length).toBeLessThanOrEqual(60_000);
    expect(pathFromMarker(body)).toBe("tasks/open/x.md");
    expect(body).toContain("Truncated");
  });

  it("ignores a marker quoted anywhere but the top of the body", () => {
    const quoted = `The mirror keys issues on this line:\n\n${markerFor("tasks/open/x.md")}\n`;
    expect(pathFromMarker(quoted)).toBeNull();
  });
});

describe("planning a sync", () => {
  // Labelled by default, as the script creates them.
  const issue = (
    number: number,
    path: string,
    overrides: Partial<{ title: string; body: string; state: string; labels: { name: string }[] }> = {},
  ) => ({ number, state: "OPEN", labels: [{ name: "ledger" }], ...rendered(path), ...overrides });

  it("creates an issue for an entry that has none", () => {
    const actions = planSync([rendered("tasks/open/a.md")], []);
    expect(actions).toEqual([expect.objectContaining({ type: "create", path: "tasks/open/a.md" })]);
  });

  it("does nothing when the issue already matches, including a CRLF-only difference", () => {
    const current = issue(7, "tasks/open/a.md");
    const crlf = { ...current, body: current.body.replace(/\n/g, "\r\n") };
    expect(planSync([rendered("tasks/open/a.md")], [current])).toEqual([]);
    expect(planSync([rendered("tasks/open/a.md")], [crlf])).toEqual([]);
  });

  it("updates an issue whose body or title drifted from the file", () => {
    const bodyEdited = issue(7, "tasks/open/a.md", { body: `${markerFor("tasks/open/a.md")}\nedited on GitHub` });
    const titleEdited = issue(8, "tasks/open/b.md", { title: "Renamed on GitHub" });
    const actions = planSync([rendered("tasks/open/a.md"), rendered("tasks/open/b.md")], [bodyEdited, titleEdited]);
    expect(actions).toEqual([
      expect.objectContaining({ type: "update", number: 7, path: "tasks/open/a.md" }),
      expect.objectContaining({ type: "update", number: 8, path: "tasks/open/b.md" }),
    ]);
  });

  it("reopens a closed issue whose entry is still open, and updates it if it drifted", () => {
    const closedSame = issue(7, "tasks/open/a.md", { state: "CLOSED" });
    const closedDrifted = issue(8, "tasks/open/b.md", { state: "CLOSED", title: "old" });
    const actions = planSync([rendered("tasks/open/a.md"), rendered("tasks/open/b.md")], [closedSame, closedDrifted]);
    expect(actions.map((a: { type: string; number?: number }) => [a.type, a.number])).toEqual([
      ["reopen", 7],
      ["reopen", 8],
      ["update", 8],
    ]);
  });

  it("closes an open issue whose entry has left tasks/open, and leaves a closed one alone", () => {
    const actions = planSync(
      [rendered("tasks/open/live.md")],
      [issue(6, "tasks/open/live.md"), issue(7, "tasks/open/settled.md"), issue(8, "tasks/open/old.md", { state: "CLOSED" })],
    );
    expect(actions).toEqual([expect.objectContaining({ type: "close", number: 7, path: "tasks/open/settled.md" })]);
  });

  it("refuses to close every mirrored issue when it read no entries at all", () => {
    // Zero entries beside open mirrored issues is a broken read, not a settled ledger.
    expect(() => planSync([], [issue(7, "tasks/open/a.md")])).toThrow(/no entries/);
  });

  it("plans nothing, and does not throw, when there are neither entries nor mirrored issues", () => {
    expect(planSync([], [{ number: 3, state: "OPEN", title: "filed by hand", body: "text" }])).toEqual([]);
  });

  it("never touches an issue without a marker, even one sharing an entry's title", () => {
    const entry = rendered("tasks/open/a.md");
    // Labelled by mistake: the label alone does not make it a mirror.
    const human = { number: 3, state: "OPEN", title: entry.title, body: "filed by hand", labels: [{ name: "ledger" }] };
    expect(planSync([entry], [human])).toEqual([expect.objectContaining({ type: "create", path: "tasks/open/a.md" })]);
  });

  it("ignores a planted marker on an issue without the label, which outsiders cannot set", () => {
    const planted = issue(9, "tasks/open/a.md", { labels: [] });
    // Beside the real mirror it must not stop the run as a duplicate...
    expect(planSync([rendered("tasks/open/a.md")], [issue(7, "tasks/open/a.md"), planted])).toEqual([]);
    // ...and on its own it must not be adopted as the mirror.
    expect(planSync([rendered("tasks/open/a.md")], [planted])).toEqual([
      expect.objectContaining({ type: "create", path: "tasks/open/a.md" }),
    ]);
  });

  it("never closes an unlabelled issue, whatever its marker names", () => {
    const planted = issue(9, "tasks/open/gone.md", { labels: [] });
    expect(planSync([rendered("tasks/open/live.md")], [issue(6, "tasks/open/live.md"), planted])).toEqual([]);
  });

  it("refuses to plan when two open issues claim the same entry, rather than picking one", () => {
    expect(() => planSync([rendered("tasks/open/a.md")], [issue(7, "tasks/open/a.md"), issue(9, "tasks/open/a.md")])).toThrow(
      /#7.*#9|#9.*#7/,
    );
  });

  it("lets an open issue win over a closed duplicate, so closing a duplicate unblocks the sync", () => {
    for (const issues of [
      [issue(7, "tasks/open/a.md", { state: "CLOSED" }), issue(9, "tasks/open/a.md")],
      [issue(9, "tasks/open/a.md"), issue(7, "tasks/open/a.md", { state: "CLOSED" })],
    ]) {
      expect(planSync([rendered("tasks/open/a.md")], issues)).toEqual([]);
    }
  });

  it("reopens the oldest when every duplicate is closed", () => {
    const issues = [issue(9, "tasks/open/a.md", { state: "CLOSED" }), issue(7, "tasks/open/a.md", { state: "CLOSED" })];
    expect(planSync([rendered("tasks/open/a.md")], issues)).toEqual([expect.objectContaining({ type: "reopen", number: 7 })]);
  });
});

describe("reading issues from GraphQL pages", () => {
  const page = (numbers: number[]) => ({
    data: {
      repository: {
        issues: {
          nodes: numbers.map((number) => ({
            number,
            title: `t${number}`,
            body: `b${number}`,
            state: "OPEN",
            labels: { nodes: [{ name: "ledger" }] },
          })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  });

  it("flattens every page into the shape planSync reads, labels included", () => {
    expect(issuesFromPages([page([1, 2]), page([3])])).toEqual([1, 2, 3].map((number) => ({
      number,
      title: `t${number}`,
      body: `b${number}`,
      state: "OPEN",
      labels: [{ name: "ledger" }],
    })));
  });

  it("reads an empty repository as no issues", () => {
    expect(issuesFromPages([page([])])).toEqual([]);
  });
});

describe("applying a plan", () => {
  const plan = [
    { type: "create", path: "tasks/open/a.md", title: "A".repeat(300), body: "body a" },
    { type: "create", path: "tasks/open/b.md", title: "B", body: "body b" },
    { type: "reopen", number: 7, path: "tasks/open/c.md" },
    { type: "update", number: 7, path: "tasks/open/c.md", title: "C", body: "body c" },
    { type: "close", number: 9, path: "tasks/open/gone.md" },
  ];

  // Stands in for `gh`, so the calls can be checked without publishing anything.
  const fakeGh = (rejects: (args: string[]) => boolean) => {
    const calls: { command: string; args: string[]; input?: string }[] = [];
    const exec = (command: string, args: string[], input?: string) => {
      calls.push({ command, args, input });
      if (rejects(args)) throw new Error("Command failed: gh issue create\ntitle is too long");
      return "https://github.com/owner/repo/issues/1";
    };
    return { calls, exec };
  };
  const target = { repo: "owner/repo", sha: "abcdef1", log: () => {} };

  it("stops at the first rejected action — before any close — and says which and why", () => {
    // A close sorted after a failed create would retire a renamed entry's only issue, and a run-wide
    // failure (auth, network, rate limit) only worsens by pressing on.
    const { calls, exec } = fakeGh((args) => args.includes("A".repeat(300)));
    expect(() => applyActions(plan, { ...target, exec })).toThrow(/create tasks\/open\/a\.md.*title is too long/);
    expect(calls).toHaveLength(1);
  });

  it("creates with the label and the body on stdin, and closes with a comment naming the path", () => {
    const { calls, exec } = fakeGh(() => false);
    applyActions(plan, { ...target, exec });
    expect(calls.every((call) => call.command === "gh")).toBe(true);
    expect(calls[1].args).toEqual(["issue", "create", "--repo", "owner/repo", "--title", "B", "--label", "ledger", "--body-file", "-"]);
    expect(calls[1].input).toBe("body b");
    expect(calls[3].args).toEqual(["issue", "edit", "7", "--repo", "owner/repo", "--title", "C", "--body-file", "-"]);
    expect(calls[4].args.slice(0, 4)).toEqual(["issue", "close", "9", "--repo"]);
    expect(calls[4].args.join(" ")).toContain("tasks/open/gone.md");
  });
});

describe("the CLI", () => {
  it("prints usage for --help without reaching git or GitHub", () => {
    const out = execFileSync("node", [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" });
    expect(out).toContain("--apply");
  });
});
