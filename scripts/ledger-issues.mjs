#!/usr/bin/env node
/**
 * Mirror `tasks/open/` into GitHub issues, one issue per entry.
 *
 * One-way. The file is the source of truth and the issue is a rendered copy: an issue edited on
 * GitHub is overwritten on the next run, an issue whose entry left `tasks/open/` is closed, and a
 * closed issue whose entry is still open is reopened. Comments are never touched, so discussion
 * belongs there — and a conclusion reached in a comment settles nothing until it reaches the file.
 * Rationale: `tasks/decisions/2026-09-18-ledger-issues-are-a-one-way-mirror.md`.
 *
 * Usage:
 *   node scripts/ledger-issues.mjs                    # dry run: print the plan, publish nothing
 *   node scripts/ledger-issues.mjs --apply            # publish the plan
 *   node scripts/ledger-issues.mjs --branch <name>    # mirror a branch other than the default
 *
 * Entries are read from `origin/<branch>` after a fetch, never from the working tree. Run from a
 * feature branch, a working-tree read would publish unmerged entries and close the issues of
 * entries that branch has not merged yet.
 *
 * Dependency-free on purpose, like `commit-msg.mjs`: it needs `git` and an authenticated `gh`,
 * nothing from `node_modules`.
 */

import { execFileSync } from "node:child_process";

export const LEDGER_DIR = "tasks/open/";
export const LABEL = "ledger";

// Anchored to the top of the body, where `renderIssue` puts it, so an issue that merely quotes the
// marker (a bug report about this script, say) is not mistaken for a mirror and closed.
const MARKER = /^\s*<!--\s*ledger-mirror:\s*(\S+)\s*-->/;

/** Top-level markdown entries only. `CLAIM-*` files are session locks, not threads. */
export function isMirroredPath(path) {
  if (!path.startsWith(LEDGER_DIR) || !path.endsWith(".md")) return false;
  const name = path.slice(LEDGER_DIR.length);
  return !name.includes("/") && !name.startsWith("CLAIM-");
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

/**
 * The path is percent-encoded, so the marker is printable ASCII whatever the file is called. Raw, a
 * name could end the comment (`-->`), stop the regex (any line break, U+2028 included), or carry a
 * character GitHub rewrites on the way in — and a marker that does not read back as its own path
 * gains a fresh issue on every run. Plain names encode to themselves.
 */
export function markerFor(path) {
  return `<!-- ledger-mirror: ${encodePath(path)} -->`;
}

export function pathFromMarker(body) {
  const match = MARKER.exec(String(body ?? ""));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null; // malformed escapes: not a marker this script wrote
  }
}

const normalise = (text) => String(text ?? "").replace(/\r\n/g, "\n").trim();

// GitHub refuses a title over 256 characters and a body over 65,536, and one refused action stops
// the run (see `applyActions`). So the entry-shaped refusals are prevented here, where a test holds
// them. ceiling: counted in code points, on the belief — not verified — that GitHub counts
// characters. If it counts UTF-16 units or bytes, the title margin is only 16, and a title of many
// emoji or ~90 CJK characters would be refused first; lower MAX_TITLE if that is ever seen.
const MAX_TITLE = 240;
const MAX_BODY = 60_000;

/**
 * A title is one line of printable text. Control characters become spaces — a NUL in particular,
 * because the title travels as a command-line argument and Node refuses one there — and whitespace
 * runs collapse, since a title GitHub would store differently would never compare equal.
 */
const oneLine = (text) =>
  [...text]
    .map((char) => (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

/** Cut by code point, so a clip never splits a surrogate pair GitHub would then rewrite. */
const clip = (text, max, tail) => {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - [...tail].length).join("") + tail;
};

/** Title is the first H1; the body is the file without that one line. */
export function parseEntry(path, text) {
  const lines = normalise(text).split("\n");
  const h1 = lines.findIndex((line) => /^#\s+\S/.test(line));
  const heading = h1 === -1 ? "" : oneLine(lines[h1].replace(/^#\s+/, ""));
  const slug = oneLine(path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, ""));
  // Each can clean down to nothing; GitHub refuses a blank title, and the path never is one.
  const title = clip(heading || slug || oneLine(path), MAX_TITLE, "…");
  const body = (h1 === -1 ? lines : [...lines.slice(0, h1), ...lines.slice(h1 + 1)]).join("\n").trim();
  return { path, title, body };
}

export function renderIssue(entry, { repo, branch }) {
  const url = `https://github.com/${repo}/blob/${branch}/${encodePath(entry.path)}`;
  const header =
    `> Mirrored from [\`${entry.path}\`](${url}) by \`scripts/ledger-issues.mjs\`. ` +
    "The file is the source of truth: edits to this description are overwritten on the next " +
    "sync. Discuss in comments; settle it by changing the file.";
  const tail = "\n\n> Truncated here: the full entry is in the file linked above.";
  return {
    path: entry.path,
    title: entry.title,
    body: clip(`${markerFor(entry.path)}\n${header}\n\n${entry.body}`, MAX_BODY, tail),
  };
}

/**
 * The actions that make GitHub match the ledger. Pure, so the whole policy is testable without
 * publishing anything. An issue is a mirror only if it carries both the marker and the label: the
 * repository is public, anyone can open an issue whose body starts with a copied marker, and only
 * someone with triage rights can label one. Everything else is never touched.
 */
export function planSync(rendered, issues) {
  const isLabelled = (issue) => (issue.labels ?? []).some((label) => label.name === LABEL);
  // Open before closed, then oldest first. So a closed duplicate never displaces an open issue, and
  // closing the wrong one of two open duplicates is enough to unblock the sync.
  const isClosed = (issue) => issue.state === "CLOSED";
  const ordered = [...issues].sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || a.number - b.number);
  const byPath = new Map();
  for (const issue of ordered) {
    const path = pathFromMarker(issue.body);
    if (!path || !isLabelled(issue)) continue;
    const held = byPath.get(path);
    if (!held) {
      byPath.set(path, issue);
      continue;
    }
    if (!isClosed(issue)) {
      // Two open issues: picking one would silently orphan the other, and which is canonical is a
      // human call.
      throw new Error(
        `issues #${held.number} and #${issue.number} are both open and both mirror ${path}; ` +
          "close the one that is not canonical",
      );
    }
  }

  const actions = [];
  const wanted = [...rendered].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of wanted) {
    const issue = byPath.get(entry.path);
    if (!issue) {
      actions.push({ type: "create", ...entry });
      continue;
    }
    if (isClosed(issue)) actions.push({ type: "reopen", number: issue.number, path: entry.path });
    if (normalise(issue.title) !== entry.title || normalise(issue.body) !== normalise(entry.body)) {
      actions.push({ type: "update", number: issue.number, ...entry });
    }
  }

  const live = new Set(wanted.map((entry) => entry.path));
  const orphans = [...byPath].filter(([path, issue]) => !live.has(path) && !isClosed(issue));
  if (wanted.length === 0 && orphans.length > 0) {
    // A ledger that empties in one step is far less likely than a read that found nothing: a wrong
    // directory, a bad ref, a renamed folder. Closing every issue on that evidence is the one
    // outcome worth refusing outright.
    throw new Error(
      `read no entries from ${LEDGER_DIR} but ${orphans.length} mirrored issues are open; ` +
        "refusing to close them all. Check the read, or close them by hand if the ledger really is empty",
    );
  }
  for (const [path, issue] of orphans.sort(([a], [b]) => a.localeCompare(b))) {
    actions.push({ type: "close", number: issue.number, path });
  }
  return actions;
}

/**
 * `repository.issues`, not `gh issue list --label`: with a label filter gh switches to the search
 * index, which lags writes, so a run queued right behind another would not see the issue it had just
 * created and would create it again. This connection reads current data and pages without a cap.
 */
const ISSUES_QUERY = `query($owner: String!, $name: String!, $label: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $endCursor, filterBy: {labels: [$label]}, states: [OPEN, CLOSED]) {
      nodes { number title body state labels(first: 100) { nodes { name } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/** `gh api graphql --paginate --slurp` pages → the flat shape `planSync` reads. */
export function issuesFromPages(pages) {
  return pages
    .flatMap((page) => page.data.repository.issues.nodes)
    .map(({ number, title, body, state, labels }) => ({
      number,
      title,
      body,
      state,
      labels: labels.nodes.map(({ name }) => ({ name })),
    }));
}

/**
 * Runs a plan through `exec` (the `gh` CLI in production), stopping at the first refusal. Stop, not
 * skip: closes sort last, so pressing on after a failed create would retire a renamed entry's only
 * issue, and a run-wide failure — auth, network, a rate limit — only worsens by retrying. What an
 * entry alone could get refused for (a blank or over-long title, an oversized body) is prevented in
 * `parseEntry` and `renderIssue` instead, so one entry cannot wedge every run.
 */
export function applyActions(actions, { repo, sha, exec, log }) {
  for (const [index, action] of actions.entries()) {
    try {
      if (action.type === "create") {
        const url = exec("gh", ["issue", "create", "--repo", repo, "--title", action.title, "--label", LABEL, "--body-file", "-"], action.body);
        log(`  created ${url}`);
      } else if (action.type === "update") {
        exec("gh", ["issue", "edit", String(action.number), "--repo", repo, "--title", action.title, "--body-file", "-"], action.body);
        log(`  updated #${action.number}`);
      } else if (action.type === "reopen") {
        exec("gh", ["issue", "reopen", String(action.number), "--repo", repo]);
        log(`  reopened #${action.number}`);
      } else if (action.type === "close") {
        const comment =
          `\`${action.path}\` left \`tasks/open/\` as of ${sha.slice(0, 7)}. ` +
          "An entry closes by moving to `tasks/decisions/` or by being deleted; " +
          `\`git log --diff-filter=D -- ${action.path}\` shows which commit settled it.`;
        exec("gh", ["issue", "close", String(action.number), "--repo", repo, "--comment", comment]);
        log(`  closed #${action.number}`);
      }
    } catch (error) {
      // execFileSync's first line is the command echoed back; gh's reason is on the lines after it.
      const [command, ...reason] = String(error?.message ?? error).split("\n");
      const why = reason.map((line) => line.trim()).filter(Boolean).join(" ") || command;
      throw new Error(
        `${action.type} ${action.path} was refused after ${index} of ${actions.length} actions applied: ${why}`,
      );
    }
  }
}

function formatAction(action) {
  const target = action.number ? `#${action.number}` : "new";
  return `  ${action.type.padEnd(6)} ${target.padEnd(6)} ${action.path}`;
}

const run = (command, args, input) =>
  execFileSync(command, args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();

const USAGE =
  "usage: node scripts/ledger-issues.mjs [--apply] [--branch <name>]\n" +
  "  Mirrors tasks/open/*.md on origin/<branch> into GitHub issues labelled `ledger`.\n" +
  "  Without --apply it prints the plan and publishes nothing.\n";

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  const unknown = argv.filter((arg, i) => !["--apply", "--branch"].includes(arg) && argv[i - 1] !== "--branch");
  if (unknown.length > 0) {
    process.stderr.write(`unknown argument: ${unknown.join(" ")}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const apply = argv.includes("--apply");

  const repoInfo = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]));
  const repo = repoInfo.nameWithOwner;
  const branchFlag = argv.indexOf("--branch");
  const branch = branchFlag === -1 ? repoInfo.defaultBranchRef.name : argv[branchFlag + 1];
  if (!branch) throw new Error("--branch needs a name");

  // A stale remote-tracking ref would close the issues of entries added upstream since the last fetch.
  // The explicit refspec is what updates it: a single-branch or shallow clone (`git clone --depth 1`)
  // configures no mapping for other branches, and a bare `git fetch origin <branch>` there moves only
  // FETCH_HEAD. No `--depth` here — on a full clone that would make the repository shallow.
  run("git", ["fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  const sha = run("git", ["rev-parse", `origin/${branch}`]);

  // --full-tree: without it the pathspec is relative to the caller's directory, and a run from
  // `tasks/` reads no entries at all.
  // -z: otherwise git quotes a non-ASCII name ("tasks/open/caf\303\251.md") and it fails the prefix test.
  const paths = run("git", ["ls-tree", "-z", "--full-tree", "--name-only", sha, "--", LEDGER_DIR])
    .split("\0")
    .filter((path) => path && isMirroredPath(path));
  const rendered = paths.map((path) => renderIssue(parseEntry(path, run("git", ["show", `${sha}:${path}`])), { repo, branch }));

  // Filtered by label on the server as well as in `planSync`, so spam on this public repository
  // cannot bury the mirrors, and paged to the end, so there is no page for them to fall off.
  const [owner, name] = repo.split("/");
  const issues = issuesFromPages(
    JSON.parse(
      run("gh", [
        "api", "graphql", "--paginate", "--slurp",
        "-f", `query=${ISSUES_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-f", `label=${LABEL}`,
      ]),
    ),
  );

  const actions = planSync(rendered, issues);
  process.stdout.write(
    `ledger-issues: ${rendered.length} entries on origin/${branch} (${sha.slice(0, 7)}), ` +
      `${issues.length} issues in ${repo}\n`,
  );
  if (actions.length === 0) {
    process.stdout.write("  in sync, nothing to do\n");
    return;
  }
  process.stdout.write(`${actions.map(formatAction).join("\n")}\n`);
  if (!apply) {
    process.stdout.write(`\nDry run: ${actions.length} actions, nothing published. Re-run with --apply to publish.\n`);
    return;
  }

  const labels = JSON.parse(run("gh", ["label", "list", "--repo", repo, "--limit", "1000", "--json", "name"]));
  if (!labels.some((label) => label.name === LABEL)) {
    run("gh", ["label", "create", LABEL, "--repo", repo, "--color", "5319e7", "--description", "Mirrored from tasks/open/"]);
  }

  applyActions(actions, { repo, sha, exec: run, log: (line) => process.stdout.write(`${line}\n`) });
}

// Only run the CLI when executed directly, so the module stays importable by tests.
const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/ledger-issues.mjs");
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`ledger-issues: ${error.message}\n`);
    process.exit(1);
  });
}
