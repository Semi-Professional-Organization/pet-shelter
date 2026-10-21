#!/usr/bin/env node
/**
 * Group issues under parent issues with GitHub's native sub-issues.
 *
 * `.github/issue-groups.json` is the source of truth. Each group becomes one parent issue labelled
 * `group`, and its issues become that parent's sub-issues. A run makes GitHub match the file: it
 * creates or updates parents, adds, moves and removes sub-issue links, and closes the parent of a
 * group that left the file. Parents' descriptions are overwritten; comments are never touched.
 * Rationale: `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`.
 *
 * Usage:
 *   node scripts/issue-groups.mjs                       # dry run: print the plan, change nothing
 *   node scripts/issue-groups.mjs --apply               # make GitHub match the file
 *   node scripts/issue-groups.mjs --suggest             # propose a group for each ungrouped issue
 *   node scripts/issue-groups.mjs --suggest --evaluate  # measure those proposals on the file itself
 *
 * Why a script rather than a prebuilt tool. Sub-issues are native, but nothing shipped manages them
 * from a list:
 *   1. `gh` (2.98) has no sub-issue command, and the API names issues by node id, not by number, so
 *      every link needs a lookup first.
 *   2. The API adds or removes one link per call. Nothing says "make it match this list", so
 *      `planGroups` diffs the file against GitHub, which makes a dry run exact and a second run a no-op.
 *   3. An issue has at most one parent, and adding it to a second fails unless it is moved. The plan
 *      shows each move, with the parent it leaves; the file may name an issue only once.
 *   4. A new issue joins no group by itself, so every run lists the open issues in none.
 *   5. `scripts/ledger-issues.mjs` rewrites the titles and bodies of `ledger` issues, and opens and
 *      closes them, but never touches relationships, so links survive it. Parents carry `group`,
 *      never `ledger`, so the mirror never edits them. A renamed ledger entry gets a new issue and its
 *      old one closes, still linked; the run reports closed sub-issues so the new one can take over.
 *
 * Reads the file from the working tree, so a dry run shows an edit before it is committed. Needs an
 * authenticated `gh` and nothing from `node_modules`, like `ledger-issues.mjs`.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { invokedAs } from "./lib/invokedAs.mjs";

export const CONFIG_PATH = ".github/issue-groups.json";
export const LABEL = "group";

// Anchored to the top of the body, where `renderParent` puts it. The repository is public, so an
// issue counts as a parent only with the marker *and* the label, which only triagers can apply: the
// same rule, for the same reason, as `ledger-issues.mjs`.
const MARKER = /^\s*<!--\s*issue-group:\s*([a-z0-9-]+)\s*-->/;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// GitHub refuses a title over 256 characters; one refused action stops the run.
const MAX_TITLE = 240;
// ceiling: a parent's sub-issues are read in one page of 100, which is also GitHub's own limit per
// parent. A larger group is refused at read time rather than planned from a partial list.
const MAX_CHILDREN = 100;

export const markerFor = (key) => `<!-- issue-group: ${key} -->`;

export function keyFromMarker(body) {
  const match = MARKER.exec(String(body ?? ""));
  return match ? match[1] : null;
}

const normalise = (text) => String(text ?? "").replace(/\r\n/g, "\n").trim();
const hasLabel = (issue, name = LABEL) => (issue.labels ?? []).some((label) => label.name === name);
const isClosed = (issue) => issue.state === "CLOSED";

/** Refuses a file the plan could not apply as written, naming every problem at once. */
export function validateConfig(config) {
  if (!config || !Array.isArray(config.groups)) throw new Error(`${CONFIG_PATH} needs a "groups" array`);
  const errors = [];
  const keys = new Set();
  const owner = new Map();
  const claim = (number, where) => {
    if (!Number.isInteger(number) || number < 1) {
      errors.push(`${where}: ${JSON.stringify(number)} is not an issue number`);
    } else if (owner.has(number)) {
      errors.push(`#${number} is in both ${owner.get(number)} and ${where}; an issue can have only one parent`);
    } else {
      owner.set(number, where);
    }
  };
  for (const [index, group] of config.groups.entries()) {
    const where = typeof group?.key === "string" && group.key ? group.key : `groups[${index}]`;
    if (typeof group?.key !== "string" || !KEY.test(group.key)) {
      errors.push(`${where}: key must be lowercase letters and digits joined by single hyphens`);
    } else if (keys.has(group.key)) {
      errors.push(`${where}: key is used twice`);
    } else {
      keys.add(group.key);
    }
    if (typeof group?.title !== "string" || !group.title.trim()) errors.push(`${where}: needs a title`);
    else if ([...group.title].length > MAX_TITLE) errors.push(`${where}: title is over ${MAX_TITLE} characters`);
    if (!Array.isArray(group?.issues) || group.issues.length === 0) errors.push(`${where}: needs at least one issue`);
    else if (group.issues.length > MAX_CHILDREN) errors.push(`${where}: GitHub allows at most ${MAX_CHILDREN} sub-issues`);
    else for (const number of group.issues) claim(number, where);
  }
  if (config.standalone !== undefined && !Array.isArray(config.standalone)) errors.push(`"standalone" must be an array`);
  else for (const number of config.standalone ?? []) claim(number, "standalone");
  if (errors.length > 0) throw new Error(`${CONFIG_PATH} is invalid:\n  ${errors.join("\n  ")}`);
  return config;
}

export function renderParent(group, { repo, branch }) {
  const url = `https://github.com/${repo}/blob/${branch}/${CONFIG_PATH}`;
  const header =
    `> Managed by \`scripts/issue-groups.mjs\` from [\`${CONFIG_PATH}\`](${url}). ` +
    "This description and the sub-issue list are overwritten on the next run: change the file instead.";
  const summary = normalise(group.summary);
  return {
    title: group.title.replace(/\s+/g, " ").trim(),
    body: `${markerFor(group.key)}\n${header}${summary ? `\n\n${summary}` : ""}`,
  };
}

/**
 * The actions that make GitHub match the file, plus what a human should look at. Pure, so the whole
 * policy is testable without touching GitHub.
 *
 * `issues` is every open issue, every `group`-labelled issue (open or closed), and every issue the
 * file names, each as `{ number, id, title, state, body, labels, parent, children }`, where `parent`
 * is a number or null and `children` is filled in for labelled issues only.
 */
export function planGroups(config, issues, target) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));

  // Open before closed, then oldest first, so a closed duplicate never displaces an open parent.
  const parents = issues
    .filter((issue) => hasLabel(issue) && keyFromMarker(issue.body))
    .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || a.number - b.number);
  const parentByKey = new Map();
  for (const issue of parents) {
    const key = keyFromMarker(issue.body);
    const held = parentByKey.get(key);
    if (!held) parentByKey.set(key, issue);
    else if (!isClosed(issue)) {
      throw new Error(`issues #${held.number} and #${issue.number} are both open parents of group ${key}; close the one that is not canonical`);
    }
  }
  const parentNumbers = new Set(parents.map((issue) => issue.number));

  const wantedBy = new Map();
  for (const group of config.groups) for (const number of group.issues) wantedBy.set(number, group.key);
  const problems = [];
  for (const [number, key] of wantedBy) {
    if (!byNumber.has(number)) problems.push(`#${number} (in ${key}) is not an issue in this repository`);
    else if (parentNumbers.has(number)) problems.push(`#${number} (in ${key}) is itself a group parent`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const liveKeys = new Set(config.groups.map((group) => group.key));
  const orphans = [...parentByKey].filter(([key, issue]) => !liveKeys.has(key) && !isClosed(issue));
  if (config.groups.length === 0 && orphans.length > 0) {
    // An emptied file is likelier to be a bad edit than a decision to ungroup everything.
    throw new Error(`${CONFIG_PATH} has no groups but ${orphans.length} group parents are open; close them by hand if that is meant`);
  }

  const actions = [];
  const notes = [];
  // A child another group wants is moved by that group's `move`, which detaches it from here.
  const removeUnwanted = (key, parent) => {
    for (const child of parent.children ?? []) {
      if (!wantedBy.has(child.number)) {
        actions.push({ type: "remove", key, parent: parent.number, parentId: parent.id, child: child.number, childId: child.id });
      }
    }
  };
  for (const group of config.groups) {
    const rendered = renderParent(group, target);
    const parent = parentByKey.get(group.key);
    if (!parent) {
      actions.push({ type: "create", key: group.key, ...rendered });
    } else {
      if (isClosed(parent)) actions.push({ type: "reopen", key: group.key, number: parent.number });
      if (normalise(parent.title) !== rendered.title || normalise(parent.body) !== normalise(rendered.body)) {
        actions.push({ type: "update", key: group.key, number: parent.number, ...rendered });
      }
      removeUnwanted(group.key, parent);
    }
    for (const number of group.issues) {
      const child = byNumber.get(number);
      if (isClosed(child)) {
        notes.push(`#${number} (in ${group.key}) is closed. If its ledger entry was renamed, put the new issue in its place.`);
      }
      if (parent && child.parent === parent.number) continue;
      const link = { key: group.key, parent: parent?.number ?? null, parentId: parent?.id ?? null, child: number, childId: child.id };
      if (child.parent == null) {
        actions.push({ type: "add", ...link });
        continue;
      }
      actions.push({ type: "move", ...link, from: child.parent });
      if (!parentNumbers.has(child.parent)) {
        notes.push(`#${number} is under #${child.parent}, which this script does not manage; the move drops that link.`);
      }
    }
  }
  // A group that left the file: its parent lets go of its sub-issues, so none stays linked to a
  // group nobody lists, and closes. Already closed, it still lets go.
  for (const [key, parent] of [...parentByKey].sort(([a], [b]) => a.localeCompare(b))) {
    if (liveKeys.has(key)) continue;
    removeUnwanted(key, parent);
    if (!isClosed(parent)) actions.push({ type: "close", key, number: parent.number });
  }

  const listed = new Set([...wantedBy.keys(), ...(config.standalone ?? [])]);
  const ungrouped = issues
    .filter((issue) => !isClosed(issue) && !listed.has(issue.number) && !parentNumbers.has(issue.number))
    .sort((a, b) => a.number - b.number);
  return { actions, notes, ungrouped };
}

// --- Suggestions --------------------------------------------------------------------------------

const STOPWORDS = new Set(
  ("the and for that this with from are was were not but its it's has have had all any can cannot " +
    "one two three four five six seven eight nine ten each every only also than then them they their " +
    "there here what when where which who whom why how does did done into onto over under out off " +
    "per via vs yet still now new old same other more most less least such very just one's because " +
    "while before after again once both either neither nor own being been would could should will " +
    "may might must shall about above below between through during without within whose these those " +
    "status open opened asserted read found code review reviews reasoned measured not fixed left " +
    "pr entry tasks md see https github com blob master issue issues").split(/\s+/),
);

/** The ledger mirror's marker and header line say the same thing on every ledger issue. */
const stripMirrorHeader = (body) =>
  normalise(body)
    .replace(/^<!--[^\n]*-->\n?/, "")
    .replace(/^> Mirrored from [^\n]*\n?/, "");

const stem = (word) => (word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

/**
 * An issue as weighted features: the source files and identifiers it names, and its words. A file
 * named by path in one issue and as a bare component name in another meet at `id:<basename>`.
 */
export function features(issue) {
  const text = `${issue.title ?? ""}\n${stripMirrorHeader(issue.body)}`;
  const counts = new Map();
  const add = (feature, weight = 1) => counts.set(feature, (counts.get(feature) ?? 0) + weight);
  // A repo-root directory only: not the `prisma/` in `@prisma/client` or the `docs/` deep in a path.
  const paths = text.match(/(?<![\w@/.-])(?:src|tests|scripts|prisma|docs|\.claude|\.github|\.codex)\/[\w.@[\]/-]+/g) ?? [];
  for (const raw of paths) {
    const path = raw.replace(/[.:]+$/, "");
    add(`path:${path.toLowerCase()}`, 2);
    // Every extension goes, so `issueGroups.test.ts` meets a backticked `issueGroups`.
    const base = path.slice(path.lastIndexOf("/") + 1).replace(/\..*$/, "");
    if (base) add(`id:${base.toLowerCase()}`, 2);
  }
  for (const match of text.matchAll(/`([A-Za-z_$][\w$]*)(?:\(\))?`/g)) add(`id:${match[1].toLowerCase()}`, 2);
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOPWORDS.has(word)) add(`w:${stem(word)}`);
  }
  // The title says what the issue is about; its words count three times.
  for (const word of String(issue.title ?? "").toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) {
    if (!STOPWORDS.has(word)) add(`w:${stem(word)}`, 2);
  }
  return counts;
}

/** TF-IDF vectors, unit length, over a corpus of feature maps. */
function vectorise(corpus) {
  const df = new Map();
  for (const counts of corpus.values()) for (const feature of counts.keys()) df.set(feature, (df.get(feature) ?? 0) + 1);
  const total = corpus.size;
  const vectors = new Map();
  for (const [number, counts] of corpus) {
    const vector = new Map();
    for (const [feature, count] of counts) {
      // A feature on one issue only cannot link it to anything; drop it.
      if (df.get(feature) < 2) continue;
      vector.set(feature, (1 + Math.log(count)) * Math.log(total / df.get(feature)));
    }
    const length = Math.hypot(...vector.values()) || 1;
    for (const [feature, value] of vector) vector.set(feature, value / length);
    vectors.set(number, vector);
  }
  return vectors;
}

const dot = (a, b) => {
  let sum = 0;
  for (const [feature, value] of a) sum += value * (b.get(feature) ?? 0);
  return sum;
};

/** Mean of member vectors. */
function centroid(vectors, members) {
  const sum = new Map();
  for (const number of members) {
    for (const [feature, value] of vectors.get(number) ?? []) sum.set(feature, (sum.get(feature) ?? 0) + value);
  }
  for (const [feature, value] of sum) sum.set(feature, value / members.length);
  return sum;
}

/**
 * Ranks the groups for one issue by cosine-like similarity to each group's centroid, with the
 * features that contributed most. `exclude` leaves an issue out of the centroids (leave-one-out).
 *
 * ceiling: bag of words plus named files, compared with each group's mean. It cannot read meaning,
 * so an issue about a group's subject in new vocabulary scores low, and one that merely names a
 * shared file scores high. Accuracy is measured by `--suggest --evaluate`, which hides each grouped
 * issue in turn and checks the top guess; the figure for the first grouping is in
 * `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`. Suggestions are only printed:
 * a human puts an issue in the file.
 */
export function rankGroups(number, vectors, groups, { exclude = null } = {}) {
  const vector = vectors.get(number) ?? new Map();
  return groups
    .map((group) => {
      const members = group.issues.filter((member) => member !== exclude && vectors.has(member));
      const center = members.length > 0 ? centroid(vectors, members) : new Map();
      const evidence = [...vector]
        .map(([feature, value]) => [feature, value * (center.get(feature) ?? 0)])
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([feature]) => feature.replace(/^(w|id|path):/, ""));
      return { key: group.key, score: dot(vector, center), evidence };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** Below this, or this close to the runner-up, a guess is reported as no clear group. */
export const MIN_SCORE = 0.05;
export const MIN_MARGIN = 0.01;

export function suggest(config, issues, candidates) {
  const vectors = vectorise(new Map(issues.map((issue) => [issue.number, features(issue)])));
  return candidates.map((issue) => {
    const [best, next] = rankGroups(issue.number, vectors, config.groups);
    const clear = best && best.score >= MIN_SCORE && (!next || best.score - next.score >= MIN_MARGIN);
    return { number: issue.number, title: issue.title, best, next, clear };
  });
}

/** Leave-one-out over the file's own grouping: how often the top guess is the issue's real group. */
export function evaluate(config, issues) {
  const known = new Set(issues.map((issue) => issue.number));
  const vectors = vectorise(new Map(issues.map((issue) => [issue.number, features(issue)])));
  const results = [];
  for (const group of config.groups) {
    for (const number of group.issues) {
      if (!known.has(number)) continue;
      const ranked = rankGroups(number, vectors, config.groups, { exclude: number });
      const rank = ranked.findIndex((entry) => entry.key === group.key) + 1;
      results.push({ number, actual: group.key, guess: ranked[0].key, rank });
    }
  }
  const share = (test) => (results.length === 0 ? 0 : results.filter(test).length / results.length);
  return { results, top1: share((r) => r.rank === 1), top2: share((r) => r.rank <= 2) };
}

// --- GitHub -------------------------------------------------------------------------------------

const FIELDS = "number id title body state labels(first: 50) { nodes { name } } parent { number }";

const OPEN_QUERY = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $endCursor, states: [OPEN]) {
      nodes { ${FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

// `repository.issues` rather than `gh issue list --label`, which reads the lagging search index:
// see the same choice in `ledger-issues.mjs`.
const PARENTS_QUERY = `query($owner: String!, $name: String!, $label: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $endCursor, filterBy: {labels: [$label]}, states: [OPEN, CLOSED]) {
      nodes { ${FIELDS} subIssues(first: ${MAX_CHILDREN}) { totalCount nodes { number id title state } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { ${FIELDS} } }
}`;

const ADD_MUTATION = `mutation($issueId: ID!, $subIssueId: ID!) {
  addSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId, replaceParent: true}) { issue { number } }
}`;

const REMOVE_MUTATION = `mutation($issueId: ID!, $subIssueId: ID!) {
  removeSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId}) { issue { number } }
}`;

const toIssue = ({ number, id, title, body, state, labels, parent }) => ({
  number,
  id,
  title,
  body,
  state,
  labels: (labels?.nodes ?? []).map(({ name }) => ({ name })),
  parent: parent?.number ?? null,
});

/** Merges the open issues, the labelled parents and their children into the shape `planGroups` reads. */
export function issuesFromPages(openPages, parentPages) {
  const byNumber = new Map();
  for (const node of openPages.flatMap((page) => page.data.repository.issues.nodes)) byNumber.set(node.number, toIssue(node));
  for (const node of parentPages.flatMap((page) => page.data.repository.issues.nodes)) {
    if (node.subIssues.totalCount > MAX_CHILDREN) {
      throw new Error(`#${node.number} has ${node.subIssues.totalCount} sub-issues; this script reads at most ${MAX_CHILDREN}`);
    }
    const children = node.subIssues.nodes.map(({ number, id, state }) => ({ number, id, state }));
    byNumber.set(node.number, { ...toIssue(node), children });
    for (const child of node.subIssues.nodes) {
      const known = byNumber.get(child.number);
      if (known) known.parent = node.number;
      else byNumber.set(child.number, { ...child, body: "", labels: [], parent: node.number });
    }
  }
  return [...byNumber.values()];
}

/**
 * Runs a plan through `exec` (the `gh` CLI in production), stopping at the first refusal: every
 * action is idempotent against a fresh read, so the fix is to re-run, and a run-wide failure (auth,
 * network, a rate limit) only worsens by pressing on.
 */
export function applyActions(actions, { repo, exec, log }) {
  const created = new Map(); // group key -> { number, id } of a parent made this run
  const parentId = (action) => action.parentId ?? created.get(action.key)?.id;
  const parentNumber = (action) => action.parent ?? created.get(action.key)?.number;
  const patch = (number, fields) =>
    exec("gh", ["api", "-X", "PATCH", `repos/${repo}/issues/${number}`, "--input", "-"], JSON.stringify(fields));
  const link = (query, action) =>
    exec("gh", ["api", "graphql", "-f", `query=${query}`, "-f", `issueId=${parentId(action)}`, "-f", `subIssueId=${action.childId}`]);

  for (const [index, action] of actions.entries()) {
    try {
      if (action.type === "create") {
        const issue = JSON.parse(
          exec("gh", ["api", "-X", "POST", `repos/${repo}/issues`, "--input", "-"], JSON.stringify({ title: action.title, body: action.body, labels: [LABEL] })),
        );
        created.set(action.key, { number: issue.number, id: issue.node_id });
        log(`  created #${issue.number} for ${action.key}`);
      } else if (action.type === "update") {
        patch(action.number, { title: action.title, body: action.body });
        log(`  updated #${action.number}`);
      } else if (action.type === "reopen") {
        patch(action.number, { state: "open" });
        log(`  reopened #${action.number}`);
      } else if (action.type === "close") {
        patch(action.number, { state: "closed" });
        log(`  closed #${action.number}`);
      } else if (action.type === "add" || action.type === "move") {
        link(ADD_MUTATION, action);
        log(`  ${action.type === "move" ? `moved #${action.child} from #${action.from} to` : `added #${action.child} to`} #${parentNumber(action)}`);
      } else if (action.type === "remove") {
        link(REMOVE_MUTATION, action);
        log(`  removed #${action.child} from #${action.parent}`);
      }
    } catch (error) {
      const [command, ...reason] = String(error?.message ?? error).split("\n");
      const why = reason.map((line) => line.trim()).filter(Boolean).join(" ") || command;
      throw new Error(`${action.type} for ${action.key} was refused after ${index} of ${actions.length} actions applied: ${why}`);
    }
  }
}

export function formatAction(action) {
  const parent = action.parent ? `#${action.parent}` : `new ${action.key} parent`;
  switch (action.type) {
    case "create":
      return `  create  parent for ${action.key}: "${action.title}"`;
    case "update":
    case "reopen":
    case "close":
      return `  ${action.type.padEnd(7)} #${action.number} (${action.key})`;
    case "add":
      return `  add     #${action.child} to ${parent}`;
    case "move":
      return `  move    #${action.child} from #${action.from} to ${parent}`;
    case "remove":
      return `  remove  #${action.child} from #${action.parent} (${action.key})`;
    default:
      return `  ${action.type}`;
  }
}

const run = (command, args, input) =>
  execFileSync(command, args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();

const USAGE =
  "usage: node scripts/issue-groups.mjs [--apply | --suggest [--evaluate]]\n" +
  `  Makes GitHub's parent issues and sub-issues match ${CONFIG_PATH}.\n` +
  "  Without --apply it prints the plan and changes nothing.\n" +
  "  --suggest proposes a group for each ungrouped open issue; --evaluate measures those proposals.\n";

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  const unknown = argv.filter((arg) => !["--apply", "--suggest", "--evaluate"].includes(arg));
  const apply = argv.includes("--apply");
  const suggesting = argv.includes("--suggest");
  const evaluating = argv.includes("--evaluate");
  if (unknown.length > 0 || (apply && suggesting) || (evaluating && !suggesting)) {
    process.stderr.write(`${unknown.length > 0 ? `unknown argument: ${unknown.join(" ")}\n` : ""}${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const config = validateConfig(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
  const repoInfo = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]));
  const repo = repoInfo.nameWithOwner;
  const [owner, name] = repo.split("/");
  const graphql = (query, vars) =>
    JSON.parse(run("gh", ["api", "graphql", "--paginate", "--slurp", "-f", `query=${query}`, ...vars.flatMap((v) => ["-f", v])]));
  let issues = issuesFromPages(
    graphql(OPEN_QUERY, [`owner=${owner}`, `name=${name}`]),
    graphql(PARENTS_QUERY, [`owner=${owner}`, `name=${name}`, `label=${LABEL}`]),
  );

  // A closed issue the file names is in neither read; fetch each one. A pull request or an unused
  // number is refused as NOT_FOUND and stays missing, which `planGroups` then reports; any other
  // failure (auth, network, a rate limit) stops the run rather than blaming the file.
  // ceiling: one call per closed issue named, which is a handful; alias them into one query if not.
  const known = new Set(issues.map((issue) => issue.number));
  for (const number of config.groups.flatMap((group) => group.issues).filter((n) => !known.has(n))) {
    try {
      const node = JSON.parse(
        run("gh", ["api", "graphql", "-f", `query=${ISSUE_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${number}`]),
      ).data.repository.issue;
      if (node) issues = [...issues, toIssue(node)];
    } catch (error) {
      if (!/Could not resolve to an Issue/.test(String(error?.message ?? error))) throw error;
    }
  }

  if (suggesting) {
    const write = (line) => process.stdout.write(`${line}\n`);
    if (evaluating) {
      const { results, top1, top2 } = evaluate(config, issues);
      write(`issue-groups: leave-one-out over ${results.length} grouped issues`);
      write(`  top guess right: ${(top1 * 100).toFixed(1)}%   right group in top two: ${(top2 * 100).toFixed(1)}%`);
      for (const miss of results.filter((r) => r.rank !== 1)) {
        write(`  #${miss.number} is in ${miss.actual}, guessed ${miss.guess} (real group ranked ${miss.rank})`);
      }
      return;
    }
    const { ungrouped } = planGroups(config, issues, { repo, branch: repoInfo.defaultBranchRef.name });
    if (ungrouped.length === 0) {
      write("issue-groups: every open issue is in a group or listed as standalone");
      return;
    }
    write(`issue-groups: ${ungrouped.length} open issues are in no group. Suggestions only; nothing is changed.`);
    for (const s of suggest(config, issues, ungrouped)) {
      write(`  #${s.number} ${s.title}`);
      if (!s.clear) write(`      no clear group (best ${s.best?.key ?? "none"}, ${s.best?.score.toFixed(3) ?? 0})`);
      else write(`      -> ${s.best.key} (${s.best.score.toFixed(3)}; next ${s.next?.key ?? "none"} ${s.next?.score.toFixed(3) ?? ""}) shares: ${s.best.evidence.join(", ")}`);
    }
    return;
  }

  const { actions, notes, ungrouped } = planGroups(config, issues, { repo, branch: repoInfo.defaultBranchRef.name });
  process.stdout.write(`issue-groups: ${config.groups.length} groups in ${CONFIG_PATH}, ${issues.length} issues read from ${repo}\n`);
  process.stdout.write(actions.length === 0 ? "  in sync, nothing to do\n" : `${actions.map(formatAction).join("\n")}\n`);
  for (const note of notes) process.stdout.write(`  note: ${note}\n`);
  if (ungrouped.length > 0) {
    process.stdout.write(`\n${ungrouped.length} open issues are in no group (try --suggest):\n`);
    for (const issue of ungrouped) {
      process.stdout.write(`  #${issue.number} ${issue.title}${issue.parent ? ` (sub-issue of #${issue.parent}, not in the file)` : ""}\n`);
    }
  }
  if (actions.length === 0) return;
  if (!apply) {
    process.stdout.write(`\nDry run: ${actions.length} actions, nothing changed. Re-run with --apply to make them.\n`);
    return;
  }

  const labels = JSON.parse(run("gh", ["label", "list", "--repo", repo, "--limit", "1000", "--json", "name"]));
  if (!labels.some((label) => label.name === LABEL)) {
    run("gh", ["label", "create", LABEL, "--repo", repo, "--color", "0e8a16", "--description", `Parent issue managed from ${CONFIG_PATH}`]);
  }
  applyActions(actions, { repo, exec: run, log: (line) => process.stdout.write(`${line}\n`) });
}

if (invokedAs("scripts/issue-groups.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`issue-groups: ${error.message}\n`);
    process.exit(1);
  });
}
