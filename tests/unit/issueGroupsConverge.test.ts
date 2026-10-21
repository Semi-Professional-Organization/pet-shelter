import { describe, it, expect } from "vitest";
import { applyPlan, keyFromMarker, planGroups, recordParents, renderParent } from "../../scripts/lib/issueGroups/plan.mjs";
import { FakeGitHub, readFrom, type FakeIssue } from "./support/fakeGitHub";

/**
 * One rule over many states, rather than one test per bug: from any state GitHub can be in, one
 * `--apply` makes the next plan empty, never creates a second parent for a group, never touches a
 * link the file does not own, and never sends a write GitHub refuses. When the planner refuses a
 * state instead, the state must really be impossible: `whyImpossible` must name a rule the finished
 * tree would break, judged from the fake's whole truth.
 *
 * Every plan is made from what the real reader (`readSnapshot`) returns through the fake's GraphQL,
 * not from the fake's whole state, so a gap in what is read fails here too. The states are generated
 * from a seed, so a failure names the seed that reproduces it.
 */

const REPO = "o/r";
const TARGET = { repo: REPO, branch: "master" };
const SEEDS = 5000;
// Seeds past SEEDS that once broke the planner, kept so they run every time. 15244: a link set aside
// as unknowable became legal once another came out of the way (found in a one-off 30,000-seed run).
const REGRESSIONS = [15244];

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
  github.pushAccess = rand() < 0.8;
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
  // Deep chains, so depth is exercised: a group's parent hung below one, or one hung below a member.
  if (rand() < 0.3) {
    const chain = Array.from({ length: 3 + Math.floor(rand() * 7) }, () => github.add());
    for (let i = 1; i < chain.length; i += 1) github.link(chain[i - 1].id, chain[i].id);
    try {
      if (rand() < 0.5 && parents.length > 0) github.link(chain[chain.length - 1].id, pick(parents).id);
      else if (groups.length > 0) github.link(github.byNumber(pick(groups).issues[0])!.id, chain[0].id);
    } catch {
      // too deep already; GitHub would refuse it
    }
    if (rand() < 0.2) chain[0].hidden = true;
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

/**
 * Why the tree the file asks for cannot be built, judged from the fake's whole truth (hidden issues
 * included), or null if it can. The planner may refuse a state only when this names a reason.
 */
function whyImpossible(github: FakeGitHub, config: { groups: Group[] }, parentOf: Map<string, string>, managed: Set<string>) {
  const members = new Set(config.groups.flatMap((group) => group.issues.map((number) => github.byNumber(number)!.id)));
  // Links on managed parents that the file does not want are removed first.
  const parent = new Map(
    [...github.issues.values()].map((issue) => [issue.id, issue.parentId && managed.has(issue.parentId) && !members.has(issue.id) ? null : issue.parentId]),
  );
  const targets = new Set<string>();
  for (const group of config.groups) {
    const target = parentOf.get(group.key) ?? `new:${group.key}`;
    for (const number of group.issues) {
      const member = github.byNumber(number)!;
      if (github.issues.get(member.parentId ?? "")?.hidden) continue;
      parent.set(member.id, target);
      targets.add(target);
    }
  }
  const chain = (start: string) => {
    const seen: string[] = [];
    for (let at = parent.get(start); at; at = parent.get(at)) {
      if (seen.includes(at)) return null;
      seen.push(at);
    }
    return seen;
  };
  const count = new Map<string, number>();
  for (const of of parent.values()) if (of) count.set(of, (count.get(of) ?? 0) + 1);
  for (const id of parent.keys()) {
    const above = chain(id);
    if (above === null) return "a loop";
    if (above.length > 8) return "deeper than eight levels";
  }
  if ([...count.values()].some((n) => n > 100)) return "more than 100 sub-issues";
  for (const target of targets) {
    if ([target, ...(chain(target) ?? [])].some((id) => github.issues.get(id)?.hidden)) return "a parent below an issue nobody here can see";
  }
  return null;
}

describe("one apply makes GitHub match the file, from any state", () => {
  it(`converges across ${SEEDS} generated states`, () => {
    const outcomes = { converged: 0, refusedImpossible: 0, refusedEmpty: 0 };
    for (const seed of [...Array.from({ length: SEEDS }, (_, i) => i + 1), ...REGRESSIONS]) {
      const { github, config } = world(seed);
      const where = `seed ${seed}`;
      const before = new Map([...github.issues.values()].map((issue) => [issue.id, issue.parentId]));
      const members = new Set(config.groups.flatMap((group) => group.issues));
      const looksLikeParent = (issue: FakeIssue) =>
        issue.repo === REPO && issue.labels.some((label) => label.toLowerCase() === "group") && keyFromMarker(issue.body) !== null;
      const recorded = new Set(config.groups.map((group) => group.parent));
      const managedBefore = new Set([...github.issues.values()].filter((issue) => looksLikeParent(issue) || (issue.repo === REPO && recorded.has(issue.number))).map((issue) => issue.id));

      let plan;
      try {
        plan = planGroups(config, readFrom(github, config), TARGET);
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
        expect(whyImpossible(github, config, parentOf, managedBefore), `${where}: refused a buildable tree: ${error}`).not.toBeNull();
        outcomes.refusedImpossible += 1;
        continue;
      }

      const writes = github.writes;
      const created = applyPlan(plan, github.port());
      // One write per action, plus one label per parent GitHub created without it.
      expect(github.writes - writes, where).toBe(plan.actions.length + (github.pushAccess ? 0 : created.size));
      const record = new Map(plan.record);
      for (const [key, issue] of created) record.set(key, issue.number);
      const settled = recordParents(config, record);

      // 1. The next plan is empty.
      expect(planGroups(settled, readFrom(github, settled), TARGET).actions, where).toEqual([]);
      // 2. Each group has exactly one open parent, the recorded one, labelled and marked.
      for (const group of settled.groups) {
        const claiming = [...github.issues.values()].filter((issue) => looksLikeParent(issue) && keyFromMarker(issue.body) === group.key && issue.state === "OPEN");
        expect(claiming.map((issue) => issue.number), where).toEqual([group.parent]);
      }
      // 3. Each member sits under its group's parent, unless the plan skipped it for want of sight.
      // A skip must be earned in the fake's truth: something hidden above its parent, below it, or
      // as its own parent. A skipped member stays where it was, or, if that was a parent this script
      // manages, comes out of it.
      const skippedBy = new Map<number, { removedFrom: number | null }>(plan.skipped.map((s: { child: number; removedFrom: number | null }) => [s.child, s]));
      const truthAbove = (id: string) => github.ancestors(id).map((at) => github.issues.get(at)!);
      const truthBelow = (id: string): FakeIssue[] => github.children(id).flatMap((child) => [child, ...truthBelow(child.id)]);
      for (const group of settled.groups) {
        const target = github.byNumber(group.parent!)!;
        for (const number of group.issues) {
          const member = github.byNumber(number)!;
          const skip = skippedBy.get(number);
          if (!skip) {
            expect(member.parentId, where).toBe(target.id);
            continue;
          }
          const unseen = [github.issues.get(before.get(member.id) ?? ""), ...truthAbove(target.id), ...truthBelow(member.id)].some((issue) => issue?.hidden);
          expect(unseen, `${where}: #${number} skipped with nothing hidden`).toBe(true);
          if (skip.removedFrom) expect(member.parentId, where).toBeNull();
          else expect(member.parentId, where).toBe(before.get(member.id));
        }
      }
      const leftAlone = new Set(skippedBy.keys());
      // 4. No link the file does not own was touched.
      for (const issue of github.issues.values()) {
        const was = before.get(issue.id);
        const owned = (issue.repo === REPO && members.has(issue.number)) || (was && managedBefore.has(was));
        if (!owned && before.has(issue.id)) expect(issue.parentId, `${where}: #${issue.number} moved`).toBe(was);
      }
      // 4b. Every sub-issue of a parent this script manages is a member of that parent's group, read
      // from the fake's truth, so a gap in what the reader sees cannot hide a stale link here.
      const parentOfGroup = new Map<string, Set<number>>(settled.groups.map((group: Group) => [github.byNumber(group.parent!)!.id, new Set(group.issues)]));
      for (const issue of github.issues.values()) {
        if (!issue.parentId || issue.hidden) continue;
        const holder = github.issues.get(issue.parentId)!;
        if (!looksLikeParent(holder) && !parentOfGroup.has(holder.id)) continue;
        const wanted = parentOfGroup.get(holder.id);
        if (issue.repo === REPO && leftAlone.has(issue.number)) continue;
        expect(Boolean(wanted && issue.repo === REPO && wanted.has(issue.number)), `${where}: #${issue.number} left under #${holder.number}`).toBe(true);
      }
      // 5. Parents are only created for groups that had none to repair or adopt.
      expect(created.size, where).toBeLessThanOrEqual(config.groups.filter((group) => !group.parent).length);
      outcomes.converged += 1;
    }
    // Measured 2026-10-21: 4,327 converged, 450 refused an impossible tree, 224 an emptied file. Most
    // must converge, or the generator is only producing refusals; both refusals must occur, or
    // the oracle above was never consulted.
    expect(outcomes.converged).toBeGreaterThan(SEEDS * 0.8);
    expect(outcomes.refusedImpossible).toBeGreaterThan(0);
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
    const plan = planGroups(config, readFrom(github, config), TARGET);
    applyPlan(plan, github.port());
    expect(planGroups(config, readFrom(github, config), TARGET).actions).toEqual([]);
  });
});
