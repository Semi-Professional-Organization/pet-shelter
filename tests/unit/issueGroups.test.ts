import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
// The shipped modules, not copies of them.
import {
  CONFIG_PATH,
  LABEL,
  LIMITS,
  applyPlan,
  formatConfig,
  keyFromMarker,
  markerFor,
  planGroups,
  recordParents,
  renderParent,
  validateConfig,
} from "../../scripts/lib/issueGroups/plan.mjs";
import { githubPort, readSnapshot } from "../../scripts/lib/issueGroups/github.mjs";
import { canApply } from "../../scripts/issue-groups.mjs";
import { FakeGitHub, readFrom } from "./support/fakeGitHub";

/**
 * Tests for `scripts/issue-groups.mjs`. The guarantee that one apply converges from any state is
 * `issueGroupsConverge.test.ts`; these are the readable examples, one per case the audit named, plus
 * the reader against recorded GitHub answers. Nothing here reaches GitHub.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "issue-groups.mjs");
const REPO = "o/r";
const TARGET = { repo: REPO, branch: "master" };

type Group = { key: string; title: string; summary: string; issues: number[]; parent?: number };
const group = (key: string, issues: number[], extra: Partial<Group> = {}): Group => ({ key, title: `Group ${key}`, summary: `About ${key}.`, issues, ...extra });

/** A fake GitHub holding `count` plain issues, numbered from 1. */
const github = (count: number) => {
  const fake = new FakeGitHub(REPO);
  for (let n = 0; n < count; n += 1) fake.add();
  return fake;
};
const parentOn = (fake: FakeGitHub, g: Group, fields: Record<string, unknown> = {}) => fake.add({ ...renderParent(g, TARGET), labels: [LABEL], ...fields });
const plan = (fake: FakeGitHub, config: { groups: Group[]; standalone?: number[] }) => planGroups(config, readFrom(fake, config), TARGET);
const types = (actions: { type: string }[]) => actions.map((action) => action.type);

/** Applies, records, and returns the next plan, which must be empty for the run to count as done. */
const converge = (fake: FakeGitHub, config: { groups: Group[] }) => {
  const first = plan(fake, config);
  const created = applyPlan(first, fake.port());
  const record = new Map(first.record);
  for (const [key, issue] of created) record.set(key, issue.number);
  const settled = recordParents(config, record);
  return { first, settled, next: plan(fake, settled) };
};

describe("the grouping file", () => {
  const shipped = readFileSync(resolve(ROOT, CONFIG_PATH), "utf8").replace(/\r\n/g, "\n");

  it("the shipped file is valid, and in the layout --apply writes, so recording a parent changes one line", () => {
    const config = validateConfig(JSON.parse(shipped));
    expect(formatConfig(config)).toBe(shipped);
    // From a file with no parents recorded, so the check holds whatever the shipped file records.
    const bare = { ...config, groups: config.groups.map((group: Group) => {
      const copy = { ...group };
      delete copy.parent;
      return copy;
    }) };
    const recorded = formatConfig(recordParents(bare, new Map([["bulletins", 181]]))).split("\n");
    const before = formatConfig(bare).split("\n");
    expect(recorded.length).toBe(before.length + 1);
    expect(recorded.filter((line) => !before.includes(line))).toEqual(['      "parent": 181,']);
  });

  it("refuses an issue in two places, because an issue can have only one parent", () => {
    expect(() => validateConfig({ groups: [group("a", [1, 2]), group("b", [2])] })).toThrow(/#2 is in both a and b/);
    expect(() => validateConfig({ groups: [group("a", [1])], standalone: [1] })).toThrow(/#1 is in both a and standalone/);
  });

  it("names every problem at once", () => {
    const error = (() => {
      try {
        validateConfig({
          groups: [
            group("Bad Key", [1]),
            group("a", []),
            group("a", [0]),
            { key: "c", issues: [3] },
            group("d", [4], { summary: { text: "hi" } as never }),
            group("e", [5], { summary: "x".repeat(LIMITS.summary + 1) }),
            group("f", [6], { parent: 9 }),
            group("g", [7], { parent: 9 }),
            group("h", [8], { parent: 1 }),
          ],
          standalone: {} as never,
        });
      } catch (e) {
        return String(e);
      }
    })();
    for (const expected of [
      /Bad Key: key must be/,
      /a: needs at least one issue/,
      /a: key is used twice/,
      /0 is not an issue number/,
      /c: needs a title/,
      /d: summary must be text/,
      /e: summary is over/,
      /g: parent #9 is also the parent of f/,
      /h: parent #1 is also listed in Bad Key/,
      /"standalone" must be an array/,
    ]) {
      expect(error).toMatch(expected);
    }
  });

  it("reads a parent's key only from a marker at the top of its body", () => {
    expect(keyFromMarker(`${markerFor("test-suite")}\nrest`)).toBe("test-suite");
    expect(keyFromMarker(`quoting it: ${markerFor("test-suite")}`)).toBeNull();
  });
});

describe("planning: identity comes from the file, so damage is repaired, never duplicated", () => {
  it("creates each parent and links its issues when nothing exists yet", () => {
    const fake = github(2);
    const { first, next } = converge(fake, { groups: [group("a", [1, 2])] });
    expect(types(first.actions)).toEqual(["create", "link", "link"]);
    expect(next.actions).toEqual([]);
  });

  it("relabels a recorded parent whose label someone removed", () => {
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g, { labels: [] });
    fake.link(parent.id, fake.byNumber(1)!.id);
    const config = { groups: [{ ...g, parent: parent.number }] };
    const { first, next } = converge(fake, config);
    expect(first.actions).toEqual([expect.objectContaining({ type: "label", number: parent.number })]);
    expect(next.actions).toEqual([]);
  });

  it("keeps a parent relabelled `Group`, since GitHub compares labels ignoring case", () => {
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g, { labels: ["Group"] });
    fake.link(parent.id, fake.byNumber(1)!.id);
    expect(plan(fake, { groups: [g] }).actions).toEqual([]);
  });

  it("re-renders a recorded parent whose marker line someone edited, rather than creating another", () => {
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g, { body: `A note.\n${renderParent(g, TARGET).body}` });
    fake.link(parent.id, fake.byNumber(1)!.id);
    const { first, next } = converge(fake, { groups: [{ ...g, parent: parent.number }] });
    expect(types(first.actions)).toEqual(["update"]);
    expect(next.actions).toEqual([]);
  });

  it("refuses a recorded parent that no longer exists, and says how to make a new one", () => {
    expect(() => plan(github(1), { groups: [group("a", [1], { parent: 50 })] })).toThrow(/recorded parent #50 is not an issue here.*remove its "parent"/);
  });

  it("refuses to guess between two open parents that claim one unrecorded group", () => {
    const fake = github(1);
    const g = group("a", [1]);
    parentOn(fake, g);
    parentOn(fake, g);
    expect(() => plan(fake, { groups: [g] })).toThrow(/#2 and #3 all claim this group; record the canonical one/);
  });

  it("after two runs at once made two parents, recording one retires the other", () => {
    const fake = github(2);
    const g = group("a", [1, 2]);
    const winner = parentOn(fake, g);
    const loser = parentOn(fake, g);
    fake.link(winner.id, fake.byNumber(1)!.id);
    fake.link(loser.id, fake.byNumber(2)!.id);
    const { first, next } = converge(fake, { groups: [{ ...g, parent: winner.number }] });
    expect(types(first.actions)).toEqual(["link", "close"]);
    expect(fake.byNumber(loser.number)!.state).toBe("CLOSED");
    expect(next.actions).toEqual([]);
  });

  it("adopts the one labelled parent of an unrecorded group, and reports its number for the file", () => {
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g, { state: "CLOSED" });
    const result = plan(fake, { groups: [g] });
    expect(types(result.actions)).toEqual(["reopen", "link"]);
    expect([...result.record]).toEqual([["a", parent.number]]);
  });
});

describe("planning: two whole states compared by node id", () => {
  it("removes a sub-issue from another repository and links the issue here that shares its number", () => {
    const fake = github(7);
    const g = group("a", [7]);
    const parent = parentOn(fake, g);
    const foreign = fake.add({ repo: "o/x", number: 7 });
    fake.link(parent.id, foreign.id);
    const { first, next } = converge(fake, { groups: [{ ...g, parent: parent.number }] });
    expect(first.actions).toEqual([
      expect.objectContaining({ type: "unlink", child: "o/x#7" }),
      expect.objectContaining({ type: "link", child: 7 }),
    ]);
    expect(next.actions).toEqual([]);
  });

  it("releases and closes the parent of a group that left the file, and leaves hand-made links elsewhere alone", () => {
    const fake = github(3);
    const gone = parentOn(fake, group("gone", [1]));
    fake.link(gone.id, fake.byNumber(1)!.id);
    fake.link(fake.byNumber(3)!.id, fake.byNumber(2)!.id);
    const { first, next } = converge(fake, { groups: [group("a", [3])] });
    expect(types(first.actions)).toEqual(["create", "unlink", "link", "close"]);
    expect(fake.byNumber(2)!.parentId).toBe(fake.byNumber(3)!.id);
    expect(next.actions).toEqual([]);
  });

  it("says so when linking drops a link a person made under a parent this script does not manage", () => {
    const fake = github(2);
    fake.link(fake.byNumber(2)!.id, fake.byNumber(1)!.id);
    expect(plan(fake, { groups: [group("a", [1])] }).notes).toEqual([expect.stringMatching(/#1 is under #2, which this script does not manage/)]);
  });

  it("refuses an issue under a parent this account cannot see, and says who must act", () => {
    const fake = github(1);
    const hidden = fake.add();
    fake.link(hidden.id, fake.byNumber(1)!.id);
    hidden.hidden = true;
    expect(() => plan(fake, { groups: [group("a", [1])] })).toThrow(/#1 \(in a\) is under an issue this account cannot see; someone who can see it must unlink it first/);
  });

  it("refuses a group parent holding a sub-issue this account cannot see, rather than call it matched", () => {
    // Final review: such a sub-issue could be neither kept nor removed, and --apply printed Verified.
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g);
    fake.link(parent.id, fake.byNumber(1)!.id);
    const hidden = fake.add();
    fake.link(parent.id, hidden.id);
    hidden.hidden = true;
    expect(() => plan(fake, { groups: [{ ...g, parent: parent.number }] })).toThrow(/group parent #2 has 1 sub-issues this account cannot see/);
  });

  it("lists open issues in no group, without the parents, the standalone ones or a link the plan removes", () => {
    const fake = github(4);
    const gone = parentOn(fake, group("gone", [2]));
    fake.link(gone.id, fake.byNumber(2)!.id);
    const result = plan(fake, { groups: [group("a", [1])], standalone: [3, 9] });
    expect(result.ungrouped.map((i: { number: number; parent: string | null }) => [i.number, i.parent])).toEqual([
      [2, null],
      [4, null],
    ]);
    expect(result.notes).toEqual([expect.stringMatching(/standalone #9 is not an open issue here/)]);
  });

  it("refuses an emptied file while parents are open, rather than closing them all", () => {
    const fake = github(1);
    parentOn(fake, group("a", [1]));
    expect(() => plan(fake, { groups: [] })).toThrow(/has no groups but group parents are open/);
  });
});

describe("planning: GitHub's rules are checked on the finished tree, before any write", () => {
  it("refuses a link that makes a loop in any order: a parent under its own member", () => {
    const fake = github(1);
    const g = group("a", [1]);
    const parent = parentOn(fake, g);
    fake.link(fake.byNumber(1)!.id, parent.id);
    expect(() => plan(fake, { groups: [{ ...g, parent: parent.number }] })).toThrow(/#1 cannot be linked to a: it would make a loop/);
  });

  it("frees a slot before filling it, so a full parent can lose one issue and gain another", () => {
    const fake = github(102);
    const a = group("a", Array.from({ length: 100 }, (_, i) => i + 2));
    const b = group("b", [1]);
    const parentA = parentOn(fake, a);
    const parentB = parentOn(fake, b);
    for (let n = 1; n <= 100; n += 1) fake.link(parentA.id, fake.byNumber(n)!.id);
    const config = { groups: [{ ...a, parent: parentA.number }, { ...b, parent: parentB.number }] };
    const { next } = converge(fake, config);
    expect(fake.children(parentA.id)).toHaveLength(100);
    expect(next.actions).toEqual([]);
  });

  it("sees the sub-issues of a recorded parent that lost its label, so one apply still finishes", () => {
    // Review of the rebuild: the label read misses an unlabelled parent, and the open-issues read
    // carries no sub-issues, so its closed hand-linked #2 went unseen until after the apply.
    const fake = github(2);
    const g = group("a", [1]);
    const parent = parentOn(fake, g, { labels: [] });
    fake.link(parent.id, fake.byNumber(1)!.id);
    fake.link(parent.id, fake.byNumber(2)!.id);
    fake.byNumber(2)!.state = "CLOSED";
    const { first, next } = converge(fake, { groups: [{ ...g, parent: parent.number }] });
    expect(types(first.actions)).toEqual(["label", "unlink"]);
    expect(next.actions).toEqual([]);
  });

  it("counts nesting as the links move, not as it was read", () => {
    // Review of the rebuild: linking #1 (with a chain of six below it) under a's parent makes that
    // parent's subtree deep, and a's parent sits under #2, which b then takes: too deep for GitHub.
    const fake = github(2);
    const chain = Array.from({ length: 6 }, () => fake.add());
    fake.link(fake.byNumber(1)!.id, chain[0].id);
    for (let i = 1; i < chain.length; i += 1) fake.link(chain[i - 1].id, chain[i].id);
    const a = group("a", [1]);
    const b = group("b", [2]);
    const parentA = parentOn(fake, a);
    const parentB = parentOn(fake, b);
    fake.link(fake.byNumber(2)!.id, parentA.id);
    expect(() => plan(fake, { groups: [{ ...a, parent: parentA.number }, { ...b, parent: parentB.number }] })).toThrow(/nest deeper than 8 levels/);
  });

  it("refuses two full parents swapping an issue, which no simple order can do", () => {
    const fake = github(200);
    const a = group("a", [...Array.from({ length: 99 }, (_, i) => i + 1), 200]);
    const b = group("b", [100, ...Array.from({ length: 99 }, (_, i) => i + 101)]);
    const parentA = parentOn(fake, a);
    const parentB = parentOn(fake, b);
    for (let n = 1; n <= 100; n += 1) fake.link(parentA.id, fake.byNumber(n)!.id);
    for (let n = 101; n <= 200; n += 1) fake.link(parentB.id, fake.byNumber(n)!.id);
    const config = { groups: [{ ...a, parent: parentA.number }, { ...b, parent: parentB.number }] };
    expect(() => plan(fake, config)).toThrow(/its parent already has 100 sub-issues/);
  });

  it("refuses an issue whose depth sub-issues it cannot see make unknowable", () => {
    // The generator found this: a member's hidden sub-issue had a long visible chain below it.
    const fake = github(1);
    const hidden = fake.add();
    const chain = Array.from({ length: 7 }, () => fake.add());
    fake.link(fake.byNumber(1)!.id, hidden.id);
    fake.link(hidden.id, chain[0].id);
    for (let i = 1; i < chain.length; i += 1) fake.link(chain[i - 1].id, chain[i].id);
    hidden.hidden = true;
    expect(() => plan(fake, { groups: [group("a", [1])] })).toThrow(/#1 cannot be linked to a: it has sub-issues this account cannot see/);
  });

  it("reads below an issue first met as an ancestor, so nothing visible is mistaken for hidden", () => {
    // Review round 3: #2 was read as b's parent's ancestor (no sub-issues listed), so its closed
    // sub-issue #3 was never read, and #1 above it was skipped as if something were hidden.
    const fake = github(3);
    const a = group("a", [1]);
    const b = group("b", [5]);
    fake.add({ number: 5 });
    const parentB = parentOn(fake, b);
    fake.link(fake.byNumber(1)!.id, fake.byNumber(2)!.id);
    fake.link(fake.byNumber(2)!.id, parentB.id);
    fake.link(fake.byNumber(2)!.id, fake.byNumber(3)!.id);
    fake.byNumber(2)!.state = "CLOSED";
    fake.byNumber(3)!.state = "CLOSED";
    const result = plan(fake, { groups: [a, { ...b, parent: parentB.number }] });
    expect(types(result.actions)).toEqual(["create", "link", "link"]);
  });

  it("refuses a link too deep even at the least, rather than skipping it as unknowable", () => {
    const fake = github(1);
    const chain = Array.from({ length: 7 }, () => fake.add());
    for (let i = 1; i < chain.length; i += 1) fake.link(chain[i - 1].id, chain[i].id);
    const g = group("a", [1]);
    const parent = parentOn(fake, g);
    fake.link(chain[chain.length - 1].id, parent.id);
    const hidden = fake.add();
    fake.link(fake.byNumber(1)!.id, hidden.id);
    hidden.hidden = true;
    expect(() => plan(fake, { groups: [{ ...g, parent: parent.number }] })).toThrow(/nest deeper than 8 levels/);
  });

  it("refuses rather than reshuffles when a full parent waits on an issue whose depth is unknowable", () => {
    const fake = github(101);
    const one = group("one", Array.from({ length: 100 }, (_, i) => i + 1));
    const two = group("two", [101]);
    const parentOne = parentOn(fake, one);
    const parentTwo = parentOn(fake, two);
    for (let n = 1; n <= 99; n += 1) fake.link(parentOne.id, fake.byNumber(n)!.id);
    fake.link(parentOne.id, fake.byNumber(101)!.id);
    const hidden = fake.add();
    fake.link(fake.byNumber(101)!.id, hidden.id);
    hidden.hidden = true;
    const config = { groups: [{ ...one, parent: parentOne.number }, { ...two, parent: parentTwo.number }] };
    expect(() => plan(fake, config)).toThrow(/#101 cannot be linked to two: it has sub-issues this account cannot see/);
  });

  it("reads a member's sub-issues all the way down, so a deep one is counted, not guessed", () => {
    const fake = github(1);
    const chain = Array.from({ length: 7 }, () => fake.add());
    fake.link(fake.byNumber(1)!.id, chain[0].id);
    for (let i = 1; i < chain.length; i += 1) fake.link(chain[i - 1].id, chain[i].id);
    const g = group("a", [1]);
    const parent = parentOn(fake, g);
    const top = fake.add();
    fake.link(top.id, parent.id);
    // #1 has seven levels below it; under a parent that is itself a sub-issue, that is nine.
    expect(() => plan(fake, { groups: [{ ...g, parent: parent.number }] })).toThrow(/nest deeper than 8 levels/);
  });

  it("refuses nesting deeper than GitHub's eight levels", () => {
    const fake = github(1);
    const chain = Array.from({ length: LIMITS.depth }, () => fake.add());
    for (let i = 1; i < chain.length; i += 1) fake.link(chain[i - 1].id, chain[i].id);
    const g = group("a", [1]);
    const parent = parentOn(fake, g);
    fake.link(chain[chain.length - 1].id, parent.id);
    expect(() => plan(fake, { groups: [{ ...g, parent: parent.number }] })).toThrow(/nest deeper than 8 levels/);
  });
});

describe("applying", () => {
  it("labels a new parent afterwards when GitHub dropped the label on create", () => {
    const fake = github(1);
    fake.pushAccess = false;
    const { next } = converge(fake, { groups: [group("a", [1])] });
    expect(next.actions).toEqual([]);
  });

  it("stops before linking when a new parent cannot be labelled, and names it so the next run repairs it", () => {
    const fake = github(1);
    fake.pushAccess = false;
    const port = { ...fake.port(), addLabel: () => [] as string[] };
    let failure: (Error & { created?: Map<string, { number: number }> }) | undefined;
    try {
      applyPlan(plan(fake, { groups: [group("a", [1])] }), port);
    } catch (error) {
      failure = error as typeof failure;
    }
    expect(String(failure)).toMatch(/after 0 of 2 actions applied: GitHub kept no label on the new issue #2 was created without the group label/);
    expect([...failure!.created!].map(([key, issue]) => [key, issue.number])).toEqual([["a", 2]]);
  });

  it("drives GitHub through REST for issues and GraphQL for links", () => {
    const calls: string[] = [];
    const port = githubPort({
      repo: REPO,
      rest: (method: string, path: string, body: Record<string, unknown>) => {
        calls.push(`${method} ${path} ${JSON.stringify(body)}`);
        return path.endsWith("/labels") ? [{ name: "group" }] : { number: 9, node_id: "N9", labels: [] };
      },
      graphql: (query: string, variables: Record<string, string>) => {
        calls.push(`${query.includes("replaceParent: true") ? "link+replace" : "unlink"} ${variables.issueId} ${variables.subIssueId}`);
        return { data: {} };
      },
    });
    expect(port.createIssue({ title: "T", body: "B", labels: [LABEL] })).toEqual({ id: "N9", number: 9, labels: [] });
    expect(port.addLabel(9)).toEqual(["group"]);
    port.link("P", "C");
    port.unlink("P", "C");
    expect(calls).toEqual([
      `POST repos/${REPO}/issues {"title":"T","body":"B","labels":["group"]}`,
      `POST repos/${REPO}/issues/9/labels {"labels":["group"]}`,
      "link+replace P C",
      "unlink P C",
    ]);
  });
});

describe("reading GitHub", () => {
  const node = (number: number, extra: Record<string, unknown> = {}) => ({
    id: `N${number}`,
    number,
    title: `Issue ${number}`,
    body: "",
    state: "OPEN",
    repository: { nameWithOwner: REPO },
    labels: { nodes: [] },
    parent: null,
    subIssuesSummary: { total: 0 },
    ...extra,
  });
  const page = (nodes: unknown[]) => ({ data: { repository: { issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } });
  const transport = (answers: { open?: unknown[]; parents?: unknown[]; byNumber?: Record<string, unknown>; errors?: unknown[]; nodes?: unknown[] }) =>
    (query: string) => {
      if (query.includes("filterBy")) return page(answers.parents ?? []);
      if (query.includes("states: [OPEN])")) return { ...page(answers.open ?? []), errors: answers.errors };
      if (query.includes("nodes(ids")) return { data: { nodes: answers.nodes ?? [] } };
      return { data: { repository: answers.byNumber ?? {} }, errors: answers.byNumber ? [{ type: "NOT_FOUND", path: ["repository", "i99"], message: "no" }] : [] };
    };

  it("merges the reads into one snapshot, children pointing at their parent by node id", () => {
    const parent = node(10, { labels: { nodes: [{ name: "group" }] }, body: markerFor("a"), subIssues: { totalCount: 2, nodes: [node(1), node(2, { state: "CLOSED", repository: { nameWithOwner: "o/x" } })] } });
    const snapshot = readSnapshot(transport({ open: [node(1, { parent: { id: "N10", number: 10, repository: { nameWithOwner: REPO } } })], parents: [parent] }), { repo: REPO, numbers: [] });
    const byId = new Map(snapshot.issues.map((issue: { id: string }) => [issue.id, issue]));
    expect(byId.get("N1")).toMatchObject({ parentId: "N10", parentRef: "#10" });
    expect(byId.get("N2")).toMatchObject({ parentId: "N10", repo: "o/x", state: "CLOSED" });
    expect(byId.get("N10")).toMatchObject({ childCount: 2, childrenRead: true, hiddenChildren: 0, labels: ["group"] });
  });

  it("marks an issue whose parent this account cannot see, instead of failing the read", () => {
    const snapshot = readSnapshot(
      transport({ open: [node(1)], errors: [{ type: "FORBIDDEN", path: ["repository", "issues", "nodes", 0, "parent"], message: "hidden" }] }),
      { repo: REPO, numbers: [] },
    );
    expect(snapshot.issues[0]).toMatchObject({ number: 1, parentHidden: true });
  });

  it("leaves a number that is no issue missing, and stops on any other error", () => {
    const snapshot = readSnapshot(transport({ byNumber: { i5: node(5, { state: "CLOSED", subIssues: { totalCount: 0, nodes: [] } }), i99: null } }), { repo: REPO, numbers: [5, 99] });
    expect(snapshot.issues.map((issue: { number: number }) => issue.number)).toEqual([5]);
    expect(() => readSnapshot(transport({ open: [], errors: [{ type: "RATE_LIMITED", path: ["repository"], message: "slow down" }] }), { repo: REPO, numbers: [] })).toThrow(/slow down/);
  });

  it("refuses a parent with more sub-issues than GitHub allows, rather than planning from part of them", () => {
    const parent = node(10, { subIssues: { totalCount: 101, nodes: [] } });
    expect(() => readSnapshot(transport({ parents: [parent] }), { repo: REPO, numbers: [] })).toThrow(/101 sub-issues/);
  });

  it("reads the ancestors of a parent, so loops and depth are checked on the whole chain", () => {
    const parent = node(10, { labels: { nodes: [{ name: "group" }] }, body: markerFor("a"), parent: { id: "N20", number: 20, repository: { nameWithOwner: REPO } }, subIssues: { totalCount: 0, nodes: [] } });
    const snapshot = readSnapshot(transport({ parents: [parent], nodes: [node(20, { state: "CLOSED" })] }), { repo: REPO, numbers: [] });
    expect(snapshot.issues.map((issue: { number: number }) => issue.number).sort()).toEqual([10, 20]);
  });
});

describe("the CLI", () => {
  it("prints usage for --help without reaching GitHub", () => {
    expect(execFileSync("node", [SCRIPT, "--help"], { cwd: ROOT, encoding: "utf8" })).toContain("--apply uses the file on the default branch");
  });

  it("refuses --apply with --suggest, --evaluate alone and unknown flags, before reading anything", () => {
    for (const args of [["--apply", "--suggest"], ["--evaluate"], ["--bogus"]]) {
      expect(spawnSync("node", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" }).status).toBe(1);
    }
  });

  it("applies only with write access or more, the least that can create and label a parent", () => {
    expect(["READ", "TRIAGE", "WRITE", "MAINTAIN", "ADMIN", null].map(canApply)).toEqual([false, false, true, true, true, false]);
  });
});
