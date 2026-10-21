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
 * file names, each as `{ number, id, title, state, body, labels, parent, children }`. `parent` is a
 * number, an `owner/repo#n` string for a parent in another repository, or null. `children` is filled
 * in for labelled issues only, and a child from another repository carries `foreign: "owner/repo#n"`.
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
  // Every parent that is not the one a listed group uses: a departed group's, open or closed, and a
  // closed duplicate of a listed group's. Each lets go of what no group wants, and closes if open.
  const retired = parents.filter((issue) => parentByKey.get(keyFromMarker(issue.body)) !== issue || !liveKeys.has(keyFromMarker(issue.body)));
  const closing = retired.filter((issue) => !isClosed(issue));
  if (config.groups.length === 0 && closing.length > 0) {
    // An emptied file is likelier to be a bad edit than a decision to ungroup everything.
    throw new Error(`${CONFIG_PATH} has no groups but ${closing.length} group parents are open; close them by hand if that is meant`);
  }

  const actions = [];
  const notes = [];
  // A child another group wants is moved by that group's `move`, which detaches it from here. A
  // child from another repository is never in the file, so it always goes.
  const removeUnwanted = (key, parent) => {
    for (const child of parent.children ?? []) {
      if (child.foreign || !wantedBy.has(child.number)) {
        actions.push({ type: "remove", key, parent: parent.number, parentId: parent.id, child: child.foreign ?? child.number, childId: child.id });
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
        notes.push(`#${number} is under ${ref(child.parent)}, which this script does not manage; the move drops that link.`);
      }
    }
  }
  for (const parent of retired) {
    const key = keyFromMarker(parent.body);
    removeUnwanted(key, parent);
    if (!isClosed(parent)) actions.push({ type: "close", key, number: parent.number });
  }
  // Creates first, because a new parent's links need its id; removes before moves and adds, so a
  // parent at GitHub's limit has room for what a removal frees. ceiling: moves keep file order, so a
  // move into a full parent can still precede the move that empties a slot in it, and the run stops
  // there; making room by hand and re-running finishes it. No group here is near 100.
  const phase = ["create", "reopen", "update", "remove", "move", "add", "close"];
  actions.sort((a, b) => phase.indexOf(a.type) - phase.indexOf(b.type));

  for (const number of config.standalone ?? []) {
    const issue = byNumber.get(number);
    if (!issue || isClosed(issue) || parentNumbers.has(number)) {
      notes.push(`standalone #${number} is not an open issue here (closed, a pull request, a parent or unused); drop it from the file.`);
    }
  }
  const listed = new Set([...wantedBy.keys(), ...(config.standalone ?? [])]);
  const unlinked = new Set(actions.filter((action) => action.type === "remove").map((action) => action.child));
  const ungrouped = issues
    .filter((issue) => !isClosed(issue) && !listed.has(issue.number) && !parentNumbers.has(issue.number))
    .map((issue) => (unlinked.has(issue.number) ? { ...issue, parent: null } : issue))
    .sort((a, b) => a.number - b.number);
  return { actions, notes, ungrouped };
}

/** A parent as people write it: `#12` here, `owner/repo#12` in another repository. */
export const ref = (parent) => (typeof parent === "number" ? `#${parent}` : String(parent));

// --- Suggestions --------------------------------------------------------------------------------

const STOPWORDS = new Set(
  // Only words the tokenizer below can produce: three letters or more, no apostrophes.
  ("the and for that this with from are was were not but its has have had all any can cannot " +
    "one two three four five six seven eight nine ten each every only also than then them they their " +
    "there here what when where which who whom why how does did done into onto over under out off " +
    "per via yet still now new old same other more most less least such very just because " +
    "while before after again once both either neither nor own being been would could should will " +
    "may might must shall about above below between through during without within whose these those " +
    "status open opened asserted read found code review reviews reasoned measured fixed left " +
    "entry tasks see https github com blob master issue issues").split(/\s+/),
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
    // Trailing punctuation, and the `]` of a markdown link around the path, are not part of it.
    const path = raw.replace(/[.:\]]+$/, "");
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

const judge = ([best, next]) => ({
  best,
  next,
  clear: Boolean(best) && best.score >= MIN_SCORE && (!next || best.score - next.score >= MIN_MARGIN),
});

/**
 * Vectors over real issues only. A group parent repeats its summary and this script's header, so
 * counting parents would shift every weight the moment the grouping is applied.
 */
const corpusVectors = (issues) =>
  vectorise(new Map(issues.filter((issue) => !(hasLabel(issue) && keyFromMarker(issue.body))).map((issue) => [issue.number, features(issue)])));

export function suggest(config, issues, candidates) {
  const vectors = corpusVectors(issues);
  return candidates.map((issue) => ({ number: issue.number, title: issue.title, ...judge(rankGroups(issue.number, vectors, config.groups)) }));
}

/**
 * Leave-one-out over the file's own grouping, judged as `--suggest` would print it: `right` is the
 * share of issues whose clear proposal is their real group, `wrong` a clear proposal of another, and
 * `unclear` the share printed as no clear group. `top2` ranks without the gate.
 */
export function evaluate(config, issues) {
  const vectors = corpusVectors(issues);
  const results = [];
  for (const group of config.groups) {
    for (const number of group.issues) {
      if (!vectors.has(number)) continue;
      const ranked = rankGroups(number, vectors, config.groups, { exclude: number });
      const rank = ranked.findIndex((entry) => entry.key === group.key) + 1;
      results.push({ number, actual: group.key, guess: ranked[0].key, rank, clear: judge(ranked).clear });
    }
  }
  const share = (test) => (results.length === 0 ? 0 : results.filter(test).length / results.length);
  return {
    results,
    right: share((r) => r.clear && r.rank === 1),
    wrong: share((r) => r.clear && r.rank !== 1),
    unclear: share((r) => !r.clear),
    top2: share((r) => r.rank <= 2),
  };
}

// --- GitHub -------------------------------------------------------------------------------------

// Sub-issues may cross repositories, so a parent is read with its repository and a number alone is
// never taken to mean an issue here.
const FIELDS = "number id title body state labels(first: 50) { nodes { name } } parent { number repository { nameWithOwner } }";
// No labels on a child: 100 parents x 100 children x 50 labels is over GitHub's 500,000-node cap
// for one query (observed), and a child's labels decide nothing. Its parent is the node it sits in.
const CHILD_FIELDS = "number id title body state repository { nameWithOwner }";

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
      nodes { ${FIELDS} subIssues(first: ${MAX_CHILDREN}) { totalCount nodes { ${CHILD_FIELDS} } } }
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

const sameRepo = (repo, other) => other.toLowerCase() === repo.toLowerCase();

const toIssue = ({ number, id, title, body, state, labels, parent }, repo) => ({
  number,
  id,
  title,
  body,
  state,
  labels: (labels?.nodes ?? []).map(({ name }) => ({ name })),
  parent: !parent
    ? null
    : sameRepo(repo, parent.repository.nameWithOwner)
      ? parent.number
      : `${parent.repository.nameWithOwner}#${parent.number}`,
});

/** Merges the open issues, the labelled parents and their children into the shape `planGroups` reads. */
export function issuesFromPages(openPages, parentPages, repo) {
  const byNumber = new Map();
  for (const node of openPages.flatMap((page) => page.data.repository.issues.nodes)) byNumber.set(node.number, toIssue(node, repo));
  for (const node of parentPages.flatMap((page) => page.data.repository.issues.nodes)) {
    if (node.subIssues.totalCount > MAX_CHILDREN) {
      throw new Error(`#${node.number} has ${node.subIssues.totalCount} sub-issues; this script reads at most ${MAX_CHILDREN}`);
    }
    const children = node.subIssues.nodes.map((child) =>
      sameRepo(repo, child.repository.nameWithOwner)
        ? { number: child.number, id: child.id, state: child.state }
        : { number: child.number, id: child.id, state: child.state, foreign: `${child.repository.nameWithOwner}#${child.number}` },
    );
    byNumber.set(node.number, { ...byNumber.get(node.number), ...toIssue(node, repo), children });
    for (const child of node.subIssues.nodes) {
      // A closed child is in no other read; it keeps its body so `--suggest` sees the same text
      // before and after it was linked.
      if (sameRepo(repo, child.repository.nameWithOwner) && !byNumber.has(child.number)) {
        byNumber.set(child.number, { ...toIssue(child, repo), parent: node.number });
      }
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
        log(`  ${action.type === "move" ? `moved #${action.child} from ${ref(action.from)} to` : `added #${action.child} to`} #${parentNumber(action)}`);
      } else if (action.type === "remove") {
        link(REMOVE_MUTATION, action);
        log(`  removed ${ref(action.child)} from #${action.parent}`);
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
      return `  move    #${action.child} from ${ref(action.from)} to ${parent}`;
    case "remove":
      return `  remove  ${ref(action.child)} from #${action.parent} (${action.key})`;
    default:
      return `  ${action.type}`;
  }
}

// stderr is piped, not inherited: a refusal reaches the person once, in the error that stops the
// run, and an expected NOT_FOUND prints nothing at all. The error carries gh's own words under a
// one-line label, never the echoed command, whose GraphQL argument runs to many lines.
const run = (command, args, input) => {
  try {
    return execFileSync(command, args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (error) {
    const said = String(error?.stderr ?? "").trim() || String(error?.message ?? error).split("\n").pop();
    throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed\n${said}`);
  }
};

/** GitHub's answer for a number that is a pull request or no issue at all, as `gh` relays it. */
export const isMissingIssueError = (error) => /Could not resolve to an Issue with the number of/.test(String(error?.message ?? error));

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
    repo,
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
      if (node) issues = [...issues, toIssue(node, repo)];
    } catch (error) {
      if (!isMissingIssueError(error)) throw error;
    }
  }

  if (suggesting) {
    const write = (line) => process.stdout.write(`${line}\n`);
    if (evaluating) {
      const { results, right, wrong, unclear, top2 } = evaluate(config, issues);
      const pct = (share) => `${(share * 100).toFixed(1)}%`;
      write(`issue-groups: leave-one-out over ${results.length} grouped issues, judged as --suggest prints them`);
      write(`  right: ${pct(right)}   wrong: ${pct(wrong)}   no clear group: ${pct(unclear)}   real group in top two: ${pct(top2)}`);
      for (const miss of results.filter((r) => !r.clear || r.rank !== 1)) {
        const verdict = miss.clear ? `guessed ${miss.guess}` : `no clear group (leaning ${miss.guess})`;
        write(`  #${miss.number} is in ${miss.actual}: ${verdict}, real group ranked ${miss.rank}`);
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
      process.stdout.write(`  #${issue.number} ${issue.title}${issue.parent ? ` (sub-issue of ${ref(issue.parent)}, not in the file)` : ""}\n`);
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
