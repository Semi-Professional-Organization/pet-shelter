import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
// The shipped planner, not a copy of it.
import {
  CONFIG_PATH,
  LABEL,
  markerFor,
  keyFromMarker,
  validateConfig,
  renderParent,
  planGroups,
  issuesFromPages,
  applyActions,
  suggest,
  evaluate,
  features,
  isMissingIssueError,
  canApply,
} from "../../scripts/issue-groups.mjs";

/**
 * Tests for `scripts/issue-groups.mjs`, which makes GitHub's parent issues and sub-issues match
 * `.github/issue-groups.json`.
 *
 * Only the pure half is tested, as for `ledger-issues.mjs`: the `gh` calls would change a public
 * repository. `applyActions` runs against a recording `exec`.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "issue-groups.mjs");
const TARGET = { repo: "owner/repo", branch: "master" };

type Issue = {
  number: number;
  id: string;
  title: string;
  state: "OPEN" | "CLOSED";
  body: string;
  labels: { name: string }[];
  parent: number | string | null;
  children?: { number: number; id: string; state: string; foreign?: string }[];
};

const issue = (number: number, extra: Partial<Issue> = {}): Issue => ({
  number,
  id: `I_${number}`,
  title: `Issue ${number}`,
  state: "OPEN",
  body: "",
  labels: [],
  parent: null,
  ...extra,
});

const group = (key: string, issues: number[], title = `Group ${key}`) => ({ key, title, summary: `About ${key}.`, issues });

/** A parent exactly as the script would have left it, with `children` linked. */
const parentFor = (number: number, g: ReturnType<typeof group>, children: number[], extra: Partial<Issue> = {}): Issue => {
  const rendered = renderParent(g, TARGET);
  return issue(number, {
    title: rendered.title,
    body: rendered.body,
    labels: [{ name: LABEL }],
    children: children.map((child) => ({ number: child, id: `I_${child}`, state: "OPEN" })),
    ...extra,
  });
};

const types = (actions: { type: string }[]) => actions.map((action) => action.type);

describe("the grouping file", () => {
  it("the shipped file is valid", () => {
    expect(() => validateConfig(JSON.parse(readFileSync(resolve(ROOT, CONFIG_PATH), "utf8")))).not.toThrow();
  });

  it("refuses an issue in two groups, because an issue can have only one parent", () => {
    expect(() => validateConfig({ groups: [group("a", [1, 2]), group("b", [2])] })).toThrow(/#2 is in both a and b/);
  });

  it("refuses an issue that is both grouped and standalone", () => {
    expect(() => validateConfig({ groups: [group("a", [1])], standalone: [1] })).toThrow(/#1 is in both a and standalone/);
  });

  it("names every problem at once", () => {
    const error = (() => {
      try {
        validateConfig({ groups: [group("Bad Key", [1]), group("a", []), group("a", [0]), { key: "c", issues: [3] }] });
      } catch (e) {
        return String(e);
      }
    })();
    expect(error).toMatch(/Bad Key: key must be/);
    expect(error).toMatch(/a: needs at least one issue/);
    expect(error).toMatch(/a: key is used twice/);
    expect(error).toMatch(/0 is not an issue number/);
    expect(error).toMatch(/c: needs a title/);
  });

  it("refuses a standalone list that is not an array with the collected message, not a crash", () => {
    expect(() => validateConfig({ groups: [group("a", [1])], standalone: {} })).toThrow(/is invalid:\n {2}"standalone" must be an array$/);
    expect(() => validateConfig({ groups: [group("a", [1])], standalone: "12" })).toThrow(/is invalid:\n {2}"standalone" must be an array$/);
  });

  it("reads a parent's key only from a marker at the top of its body", () => {
    expect(keyFromMarker(`${markerFor("test-suite")}\nrest`)).toBe("test-suite");
    expect(keyFromMarker(`quoting it: ${markerFor("test-suite")}`)).toBeNull();
  });
});

describe("planning", () => {
  it("creates each parent and adds its issues when nothing exists yet", () => {
    const { actions } = planGroups({ groups: [group("a", [1, 2])] }, [issue(1), issue(2)], TARGET);
    expect(actions.map((a: { type: string; child?: number }) => [a.type, a.child ?? null])).toEqual([
      ["create", null],
      ["add", 1],
      ["add", 2],
    ]);
    expect(actions[0]).toMatchObject({ body: expect.stringMatching(new RegExp(`^${markerFor("a")}\n`)) });
  });

  it("plans nothing when GitHub already matches, so a second run is a no-op", () => {
    const g = group("a", [1, 2]);
    const issues = [parentFor(10, g, [1, 2]), issue(1, { parent: 10 }), issue(2, { parent: 10 })];
    expect(planGroups({ groups: [g] }, issues, TARGET).actions).toEqual([]);
  });

  it("moves an issue from another parent, naming the one it leaves, and does not also remove it", () => {
    const a = group("a", [1]);
    const b = group("b", [2]);
    const issues = [parentFor(10, a, [1, 2]), parentFor(11, b, []), issue(1, { parent: 10 }), issue(2, { parent: 10 })];
    const { actions } = planGroups({ groups: [a, b] }, issues, TARGET);
    expect(actions).toEqual([
      expect.objectContaining({ type: "move", child: 2, from: 10, parent: 11, parentId: "I_11", childId: "I_2" }),
    ]);
  });

  it("moves an issue a person linked under a parent the script does not manage", () => {
    const { actions } = planGroups({ groups: [group("a", [1])] }, [issue(1, { parent: 99 }), issue(99)], TARGET);
    expect(actions[1]).toMatchObject({ type: "move", child: 1, from: 99, parent: null });
  });

  it("removes a sub-issue no group wants any more", () => {
    const g = group("a", [1]);
    const issues = [parentFor(10, g, [1, 2]), issue(1, { parent: 10 }), issue(2, { parent: 10 })];
    expect(planGroups({ groups: [g] }, issues, TARGET).actions).toEqual([
      expect.objectContaining({ type: "remove", parent: 10, child: 2, childId: "I_2" }),
    ]);
  });

  it("updates a parent whose title or description differs from the file", () => {
    const g = group("a", [1]);
    const issues = [parentFor(10, g, [1], { title: "Edited on GitHub" }), issue(1, { parent: 10 })];
    expect(planGroups({ groups: [g] }, issues, TARGET).actions).toEqual([
      expect.objectContaining({ type: "update", number: 10, title: g.title }),
    ]);
  });

  it("reopens a closed parent whose group is in the file, and closes one whose group left it", () => {
    const a = group("a", [1]);
    const gone = group("gone", [2]);
    const issues = [
      parentFor(10, a, [1], { state: "CLOSED" }),
      parentFor(11, gone, [2]),
      issue(1, { parent: 10 }),
      issue(2, { parent: 11 }),
    ];
    const { actions } = planGroups({ groups: [a] }, issues, TARGET);
    expect(actions).toEqual([
      expect.objectContaining({ type: "reopen", number: 10 }),
      expect.objectContaining({ type: "remove", parent: 11, child: 2 }),
      expect.objectContaining({ type: "close", number: 11, key: "gone" }),
    ]);
  });

  it("lets a closed parent of a departed group go of its sub-issues, and leaves it closed", () => {
    const gone = group("gone", [2]);
    const issues = [parentFor(11, gone, [2], { state: "CLOSED" }), issue(2, { parent: 11 }), issue(3)];
    const { actions } = planGroups({ groups: [group("a", [3])] }, issues, TARGET);
    expect(actions.filter((a) => "parent" in a && a.parent === 11)).toEqual([
      expect.objectContaining({ type: "remove", child: 2 }),
    ]);
    expect(types(actions)).not.toContain("close");
  });

  it("says so when a move drops a link a person made under a parent the script does not manage", () => {
    const { notes } = planGroups({ groups: [group("a", [1])] }, [issue(1, { parent: 99 }), issue(99)], TARGET);
    expect(notes).toEqual([expect.stringMatching(/#1 is under #99, which this script does not manage/)]);
  });

  it("does not trust a marker without the label: anyone can open an issue on a public repository", () => {
    const g = group("a", [1]);
    const planted = parentFor(10, g, [], { labels: [] });
    const { actions, ungrouped } = planGroups({ groups: [g] }, [planted, issue(1)], TARGET);
    expect(types(actions)).toEqual(["create", "add"]);
    expect(ungrouped.map((i: Issue) => i.number)).toEqual([10]);
  });

  it("stops when two open parents claim one group, and lets an open parent beat a closed one", () => {
    const g = group("a", [1]);
    expect(() => planGroups({ groups: [g] }, [parentFor(10, g, []), parentFor(11, g, []), issue(1)], TARGET)).toThrow(
      /#10 and #11 are both open parents of group a/,
    );
    const { actions } = planGroups({ groups: [g] }, [parentFor(9, g, [], { state: "CLOSED" }), parentFor(11, g, [1]), issue(1, { parent: 11 })], TARGET);
    expect(actions).toEqual([]);
  });

  it("refuses an emptied file while parents are open, rather than closing them all", () => {
    expect(() => planGroups({ groups: [] }, [parentFor(10, group("a", [1]), [])], TARGET)).toThrow(/has no groups/);
  });

  it("refuses a plan GitHub would reject as a loop: a parent under one of its own members", () => {
    const g = group("a", [1]);
    expect(() => planGroups({ groups: [g] }, [parentFor(10, g, [], { parent: 1 }), issue(1)], TARGET)).toThrow(
      /group parent #10 \(a\) is a sub-issue of #1, which the file puts under it/,
    );
  });

  it("refuses a number that is not an issue here, or that is itself a parent", () => {
    expect(() => planGroups({ groups: [group("a", [5])] }, [], TARGET)).toThrow(/#5 \(in a\) is not an issue/);
    const b = group("b", [1]);
    expect(() => planGroups({ groups: [group("a", [10]), b] }, [parentFor(10, b, []), issue(1)], TARGET)).toThrow(/#10 \(in a\) is itself a group parent/);
  });

  it("keeps a closed sub-issue linked and says so, since a renamed ledger entry closes its issue", () => {
    const g = group("a", [1]);
    const { actions, notes } = planGroups({ groups: [g] }, [parentFor(10, g, [1]), issue(1, { parent: 10, state: "CLOSED" })], TARGET);
    expect(actions).toEqual([]);
    expect(notes).toEqual([expect.stringMatching(/#1 \(in a\) is closed/)]);
  });

  it("lists open issues in no group, leaving out standalone ones, parents and closed issues", () => {
    const g = group("a", [1]);
    const issues = [parentFor(10, g, [1]), issue(1, { parent: 10 }), issue(2), issue(3), issue(4, { state: "CLOSED" })];
    const { ungrouped } = planGroups({ groups: [g], standalone: [3] }, issues, TARGET);
    expect(ungrouped.map((i: Issue) => i.number)).toEqual([2]);
  });
});

describe("reading GitHub", () => {
  const page = (nodes: unknown[]) => ({ data: { repository: { issues: { nodes } } } });
  const here = { nameWithOwner: "owner/repo" };
  const elsewhere = { nameWithOwner: "other/repo" };
  const node = (number: number, extra: Record<string, unknown> = {}) => ({
    number,
    id: `I_${number}`,
    title: `Issue ${number}`,
    body: "",
    state: "OPEN",
    labels: { nodes: [] },
    parent: null,
    repository: here,
    ...extra,
  });
  const under = (number: number, repository = here) => ({ parent: { number, repository } });

  it("merges parents and their children, keeping a closed child's body for --suggest", () => {
    const parent = node(10, {
      labels: { nodes: [{ name: LABEL }] },
      subIssues: { totalCount: 2, nodes: [node(1, under(10)), node(2, { ...under(10), state: "CLOSED", body: "names src/a.ts" })] },
    });
    const issues = issuesFromPages([page([node(1, under(10)), node(10)])], [page([parent])], "owner/repo");
    const byNumber = new Map(issues.map((i: Issue) => [i.number, i]));
    expect(byNumber.get(10)?.children?.map((c) => c.number)).toEqual([1, 2]);
    expect(byNumber.get(1)?.parent).toBe(10);
    expect(byNumber.get(2)).toMatchObject({ state: "CLOSED", parent: 10, body: "names src/a.ts" });
  });

  it("never takes another repository's issue for the one here with the same number", () => {
    const parent = node(10, {
      labels: { nodes: [{ name: LABEL }] },
      subIssues: { totalCount: 1, nodes: [node(7, { ...under(10), repository: elsewhere })] },
    });
    const issues = issuesFromPages([page([node(7), node(8, under(10, elsewhere)), node(10)])], [page([parent])], "owner/repo");
    const byNumber = new Map(issues.map((i: Issue) => [i.number, i]));
    expect(byNumber.get(7)?.parent).toBeNull();
    expect(byNumber.get(8)?.parent).toBe("other/repo#10");
    expect(byNumber.get(10)?.children).toEqual([expect.objectContaining({ number: 7, foreign: "other/repo#7" })]);
  });

  it("refuses a parent with more sub-issues than one page reads", () => {
    const parent = node(10, { subIssues: { totalCount: 101, nodes: [] } });
    expect(() => issuesFromPages([], [page([parent])], "owner/repo")).toThrow(/101 sub-issues/);
  });

  it("tells a number that is no issue from any other gh failure", () => {
    // Observed 2026-10-21 for #144, a pull request: `gh: Could not resolve to an Issue with the number of 144.`
    expect(isMissingIssueError(new Error("Command failed: gh api graphql\ngh: Could not resolve to an Issue with the number of 144."))).toBe(true);
    expect(isMissingIssueError(new Error("Command failed: gh api graphql\nHTTP 401: Bad credentials"))).toBe(false);
  });
});

describe("planning across repositories and limits", () => {
  it("removes a sub-issue from another repository and links the issue here that shares its number", () => {
    const g = group("a", [7]);
    const parent = parentFor(10, g, []);
    parent.children = [{ number: 7, id: "X_7", state: "OPEN", foreign: "other/repo#7" }];
    const { actions } = planGroups({ groups: [g] }, [parent, issue(7)], TARGET);
    expect(actions).toEqual([
      expect.objectContaining({ type: "remove", child: "other/repo#7", childId: "X_7" }),
      expect.objectContaining({ type: "add", child: 7, childId: "I_7" }),
    ]);
  });

  it("moves an issue out from under a parent in another repository that shares a number with ours", () => {
    const g = group("a", [1]);
    const { actions, notes } = planGroups({ groups: [g] }, [parentFor(10, g, []), issue(1, { parent: "other/repo#10" })], TARGET);
    expect(actions).toEqual([expect.objectContaining({ type: "move", child: 1, from: "other/repo#10" })]);
    expect(notes).toEqual([expect.stringMatching(/under other\/repo#10, which this script does not manage/)]);
  });

  it("lets a closed duplicate parent go of what no group wants, and moves what a group does", () => {
    const g = group("a", [6]);
    const issues = [parentFor(10, g, []), parentFor(11, g, [5, 6], { state: "CLOSED" }), issue(5, { parent: 11 }), issue(6, { parent: 11 })];
    const { actions } = planGroups({ groups: [g] }, issues, TARGET);
    expect(actions).toEqual([
      expect.objectContaining({ type: "remove", parent: 11, child: 5 }),
      expect.objectContaining({ type: "move", parent: 10, child: 6, from: 11 }),
    ]);
  });

  it("orders links out before links in, so a parent at GitHub's limit has room for what it gains", () => {
    const a = group("a", [3]);
    const b = group("b", [2]);
    const issues = [parentFor(10, a, [2]), parentFor(11, b, []), issue(2, { parent: 10 }), issue(3)];
    expect(types(planGroups({ groups: [a, b] }, issues, TARGET).actions)).toEqual(["move", "add"]);
  });

  it("does not list a link the plan already removes as one a person made", () => {
    const gone = group("gone", [2]);
    const { ungrouped } = planGroups({ groups: [group("a", [1])] }, [parentFor(11, gone, [2]), issue(1), issue(2, { parent: 11 })], TARGET);
    expect(ungrouped).toEqual([expect.objectContaining({ number: 2, parent: null })]);
  });
});

describe("applying", () => {
  // GitHub drops a new issue's labels silently when the caller lacks push access.
  const createDropsLabel = (labelAnswer: { name: string }[]) => {
    const calls: string[][] = [];
    const exec = (_command: string, args: string[]) => {
      calls.push(args);
      if (args.includes("repos/owner/repo/issues")) return JSON.stringify({ number: 50, node_id: "I_50", labels: [] });
      if (args.includes("repos/owner/repo/issues/50/labels")) return JSON.stringify(labelAnswer);
      return "{}";
    };
    return { calls, exec };
  };

  it("labels a new parent afterwards when GitHub dropped the label on create", () => {
    const { calls, exec } = createDropsLabel([{ name: LABEL }]);
    const { actions } = planGroups({ groups: [group("a", [1])] }, [issue(1)], TARGET);
    applyActions(actions, { repo: "owner/repo", exec, log: () => {} });
    expect(calls.map((args) => (args[1] === "graphql" ? "graphql" : args[3]))).toEqual(["repos/owner/repo/issues", "repos/owner/repo/issues/50/labels", "graphql"]);
  });

  it("stops before linking anything when a new parent cannot be labelled, since the next run would make another", () => {
    const { calls, exec } = createDropsLabel([]);
    const { actions } = planGroups({ groups: [group("a", [1])] }, [issue(1)], TARGET);
    expect(() => applyActions(actions, { repo: "owner/repo", exec, log: () => {} })).toThrow(/#50 was created without the group label/);
    expect(calls).toHaveLength(2);
  });

  it("links a new parent's issues by the node id GitHub returned when it was created", () => {
    const calls: string[][] = [];
    const exec = (_command: string, args: string[], input?: string) => {
      calls.push(args);
      if (args.includes("POST")) {
        expect(JSON.parse(input ?? "{}").labels).toEqual([LABEL]);
        return JSON.stringify({ number: 50, node_id: "I_50", labels: [{ name: LABEL }] });
      }
      return "{}";
    };
    const { actions } = planGroups({ groups: [group("a", [1])] }, [issue(1)], TARGET);
    const log: string[] = [];
    applyActions(actions, { repo: "owner/repo", exec, log: (line: string) => log.push(line) });
    expect(calls[1]).toEqual(expect.arrayContaining(["issueId=I_50", "subIssueId=I_1"]));
    expect(log).toEqual(["  created #50 for a", "  added #1 to #50"]);
  });

  it("asks GitHub to replace the old parent on a move, which a plain add would refuse", () => {
    const queries: string[] = [];
    const exec = (_command: string, args: string[]) => {
      queries.push(args.find((arg) => arg.startsWith("query=")) ?? "");
      return "{}";
    };
    const actions = [{ type: "move", key: "a", parent: 11, parentId: "I_11", child: 2, childId: "I_2", from: 10 }];
    applyActions(actions, { repo: "owner/repo", exec, log: () => {} });
    expect(queries[0]).toMatch(/addSubIssue\(input: \{[^}]*replaceParent: true/);
  });

  it("names the parent a failed create left behind, rather than saying nothing was applied", () => {
    const exec = (_command: string, args: string[]) => {
      if (args.includes("repos/owner/repo/issues")) return JSON.stringify({ number: 50, node_id: "I_50", labels: [] });
      throw new Error(["gh api -X failed", "HTTP 403: Must have triage access"].join("\n"));
    };
    const { actions } = planGroups({ groups: [group("a", [1])] }, [issue(1)], TARGET);
    expect(() => applyActions(actions, { repo: "owner/repo", exec, log: () => {} })).toThrow(
      /after 0 of 2 actions applied: HTTP 403: Must have triage access #50 was created without the group label/,
    );
  });

  it("applies only for an account that can label issues", () => {
    expect(["READ", "TRIAGE", "WRITE", "MAINTAIN", "ADMIN", null].map(canApply)).toEqual([false, true, true, true, true, false]);
  });

  it("stops at the first refusal and says how many actions landed", () => {
    const exec = (_command: string, args: string[]) => {
      if (args.includes("subIssueId=I_2")) throw new Error("gh api graphql\nGraphQL: refused");
      return "{}";
    };
    const g = group("a", [1, 2, 3]);
    const { actions } = planGroups({ groups: [g] }, [parentFor(10, g, []), issue(1), issue(2), issue(3)], TARGET);
    expect(() => applyActions(actions, { repo: "owner/repo", exec, log: () => {} })).toThrow(/after 1 of 3 actions applied: GraphQL: refused/);
  });
});

describe("suggestions", () => {
  const corpus = [
    issue(1, { title: "Pet form wipes the medical timeline", body: "`PetFormDialog` in src/components/admin/PetFormDialog.tsx resets the timeline." }),
    issue(2, { title: "Pet form defaults the intake date", body: "src/components/admin/PetFormDialog.tsx uses the UTC day for intake." }),
    issue(3, { title: "Drift log misses merges", body: "The hook in .claude/hooks/agent-guard.mjs records the drift log." }),
    issue(4, { title: "Drift log empty for some sessions", body: "agent-guard writes no drift log line for linked worktrees." }),
    issue(5, { title: "Birth date field in the pet form", body: "`PetFormDialog` shows the birth date estimate nowhere." }),
  ];
  const config = { groups: [group("pet-form", [1, 2]), group("agent-tooling", [3, 4])] };

  it("proposes the group whose issues name the same file, with that file as evidence", () => {
    const [proposal] = suggest(config, corpus, [corpus[4]]);
    expect(proposal).toMatchObject({ number: 5, clear: true, best: { key: "pet-form" } });
    expect(proposal.best.evidence).toContain("petformdialog");
  });

  it("reads repo-root paths only, and meets a test file at its bare name", () => {
    const found = [...features(issue(9, { body: "`@prisma/client` and node_modules/next/dist/docs/x; see tests/unit/issueGroups.test.ts" })).keys()];
    expect(found.filter((f) => f.startsWith("path:"))).toEqual(["path:tests/unit/issuegroups.test.ts"]);
    expect(found).toContain("id:issuegroups");
  });

  it("keeps a dynamic segment's bracket and drops a leading ./", () => {
    const paths = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("path:"));
    expect(paths("(src/app/[id])")).toEqual(["path:src/app/[id]"]);
    expect(paths("see ./src/lib/b.ts")).toEqual(["path:src/lib/b.ts"]);
  });

  it("meets a kebab-case file, a file name and a call at their bare names", () => {
    const ids = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("id:"));
    expect(ids("see .claude/hooks/agent-guard.mjs")).toEqual(["id:agent-guard"]);
    expect(ids("the `agent-guard` hook")).toEqual(["id:agent-guard"]);
    expect(ids("`PetFormDialog.tsx` and `verifyAdminSession(req)`")).toEqual(["id:petformdialog", "id:verifyadminsession"]);
  });

  it("keeps a backticked property whole, and gives Next.js route files no shared name", () => {
    const ids = (body: string) => [...features(issue(9, { body })).keys()].filter((f) => f.startsWith("id:"));
    expect(ids("`Pet.age` and `prisma.pet.findUnique()`")).toEqual(["id:pet.age", "id:prisma.pet.findunique"]);
    expect(ids("src/app/pets/page.tsx and src/app/donate/page.tsx")).toEqual([]);
  });

  it("reads a path inside a markdown link as the same path written bare", () => {
    const found = [...features(issue(9, { body: "see [src/lib/a.ts](src/lib/a.ts)" })).keys()];
    expect(found.filter((f) => f.startsWith("path:"))).toEqual(["path:src/lib/a.ts"]);
  });

  it("measures itself by hiding each grouped issue in turn", () => {
    const { results, right, wrong, unclear } = evaluate(config, corpus);
    expect(results).toHaveLength(4);
    expect([right, wrong, unclear]).toEqual([1, 0, 0]);
  });

  it("counts an issue that shares nothing as no clear group, not as a hit for the first group by name", () => {
    const lonely = issue(6, { title: "zebra quokka" });
    const { results, right, unclear } = evaluate({ groups: [group("aaa", [6, 1, 2]), group("agent-tooling", [3, 4])] }, [...corpus, lonely]);
    // Every group scores zero, so the real group ties for last rather than winning by name.
    expect(results.find((r: { number: number }) => r.number === 6)).toMatchObject({ rank: 2, clear: false });
    expect(right).toBeLessThan(1);
    expect(unclear).toBeGreaterThan(0);
  });

  it("leaves group parents out of the weights, so applying the grouping does not move a suggestion", () => {
    const parent = parentFor(10, group("pet-form", [1, 2]), [1, 2]);
    expect(suggest(config, [...corpus, parent], [corpus[4]])).toEqual(suggest(config, corpus, [corpus[4]]));
  });
});

describe("standalone issues", () => {
  it("says when a standalone issue is closed or gone, so the list does not go stale", () => {
    const { notes } = planGroups({ groups: [group("a", [1])], standalone: [2, 3] }, [issue(1), issue(2, { state: "CLOSED" })], TARGET);
    expect(notes).toEqual([
      expect.stringMatching(/standalone #2 is not an open issue here/),
      expect.stringMatching(/standalone #3 is not an open issue here/),
    ]);
  });
});

describe("the CLI", () => {
  it("prints usage for --help without reaching GitHub", () => {
    expect(execFileSync("node", [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" })).toContain("--suggest");
  });

  it("refuses --apply with --suggest, and --evaluate alone, before reading anything", () => {
    for (const args of [["--apply", "--suggest"], ["--evaluate"], ["--bogus"]]) {
      expect(spawnSync("node", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" }).status).toBe(1);
    }
  });
});
