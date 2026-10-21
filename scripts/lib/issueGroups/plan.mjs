/**
 * The pure half of `scripts/issue-groups.mjs`: read the grouping file, compare it with a snapshot of
 * GitHub, and say what to change. Nothing here talks to GitHub, so every rule is testable.
 *
 * The design, and why: `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`. In short:
 *   - Identity is the file. A group's parent is the issue number recorded in its `parent` field; the
 *     `group` label and the body marker are checked and repaired, never trusted to identify. Until a
 *     number is recorded, a group adopts the one labelled issue whose marker names it.
 *   - The plan is a difference of two whole states, both keyed by GitHub node id: the links the file
 *     wants against the links that exist on every parent this script manages.
 *   - Every rule GitHub enforces is checked on the finished tree before anything is written, and the
 *     links are ordered by simulating them against those rules, so a refusal can only be run-wide.
 */

export const CONFIG_PATH = ".github/issue-groups.json";
export const LABEL = "group";

// GitHub's own limits. Titles over 256 characters and bodies over 65,536 are refused; the margins
// leave room for the rendered header and for any difference in how GitHub counts characters.
export const LIMITS = { title: 240, summary: 59_000, children: 100, depth: 8 };

const MARKER = /^\s*<!--\s*issue-group:\s*([a-z0-9-]+)\s*-->/;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const markerFor = (key) => `<!-- issue-group: ${key} -->`;

export function keyFromMarker(body) {
  const match = MARKER.exec(String(body ?? ""));
  return match ? match[1] : null;
}

const normalise = (text) => String(text ?? "").replace(/\r\n/g, "\n").trim();
const isClosed = (issue) => issue.state === "CLOSED";
// GitHub compares label names ignoring case, so this does too.
const hasLabel = (issue) => (issue.labels ?? []).some((name) => name.toLowerCase() === LABEL);

/** An issue as people write it: `#12` here, `owner/repo#12` elsewhere. */
export const refOf = (issue, repo) =>
  !issue ? "an issue this account cannot see" : issue.repo.toLowerCase() === repo.toLowerCase() ? `#${issue.number}` : `${issue.repo}#${issue.number}`;

/** An issue's parent as people write it, read or not: the snapshot keeps `parentRef` for both. */
const parentRefOf = (issue, byId, repo) =>
  issue.parentHidden ? "an issue this account cannot see" : byId.has(issue.parentId) ? refOf(byId.get(issue.parentId), repo) : issue.parentRef;

// --- The file -----------------------------------------------------------------------------------

/** Refuses a file the plan could not apply as written, naming every problem at once. */
export function validateConfig(config) {
  if (!config || !Array.isArray(config.groups)) throw new Error(`${CONFIG_PATH} needs a "groups" array`);
  const errors = [];
  const keys = new Set();
  const owner = new Map();
  const parents = new Map();
  const claim = (number, where) => {
    if (!Number.isInteger(number) || number < 1) errors.push(`${where}: ${JSON.stringify(number)} is not an issue number`);
    else if (owner.has(number)) errors.push(`#${number} is in both ${owner.get(number)} and ${where}; an issue can have only one parent`);
    else owner.set(number, where);
  };
  // Only fields this script reads: `--apply` rewrites the file to record parents, and a field it did
  // not know would be lost silently.
  const unknownFields = (object, allowed, where) => {
    for (const name of Object.keys(object ?? {})) if (!allowed.includes(name)) errors.push(`${where}: unknown field "${name}"`);
  };
  unknownFields(config, ["$comment", "groups", "standalone"], CONFIG_PATH);
  for (const [index, group] of config.groups.entries()) {
    const where = typeof group?.key === "string" && group.key ? group.key : `groups[${index}]`;
    unknownFields(group, ["key", "title", "summary", "parent", "issues"], where);
    if (typeof group?.key !== "string" || !KEY.test(group.key)) errors.push(`${where}: key must be lowercase letters and digits joined by single hyphens`);
    else if (keys.has(group.key)) errors.push(`${where}: key is used twice`);
    else keys.add(group.key);
    if (typeof group?.title !== "string" || !group.title.trim()) errors.push(`${where}: needs a title`);
    else if ([...group.title].length > LIMITS.title) errors.push(`${where}: title is over ${LIMITS.title} characters`);
    if (group?.summary !== undefined && typeof group.summary !== "string") errors.push(`${where}: summary must be text`);
    else if ([...String(group?.summary ?? "")].length > LIMITS.summary) errors.push(`${where}: summary is over ${LIMITS.summary} characters`);
    if (group?.parent !== undefined) {
      if (!Number.isInteger(group.parent) || group.parent < 1) errors.push(`${where}: parent ${JSON.stringify(group.parent)} is not an issue number`);
      else if (parents.has(group.parent)) errors.push(`${where}: parent #${group.parent} is also the parent of ${parents.get(group.parent)}`);
      else parents.set(group.parent, where);
    }
    if (!Array.isArray(group?.issues) || group.issues.length === 0) errors.push(`${where}: needs at least one issue`);
    else if (group.issues.length > LIMITS.children) errors.push(`${where}: GitHub allows at most ${LIMITS.children} sub-issues`);
    else for (const number of group.issues) claim(number, where);
  }
  if (config.standalone !== undefined && !Array.isArray(config.standalone)) errors.push(`"standalone" must be an array`);
  else for (const number of config.standalone ?? []) claim(number, "standalone");
  for (const [number, where] of parents) if (owner.has(number)) errors.push(`${where}: parent #${number} is also listed in ${owner.get(number)}`);
  if (errors.length > 0) throw new Error(`${CONFIG_PATH} is invalid:\n  ${errors.join("\n  ")}`);
  return config;
}

/**
 * The file in its one canonical layout, so `--apply` can record parent numbers without reflowing
 * anything a person wrote. A test pins the shipped file to this layout.
 */
export function formatConfig(config) {
  const field = (name, value) => `      ${JSON.stringify(name)}: ${JSON.stringify(value)}`;
  const numbers = (list) => `[${list.join(", ")}]`;
  const groups = config.groups.map((group) => {
    const lines = [field("key", group.key), field("title", group.title)];
    if (group.summary !== undefined) lines.push(field("summary", group.summary));
    if (group.parent !== undefined) lines.push(field("parent", group.parent));
    lines.push(`      "issues": ${numbers(group.issues)}`);
    return `    {\n${lines.join(",\n")}\n    }`;
  });
  const top = [];
  if (config.$comment !== undefined) top.push(`  "$comment": ${JSON.stringify(config.$comment)}`);
  top.push(`  "groups": [\n${groups.join(",\n")}\n  ]`);
  if (config.standalone !== undefined) top.push(`  "standalone": ${numbers(config.standalone)}`);
  return `{\n${top.join(",\n")}\n}\n`;
}

/** The file with `parent` recorded for each key in `numbers`; everything else as it was. */
export const recordParents = (config, numbers) => ({
  ...config,
  groups: config.groups.map((group) => (numbers.has(group.key) ? { ...group, parent: numbers.get(group.key) } : group)),
});

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

// --- The plan -----------------------------------------------------------------------------------

/**
 * What to change so GitHub matches the file. Throws, naming every problem, when the file cannot be
 * applied as written; nothing is planned past a problem, so a dry run never shows a plan GitHub
 * would refuse.
 *
 * `snapshot` is `{ repo, issues }`. Each issue is `{ id, number, repo, title, body, state, labels,
 * parentId, parentRef, parentHidden, childCount, height }`: `labels` are names, `parentId` is a node
 * id or null and `parentRef` how people write that parent,
 * `parentHidden` means its parent exists but this account cannot see it, `childCount` is GitHub's own
 * count of its sub-issues where read (hidden ones included), and `height` is how many levels of
 * sub-issues sit below it as far as was read. The snapshot holds every open issue here, every
 * issue that looks like a parent, every issue the file names, every sub-issue of those parents, and
 * the ancestors of those parents.
 */
export function planGroups(config, snapshot, target) {
  const { repo } = snapshot;
  const local = (issue) => issue.repo.toLowerCase() === repo.toLowerCase();
  const byId = new Map(snapshot.issues.map((issue) => [issue.id, issue]));
  const byNumber = new Map(snapshot.issues.filter(local).map((issue) => [issue.number, issue]));
  const looksLikeParent = (issue) => local(issue) && hasLabel(issue) && keyFromMarker(issue.body) !== null;
  const memberOf = new Map();
  for (const group of config.groups) for (const number of group.issues) memberOf.set(number, group.key);

  const problems = [];
  const notes = [];

  // 1. Each group's parent: recorded, adopted, or to be created.
  const recordedIds = new Set();
  for (const group of config.groups) {
    if (group.parent === undefined) continue;
    const issue = byNumber.get(group.parent);
    if (!issue) problems.push(`${group.key}: recorded parent #${group.parent} is not an issue here (deleted, transferred or a pull request); remove its "parent" to make a new one`);
    else if (memberOf.has(group.parent)) problems.push(`${group.key}: recorded parent #${group.parent} is also listed in ${memberOf.get(group.parent)}`);
    else recordedIds.add(issue.id);
  }
  const claimants = new Map(); // key -> labelled issues whose marker names it, not recorded elsewhere
  for (const issue of snapshot.issues) {
    if (!looksLikeParent(issue) || recordedIds.has(issue.id)) continue;
    const key = keyFromMarker(issue.body);
    claimants.set(key, [...(claimants.get(key) ?? []), issue]);
  }
  const parentOf = new Map(); // key -> { issue, adopted } ; issue null means create
  for (const group of config.groups) {
    if (group.parent !== undefined) {
      const issue = byNumber.get(group.parent);
      if (issue) parentOf.set(group.key, { issue, adopted: false });
      continue;
    }
    const found = (claimants.get(group.key) ?? []).sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || a.number - b.number);
    const open = found.filter((issue) => !isClosed(issue));
    if (open.length > 1) {
      problems.push(`${group.key}: ${open.map((issue) => `#${issue.number}`).join(" and ")} all claim this group; record the canonical one as its "parent"`);
      continue;
    }
    parentOf.set(group.key, { issue: found[0] ?? null, adopted: Boolean(found[0]) });
  }
  const resolvedIds = new Set([...parentOf.values()].filter((p) => p.issue).map((p) => p.issue.id));
  // Every other issue that looks like a parent is retired: it lets go of its sub-issues and closes.
  const retired = snapshot.issues.filter((issue) => looksLikeParent(issue) && !resolvedIds.has(issue.id));
  const managed = new Set([...resolvedIds, ...retired.map((issue) => issue.id)]);

  // 2. Members must be issues here, and none may be a parent this script manages.
  for (const [number, key] of memberOf) {
    const issue = byNumber.get(number);
    if (!issue) problems.push(`#${number} (in ${key}) is not an issue in this repository`);
    else if (managed.has(issue.id)) problems.push(`#${number} (in ${key}) is itself a group parent`);
  }
  if (config.groups.length === 0 && retired.some((issue) => !isClosed(issue))) {
    // An emptied file is likelier to be a bad edit than a decision to ungroup everything.
    problems.push(`${CONFIG_PATH} has no groups but group parents are open; close them by hand if that is meant`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));

  // 3. Parent issues: create, label, reopen, re-render; retire the rest.
  const parentActions = [];
  const record = new Map(); // key -> number to write into the file
  const node = (key) => parentOf.get(key)?.issue?.id ?? `new:${key}`;
  for (const group of config.groups) {
    const rendered = renderParent(group, target);
    const { issue, adopted } = parentOf.get(group.key);
    if (!issue) {
      parentActions.push({ type: "create", key: group.key, ...rendered });
      continue;
    }
    if (adopted) record.set(group.key, issue.number);
    if (!hasLabel(issue)) parentActions.push({ type: "label", key: group.key, number: issue.number });
    if (isClosed(issue)) parentActions.push({ type: "reopen", key: group.key, number: issue.number });
    if (normalise(issue.title) !== rendered.title || normalise(issue.body) !== normalise(rendered.body)) {
      parentActions.push({ type: "update", key: group.key, number: issue.number, ...rendered });
    }
  }
  const closes = retired
    .filter((issue) => !isClosed(issue))
    .sort((a, b) => a.number - b.number)
    .map((issue) => ({ type: "close", key: keyFromMarker(issue.body), number: issue.number }));

  // 4. Links: the difference between the links wanted and the links on managed parents.
  const wanted = new Map(); // child id -> parent node (real id or new:key)
  for (const [number, key] of memberOf) wanted.set(byNumber.get(number).id, node(key));
  const unlinks = [];
  const links = [];
  for (const issue of snapshot.issues) {
    if (issue.parentId && managed.has(issue.parentId) && !wanted.has(issue.id)) {
      unlinks.push({ type: "unlink", parentId: issue.parentId, parent: byId.get(issue.parentId).number, childId: issue.id, child: refOf(issue, repo) });
    }
  }
  for (const [number, key] of memberOf) {
    const issue = byNumber.get(number);
    const target = node(key);
    if (isClosed(issue)) notes.push(`#${number} (in ${key}) is closed. If its ledger entry was renamed, put the new issue in its place.`);
    if (issue.parentId === target) continue;
    if (issue.parentHidden) {
      notes.push(`#${number} (in ${key}) is under an issue this account cannot see; left alone. Someone with access must unlink it.`);
      continue;
    }
    const from = issue.parentId ? parentRefOf(issue, byId, repo) : null;
    if (issue.parentId && !managed.has(issue.parentId)) {
      notes.push(`#${number} is under ${from}, which this script does not manage; linking it to ${key} drops that link.`);
    }
    links.push({ type: "link", key, parentId: target, childId: issue.id, child: number, from });
  }

  // 5. Simulate the links against GitHub's rules, in an order that keeps every step legal.
  const { ordered: orderedLinks, skipped } = orderLinks({ byId, unlinks, links, hiddenChildren: hiddenChildrenOf(snapshot) });
  for (const { action, reason } of skipped) notes.push(`#${action.child} (in ${action.key}) is left where it is: ${reason}. Someone who can see it must sort it out.`);

  for (const number of config.standalone ?? []) {
    const issue = byNumber.get(number);
    if (!issue || isClosed(issue) || managed.has(issue.id)) {
      notes.push(`standalone #${number} is not an open issue here (closed, a pull request, a parent or unused); drop it from the file.`);
    }
  }
  const listed = new Set([...memberOf.keys(), ...(config.standalone ?? [])]);
  const released = new Set(unlinks.map((action) => action.childId));
  const ungrouped = snapshot.issues
    .filter((issue) => local(issue) && !isClosed(issue) && !listed.has(issue.number) && !managed.has(issue.id))
    .sort((a, b) => a.number - b.number)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      parent: issue.parentHidden || (issue.parentId && !released.has(issue.id)) ? parentRefOf(issue, byId, repo) : null,
    }));

  const order = ["create", "label", "reopen", "update"];
  parentActions.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return { actions: [...parentActions, ...orderedLinks, ...closes], notes, ungrouped, record };
}

/**
 * The issues `--suggest` learns from: every issue here except group parents, recorded or labelled,
 * since a parent repeats its summary and would shift every weight once the grouping is applied.
 */
export function suggestionCorpus(config, snapshot, plan) {
  const local = (issue) => issue.repo.toLowerCase() === snapshot.repo.toLowerCase();
  const parents = new Set([...config.groups.map((group) => group.parent), ...plan.record.values()]);
  return snapshot.issues.filter((issue) => local(issue) && !parents.has(issue.number) && !(hasLabel(issue) && keyFromMarker(issue.body) !== null));
}

/** Sub-issues GitHub counts on a parent but this account cannot see. */
function hiddenChildrenOf(snapshot) {
  const visible = new Map();
  for (const issue of snapshot.issues) if (issue.parentId) visible.set(issue.parentId, (visible.get(issue.parentId) ?? 0) + 1);
  const hidden = new Map();
  for (const issue of snapshot.issues) {
    if (issue.childCount !== undefined) hidden.set(issue.id, Math.max(0, issue.childCount - (visible.get(issue.id) ?? 0)));
  }
  return hidden;
}

/**
 * Orders the links so each is legal when it runs: the parent has a free slot, the link makes no
 * loop, and nesting stays within GitHub's depth. The simulation moves links, counts and heights as
 * it goes, so every check sees the tree as it will be at that step. Unlinks run first and free
 * slots, and each link frees one in the parent it leaves. When only a full parent blocks progress
 * and another link is due to take one of its issues elsewhere, that issue is unlinked first to make
 * room.
 *
 * Two outcomes for a link no order makes legal. If a rule is broken whatever is unknown, it is a
 * problem, reported before anything is written. If the depth cannot be known, because an issue this
 * account cannot see sits above the parent or below the issue, the link is skipped with a note:
 * nothing can prove it legal, and GitHub might refuse it.
 *
 * Returns `{ ordered, skipped }`.
 */
function orderLinks({ byId, unlinks, links, hiddenChildren }) {
  const parent = new Map([...byId.values()].map((issue) => [issue.id, issue.parentId ?? null]));
  const kids = new Map();
  const count = new Map();
  const current = (id) => count.get(id) ?? hiddenChildren.get(id) ?? 0;
  const move = (child, to) => {
    const from = parent.get(child);
    if (from) {
      kids.get(from)?.delete(child);
      count.set(from, current(from) - 1);
    }
    parent.set(child, to);
    if (to) {
      if (!kids.has(to)) kids.set(to, new Set());
      kids.get(to).add(child);
      count.set(to, current(to) + 1);
    }
  };
  for (const [child, of] of [...parent]) {
    parent.set(child, null);
    if (of) move(child, of);
  }
  const ordered = [...unlinks];
  for (const action of unlinks) move(action.childId, null);

  const ancestors = (id) => {
    const seen = [];
    for (let at = parent.get(id); at && !seen.includes(at); at = parent.get(at)) seen.push(at);
    return seen;
  };
  // The reader follows sub-issues all the way down, so a sub-issue GitHub counts but the snapshot
  // lacks is one this account cannot see: below it, the height is unknown.
  const height = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    if ((hiddenChildren.get(id) ?? 0) > 0) return Infinity;
    let levels = 0;
    for (const child of kids.get(id) ?? []) levels = Math.max(levels, 1 + height(child, seen));
    return levels;
  };
  // Likewise above: a chain that reaches an issue this account cannot see, or one not read.
  const chainKnown = (id) => {
    for (const at of [id, ...ancestors(id)]) {
      if (at.startsWith("new:")) return true; // a parent this run creates is top-level
      const issue = byId.get(at);
      if (!issue || issue.parentHidden) return false;
    }
    return true;
  };
  const full = (action) => current(action.parentId) >= LIMITS.children;
  const loops = (action) => action.parentId === action.childId || ancestors(action.parentId).includes(action.childId);
  const unknowable = (action) => !chainKnown(action.parentId) || height(action.childId) === Infinity;
  const why = (action) => {
    if (full(action)) return `its parent already has ${LIMITS.children} sub-issues`;
    if (loops(action)) return "it would make a loop";
    if (!chainKnown(action.parentId)) return "its parent sits below an issue this account cannot see, so the depth cannot be checked";
    if (height(action.childId) === Infinity) return "it has sub-issues this account cannot see, so the depth cannot be checked";
    if (ancestors(action.parentId).length + 2 + height(action.childId) > LIMITS.depth + 1) return `it would nest deeper than ${LIMITS.depth} levels`;
    return null;
  };

  const skipped = [];
  const pending = [...links];
  while (pending.length > 0) {
    const index = pending.findIndex((action) => why(action) === null);
    if (index !== -1) {
      const [action] = pending.splice(index, 1);
      move(action.childId, action.parentId);
      ordered.push(action);
      continue;
    }
    // Stuck on a full parent: unlink an issue another link will take out of it anyway.
    const blocked = pending.find(full);
    const leaving = blocked && pending.find((action) => parent.get(action.childId) === blocked.parentId);
    if (leaving) {
      ordered.push({ type: "unlink", parentId: blocked.parentId, parent: byId.get(blocked.parentId)?.number, childId: leaving.childId, child: `#${leaving.child}` });
      move(leaving.childId, null);
      leaving.from = null;
      continue;
    }
    // Stuck on what cannot be seen: set those aside, and see whether the rest can go.
    const unknown = pending.filter((action) => !full(action) && !loops(action) && unknowable(action));
    if (unknown.length > 0) {
      for (const action of unknown) {
        skipped.push({ action, reason: why(action) });
        pending.splice(pending.indexOf(action), 1);
      }
      continue;
    }
    throw new Error(pending.map((action) => `#${action.child} cannot be linked to ${action.key}: ${why(action)}`).join("\n"));
  }
  return { ordered, skipped };
}

// --- Applying -----------------------------------------------------------------------------------

/**
 * Runs a plan through a GitHub port, stopping at the first refusal. Every rule a single action could
 * break was checked by `planGroups`, so a refusal here is run-wide (access, network, rate limit) and
 * pressing on would only repeat it. Returns the parents it created, by key.
 *
 * The port is `{ createIssue, addLabel, setState, updateIssue, link, unlink }`; see `githubPort` in
 * the CLI for the real one and the fake in the tests.
 */
export function applyPlan(plan, port, log = () => {}) {
  const created = new Map();
  const idOf = (parentId) => (parentId.startsWith("new:") ? created.get(parentId.slice(4))?.id : parentId);
  for (const [index, action] of plan.actions.entries()) {
    try {
      if (action.type === "create") {
        const issue = port.createIssue({ title: action.title, body: action.body, labels: [LABEL] });
        created.set(action.key, issue);
        log(`  created #${issue.number} for ${action.key}`);
        // GitHub drops a new issue's labels silently for a caller without push access.
        if (!issue.labels.some((name) => name.toLowerCase() === LABEL) && !port.addLabel(issue.number).some((name) => name.toLowerCase() === LABEL)) {
          throw new Error("GitHub kept no label on the new issue");
        }
      } else if (action.type === "label") {
        port.addLabel(action.number);
        log(`  labelled #${action.number}`);
      } else if (action.type === "reopen" || action.type === "close") {
        port.setState(action.number, action.type === "close" ? "closed" : "open");
        log(`  ${action.type === "close" ? "closed" : "reopened"} #${action.number}`);
      } else if (action.type === "update") {
        port.updateIssue(action.number, { title: action.title, body: action.body });
        log(`  updated #${action.number}`);
      } else if (action.type === "unlink") {
        port.unlink(action.parentId, action.childId);
        log(`  removed ${action.child} from #${action.parent}`);
      } else if (action.type === "link") {
        port.link(idOf(action.parentId), action.childId);
        log(`  ${action.from ? `moved #${action.child} from ${action.from} to` : `added #${action.child} to`} ${action.key}`);
      }
    } catch (error) {
      const made = action.type === "create" ? created.get(action.key) : null;
      const left = made ? ` #${made.number} was created without the ${LABEL} label: label or close it by hand before re-running.` : "";
      const why = String(error?.message ?? error).split("\n").filter(Boolean).pop();
      const failure = new Error(`${action.type} for ${action.key ?? action.child} was refused after ${index} of ${plan.actions.length} actions applied: ${why}${left}`);
      failure.created = created;
      throw failure;
    }
  }
  return created;
}

export function formatAction(action) {
  switch (action.type) {
    case "create":
      return `  create  parent for ${action.key}: "${action.title}"`;
    case "label":
    case "reopen":
    case "update":
    case "close":
      return `  ${action.type.padEnd(7)} #${action.number} (${action.key})`;
    case "unlink":
      return `  remove  ${action.child} from #${action.parent}`;
    case "link":
      return `  ${action.from ? "move   " : "add    "} #${action.child}${action.from ? ` from ${action.from}` : ""} to ${action.key}`;
    default:
      return `  ${action.type}`;
  }
}
