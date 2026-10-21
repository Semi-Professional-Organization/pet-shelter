/**
 * GitHub for `scripts/issue-groups.mjs`: one reader that builds the snapshot `planGroups` compares,
 * and one port that makes the writes `applyPlan` asks for. Both take their transport as arguments
 * (`graphql(query, variables)` returning `{ data, errors }`, and `rest(method, path, body)`), so the
 * tests can drive them with recorded answers and the CLI with `gh`.
 */

import { LABEL, LIMITS, keyFromMarker } from "./plan.mjs";

// No labels below the top level of a nested read: GitHub caps one query at 500,000 nodes, and page
// sizes multiply (100 parents x 100 children x 50 labels broke it once). A child's labels decide
// nothing; any issue that looks like a parent is read again, labels and all, by the label query.
const FIELDS = `id number title body state repository { nameWithOwner } labels(first: 20) { nodes { name } }
  parent { id number repository { nameWithOwner } } subIssuesSummary { total }`;
const CHILD_FIELDS = "id number title body state repository { nameWithOwner } subIssuesSummary { total }";
const WITH_CHILDREN = `${FIELDS} subIssues(first: ${LIMITS.children}) { totalCount nodes { ${CHILD_FIELDS} } }`;

const OPEN_QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, states: [OPEN]) { nodes { ${FIELDS} } pageInfo { hasNextPage endCursor } }
  }
}`;

// `repository.issues`, not search: the search index lags writes. The label filter ignores case, as
// GitHub's labels do, so a parent relabelled `Group` is still found.
const PARENTS_QUERY = `query($owner: String!, $name: String!, $label: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after, filterBy: { labels: [$label] }, states: [OPEN, CLOSED]) {
      nodes { ${WITH_CHILDREN} } pageInfo { hasNextPage endCursor }
    }
  }
}`;

const byNumbersQuery = (numbers) => `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { ${numbers.map((n) => `i${n}: issue(number: ${n}) { ${WITH_CHILDREN} }`).join(" ")} }
}`;

const NODES_QUERY = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Issue { ${FIELDS} } } }`;

const LINK = `mutation($issueId: ID!, $subIssueId: ID!) {
  addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId, replaceParent: true }) { issue { number } }
}`;
const UNLINK = `mutation($issueId: ID!, $subIssueId: ID!) {
  removeSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { issue { number } }
}`;

const ref = (repo, { number, repository }) =>
  repository.nameWithOwner.toLowerCase() === repo.toLowerCase() ? `#${number}` : `${repository.nameWithOwner}#${number}`;

/**
 * Errors GitHub returns alongside data for something this account cannot see, or a number that is
 * no issue. Each is scoped to a path; anything else stops the read.
 */
function partial({ data, errors = [] }, { allowMissingAlias = false } = {}) {
  const hidden = [];
  for (const error of errors) {
    const path = error.path ?? [];
    const last = path[path.length - 1];
    const seeable = error.type === "NOT_FOUND" || error.type === "FORBIDDEN";
    if (seeable && last === "parent") hidden.push(path.slice(0, -1));
    else if (seeable && path.includes("subIssues")) continue; // a child we cannot see; counts still hold it
    else if (allowMissingAlias && error.type === "NOT_FOUND" && path.length === 2) continue; // a pull request or unused number
    else throw new Error(`GitHub: ${error.message}`);
  }
  const at = (path) => path.reduce((value, key) => value?.[key], data);
  return { data, hiddenParents: hidden.map(at).filter(Boolean) };
}

/** Reads everything `planGroups` needs, as one snapshot. `numbers` are issues the file names. */
export function readSnapshot(graphql, { repo, numbers }) {
  const [owner, name] = repo.split("/");
  const issues = new Map();
  const hiddenParent = new Set();
  const add = (node, parentId) => {
    if (!node) return;
    const known = issues.get(node.id);
    const next = {
      id: node.id,
      number: node.number,
      repo: node.repository.nameWithOwner,
      title: node.title ?? "",
      body: node.body ?? "",
      state: node.state,
      labels: node.labels ? node.labels.nodes.map((label) => label.name) : known?.labels ?? [],
      // A child read under its parent is under that parent, whatever else the node carries.
      parentId: parentId ?? (node.parent !== undefined ? node.parent?.id ?? null : known?.parentId ?? null),
      parentRef: !parentId && node.parent ? ref(repo, node.parent) : known?.parentRef ?? null,
      parentHidden: hiddenParent.has(node.id) || known?.parentHidden || false,
      childCount: node.subIssues?.totalCount ?? known?.childCount ?? node.subIssuesSummary?.total ?? 0,
      height: Math.max(known?.height ?? 0, node.subIssuesSummary?.total > 0 ? 1 : 0),
    };
    issues.set(node.id, next);
    for (const child of node.subIssues?.nodes ?? []) {
      if (!child) continue;
      add(child, node.id);
      next.height = Math.max(next.height, 1 + (issues.get(child.id).height ?? 0));
    }
  };
  const markHidden = (nodes) => {
    for (const node of nodes) {
      hiddenParent.add(node.id);
      if (issues.has(node.id)) issues.get(node.id).parentHidden = true;
    }
  };
  const pages = (query, variables, path) => {
    for (let after = null; ; ) {
      const result = partial(graphql(query, { ...variables, after }));
      markHidden(result.hiddenParents);
      const connection = path(result.data);
      for (const node of connection.nodes) {
        if (!node) continue;
        if (node.subIssues && node.subIssues.totalCount > LIMITS.children) {
          throw new Error(`#${node.number} has ${node.subIssues.totalCount} sub-issues; GitHub allows ${LIMITS.children}`);
        }
        add(node);
      }
      if (!connection.pageInfo.hasNextPage) return;
      after = connection.pageInfo.endCursor;
    }
  };

  pages(OPEN_QUERY, { owner, name }, (data) => data.repository.issues);
  pages(PARENTS_QUERY, { owner, name, label: LABEL }, (data) => data.repository.issues);

  // Closed issues the file names, and recorded parents, are in neither read. A pull request or an
  // unused number comes back NOT_FOUND and stays missing, which `planGroups` reports.
  const local = (issue) => issue.repo.toLowerCase() === repo.toLowerCase();
  const seen = new Set([...issues.values()].filter(local).map((issue) => issue.number));
  const missing = [...new Set(numbers)].filter((n) => !seen.has(n));
  for (let i = 0; i < missing.length; i += 25) {
    const result = partial(graphql(byNumbersQuery(missing.slice(i, i + 25)), { owner, name }), { allowMissingAlias: true });
    markHidden(result.hiddenParents);
    for (const node of Object.values(result.data.repository ?? {})) add(node);
  }

  // Ancestors of every possible parent, so loops and depth are checked on the whole chain.
  const labelled = (issue) => issue.labels.some((label) => label.toLowerCase() === LABEL);
  const isParentish = (issue) => local(issue) && ((labelled(issue) && keyFromMarker(issue.body)) || numbers.includes(issue.number));
  for (let level = 0; level < LIMITS.depth; level += 1) {
    const wanted = [...new Set([...issues.values()].filter(isParentish).flatMap(function chain(issue) {
      return issue.parentId && !issues.has(issue.parentId) ? [issue.parentId] : issue.parentId ? chain(issues.get(issue.parentId)) : [];
    }))];
    if (wanted.length === 0) break;
    const result = partial(graphql(NODES_QUERY, { ids: wanted }));
    markHidden(result.hiddenParents);
    for (const node of result.data.nodes ?? []) add(node);
  }
  return { repo, issues: [...issues.values()] };
}

/** The writes `applyPlan` makes. Labels come back as names. */
export function githubPort({ repo, rest, graphql }) {
  const names = (labels) => (labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
  const mutate = (query, issueId, subIssueId) => partial(graphql(query, { issueId, subIssueId }));
  return {
    createIssue: ({ title, body, labels }) => {
      const issue = rest("POST", `repos/${repo}/issues`, { title, body, labels });
      return { id: issue.node_id, number: issue.number, labels: names(issue.labels) };
    },
    addLabel: (number) => names(rest("POST", `repos/${repo}/issues/${number}/labels`, { labels: [LABEL] })),
    setState: (number, state) => rest("PATCH", `repos/${repo}/issues/${number}`, { state }),
    updateIssue: (number, fields) => rest("PATCH", `repos/${repo}/issues/${number}`, fields),
    link: (parentId, childId) => mutate(LINK, parentId, childId),
    unlink: (parentId, childId) => mutate(UNLINK, parentId, childId),
  };
}
