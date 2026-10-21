import { describe, it, expect } from "vitest";
import { applyPlan, keyFromMarker, planGroups, recordParents, renderParent } from "../../scripts/lib/issueGroups/plan.mjs";
import { FakeGitHub, type FakeIssue } from "./support/fakeGitHub";

/**
 * One rule over many states, rather than one test per bug: from any state GitHub can be in, one
 * `--apply` makes the next plan empty, never creates a second parent for a group, never touches a
 * link the file does not own, and never sends a write GitHub refuses. When the planner refuses a
 * state instead, the state must really be impossible: the links the file asks for would make a loop.
 *
 * The states are generated from a seed, so a failure names the seed that reproduces it.
 */

const REPO = "o/r";
const TARGET = { repo: REPO, branch: "master" };
const SEEDS = 3000;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Group = { key: string; title: string; summary: string; issues: number[]; parent?: number };
const PARENT_MODES = ["none", "adopt", "adopt-closed", "recorded", "recorded-unlabelled", "recorded-recased", "recorded-edited", "recorded-closed", "recorded-duplicate"] as const;

/** A random world: issues, groups, parents in every condition, and links made by hand. */
function world(seed: number) {
  const rand = random(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const github = new FakeGitHub(REPO);
  const issues = Array.from({ length: 3 + Math.floor(rand() * 10) }, () =>
    github.add({ state: rand() < 0.15 ? "CLOSED" : "OPEN", labels: rand() < 0.3 ? ["ledger"] : [] }),
  );
  const foreign = Array.from({ length: Math.floor(rand() * 3) }, () => github.add({ repo: "o/x" }));
  const shuffled = [...issues].sort(() => rand() - 0.5);
  const groups: Group[] = [];
  for (let g = 0; g < Math.floor(rand() * 4) && shuffled.length > 0; g += 1) {
    const members = shuffled.splice(0, 1 + Math.floor(rand() * 3)).map((issue) => issue.number);
    groups.push({ key: `g${g}`, title: `Group ${g}`, summary: `About group ${g}.`, issues: members });
  }
  const standalone = shuffled.filter(() => rand() < 0.2).map((issue) => issue.number);

  const parentIssue = (group: Group, fields: Partial<FakeIssue> = {}) => {
    const rendered = renderParent(group, TARGET);
    return github.add({ title: rendered.title, body: rendered.body, labels: ["group"], ...fields });
  };
  const parents: FakeIssue[] = [];
  for (const group of groups) {
    const mode = pick(PARENT_MODES);
    if (mode === "none") continue;
    const rendered = renderParent(group, TARGET);
    const issue =
      mode === "adopt-closed" || mode === "recorded-closed"
        ? parentIssue(group, { state: "CLOSED" })
        : mode === "recorded-unlabelled"
          ? parentIssue(group, { labels: [] })
          : mode === "recorded-recased"
            ? parentIssue(group, { labels: ["Group"] })
            : mode === "recorded-edited"
              ? parentIssue(group, { body: `A note someone added.\n${rendered.body}`, title: "Renamed by hand" })
              : parentIssue(group);
    if (mode.startsWith("recorded")) group.parent = issue.number;
    if (mode === "recorded-duplicate") parents.push(parentIssue(group));
    parents.push(issue);
  }
  if (rand() < 0.3) parents.push(parentIssue({ key: "gone", title: "Gone", summary: "", issues: [] }, { state: rand() < 0.5 ? "OPEN" : "CLOSED" }));

  // Links made by hand, anywhere GitHub allows: under parents, under ordinary and foreign issues.
  const everyone = [...issues, ...foreign, ...parents];
  for (let n = Math.floor(rand() * 8); n > 0; n -= 1) {
    try {
      github.link(pick(everyone).id, pick(everyone).id);
    } catch {
      // GitHub would refuse it, so it cannot exist.
    }
  }
  if (rand() < 0.2 && groups.length > 0) {
    const hidden = github.add({});
    const member = github.byNumber(pick(groups).issues[0])!;
    try {
      github.link(hidden.id, member.id);
    } catch {
      // nothing hidden this time
    }
    hidden.hidden = true;
  }
  return { github, config: { groups, standalone } };
}

/** Whether the links the file asks for, with every other link left as it is, would make a loop. */
function wantsALoop(github: FakeGitHub, config: { groups: Group[] }, parentOf: Map<string, string>, managed: Set<string>) {
  const members = new Set(config.groups.flatMap((group) => group.issues.map((number) => github.byNumber(number)!.id)));
  // Links on managed parents that the file does not want are removed first.
  const parent = new Map(
    [...github.issues.values()].map((issue) => [issue.id, issue.parentId && managed.has(issue.parentId) && !members.has(issue.id) ? null : issue.parentId]),
  );
  for (const group of config.groups) {
    const target = parentOf.get(group.key);
    for (const number of group.issues) {
      const member = github.byNumber(number)!;
      if (!github.issues.get(member.parentId ?? "")?.hidden) parent.set(member.id, target ?? `new:${group.key}`);
    }
  }
  for (const start of parent.keys()) {
    const seen = new Set<string>();
    for (let at: string | null | undefined = start; at; at = parent.get(at)) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
  }
  return false;
}

describe("one apply makes GitHub match the file, from any state", () => {
  it(`converges across ${SEEDS} generated states`, () => {
    const outcomes = { converged: 0, refusedALoop: 0, refusedEmpty: 0 };
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const { github, config } = world(seed);
      const where = `seed ${seed}`;
      const before = new Map([...github.issues.values()].map((issue) => [issue.id, issue.parentId]));
      const members = new Set(config.groups.flatMap((group) => group.issues));
      const looksLikeParent = (issue: FakeIssue) =>
        issue.repo === REPO && issue.labels.some((label) => label.toLowerCase() === "group") && keyFromMarker(issue.body) !== null;
      const recorded = new Set(config.groups.map((group) => group.parent));
      const managedBefore = new Set([...github.issues.values()].filter((issue) => looksLikeParent(issue) || recorded.has(issue.number)).map((issue) => issue.id));

      let plan;
      try {
        plan = planGroups(config, github.snapshot(), TARGET);
      } catch (error) {
        // An emptied file with open parents is refused on purpose: likelier a bad edit than intent.
        if (config.groups.length === 0) {
          expect(String(error), where).toMatch(/has no groups but group parents are open/);
          expect([...github.issues.values()].some((issue) => looksLikeParent(issue) && issue.state === "OPEN"), where).toBe(true);
          outcomes.refusedEmpty += 1;
          continue;
        }
        // Otherwise the only refusal a generated state may earn is a link no order makes legal.
        expect(String(error), where).toMatch(/cannot be linked/);
        const parentOf = new Map(config.groups.filter((group) => group.parent).map((group) => [group.key, github.byNumber(group.parent!)!.id]));
        // Unrecorded groups adopt an issue that claims them: open before closed, then the oldest.
        const claimants = [...github.issues.values()]
          .filter((issue) => looksLikeParent(issue) && !recorded.has(issue.number))
          .sort((x, y) => Number(x.state === "CLOSED") - Number(y.state === "CLOSED") || x.number - y.number);
        for (const issue of claimants) {
          const key = keyFromMarker(issue.body)!;
          if (!parentOf.has(key)) parentOf.set(key, issue.id);
        }
        expect(wantsALoop(github, config, parentOf, managedBefore), `${where}: refused without a loop: ${error}`).toBe(true);
        outcomes.refusedALoop += 1;
        continue;
      }

      const writes = github.writes;
      const created = applyPlan(plan, github.port());
      expect(github.writes - writes, where).toBe(plan.actions.length + 0 * created.size);
      const record = new Map(plan.record);
      for (const [key, issue] of created) record.set(key, issue.number);
      const settled = recordParents(config, record);

      // 1. The next plan is empty.
      expect(planGroups(settled, github.snapshot(), TARGET).actions, where).toEqual([]);
      // 2. Each group has exactly one open parent, the recorded one, labelled and marked.
      for (const group of settled.groups) {
        const claiming = [...github.issues.values()].filter((issue) => looksLikeParent(issue) && keyFromMarker(issue.body) === group.key && issue.state === "OPEN");
        expect(claiming.map((issue) => issue.number), where).toEqual([group.parent]);
      }
      // 3. Each member sits under its group's parent, unless it is under one nobody here can see.
      for (const group of settled.groups) {
        for (const number of group.issues) {
          const member = github.byNumber(number)!;
          if (github.issues.get(before.get(member.id) ?? "")?.hidden) expect(member.parentId, where).toBe(before.get(member.id));
          else expect(member.parentId, where).toBe(github.byNumber(group.parent!)!.id);
        }
      }
      // 4. No link the file does not own was touched.
      for (const issue of github.issues.values()) {
        const was = before.get(issue.id);
        const owned = (issue.repo === REPO && members.has(issue.number)) || (was && managedBefore.has(was));
        if (!owned && before.has(issue.id)) expect(issue.parentId, `${where}: #${issue.number} moved`).toBe(was);
      }
      // 5. Parents are only created for groups that had none to repair or adopt.
      expect(created.size, where).toBeLessThanOrEqual(config.groups.filter((group) => !group.parent).length);
      outcomes.converged += 1;
    }
    // Measured 2026-10-21: 2,685 converged, the rest refused as an emptied file or a real loop. Most
    // must converge, or the generator is only producing refusals; both refusals must occur, or the
    // oracle above was never consulted.
    expect(outcomes.converged).toBeGreaterThan(SEEDS * 0.85);
    expect(outcomes.refusedALoop).toBeGreaterThan(0);
    expect(outcomes.refusedEmpty).toBeGreaterThan(0);
  });

  it("finishes a link order that the file's order would deadlock: each move frees the next", () => {
    // The audit's case: group a's parent sits under #3 (group b), #3 under #1 (group a). Linking #1
    // first would close a loop; moving #3 first does not.
    const github = new FakeGitHub(REPO);
    const one = github.add();
    const three = github.add({ number: 3 });
    const a = { key: "a", title: "A", summary: "", issues: [1] };
    const b = { key: "b", title: "B", summary: "", issues: [3] };
    const parentA = github.add({ ...renderParent(a, TARGET), labels: ["group"] });
    const parentB = github.add({ ...renderParent(b, TARGET), labels: ["group"] });
    github.link(one.id, three.id);
    github.link(three.id, parentA.id);
    const config = { groups: [{ ...a, parent: parentA.number }, { ...b, parent: parentB.number }] };
    const plan = planGroups(config, github.snapshot(), TARGET);
    applyPlan(plan, github.port());
    expect(planGroups(config, github.snapshot(), TARGET).actions).toEqual([]);
  });
});
