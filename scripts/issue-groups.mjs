#!/usr/bin/env node
/**
 * Group issues under parent issues with GitHub's native sub-issues.
 *
 * `.github/issue-groups.json` is the source of truth. Each group becomes one parent issue labelled
 * `group`, and its issues become that parent's sub-issues. A run makes GitHub match the file: it
 * creates, repairs, reopens and closes parents, and adds, moves and removes sub-issue links.
 * Parents' descriptions are overwritten; comments are never touched.
 * Rationale: `tasks/decisions/2026-10-21-issue-groups-are-native-sub-issues.md`.
 *
 * Usage:
 *   node scripts/issue-groups.mjs                       # dry run of your working copy: change nothing
 *   node scripts/issue-groups.mjs --apply               # make GitHub match the file on origin/main
 *   node scripts/issue-groups.mjs --suggest             # propose a group for each ungrouped issue
 *   node scripts/issue-groups.mjs --suggest --evaluate  # measure those proposals on the file itself
 *
 * `--apply` reads the file from the default branch after a fetch, never the working copy, so a stale
 * or unmerged checkout cannot undo what master holds. It records each parent's number in the working
 * copy's file for you to commit; until then a parent is found by its label and marker. It finishes by
 * reading GitHub again and planning again: that plan must be empty, or it says what is left and fails.
 *
 * The pure planning is `scripts/lib/issueGroups/plan.mjs`, the reads and writes are
 * `scripts/lib/issueGroups/github.mjs`, and the suggestions `scripts/lib/issueGroups/suggest.mjs`.
 * Needs git and an authenticated `gh`, and nothing from `node_modules`, like `ledger-issues.mjs`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { invokedAs } from "./lib/invokedAs.mjs";
import {
  CONFIG_PATH,
  LABEL,
  applyPlan,
  formatAction,
  formatConfig,
  planGroups,
  recordParents,
  suggestionCorpus,
  validateConfig,
} from "./lib/issueGroups/plan.mjs";
import { githubPort, readSnapshot } from "./lib/issueGroups/github.mjs";
import { evaluate, suggest } from "./lib/issueGroups/suggest.mjs";

const RETRIES = 3;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Runs a command, piping stderr so a failure is reported once, in gh's own words. A rate-limit answer
 * is waited out and retried.
 * ceiling: gh hides the Retry-After header, so the wait is a fixed 60s, 120s, 180s.
 */
function run(command, args, input) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return execFileSync(command, args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
    } catch (error) {
      const said = String(error?.stderr ?? "").trim() || String(error?.message ?? error).split("\n").pop();
      if (/rate limit|abuse detection/i.test(said) && attempt <= RETRIES) {
        process.stderr.write(`issue-groups: GitHub asked to slow down; waiting ${60 * attempt}s\n`);
        sleep(60_000 * attempt);
        continue;
      }
      const failure = new Error(`${command} ${args.slice(0, 2).join(" ")} failed\n${said}`);
      failure.stdout = error?.stdout;
      throw failure;
    }
  }
}

/** GraphQL through gh. gh exits non-zero when any error comes back, even beside data; keep both. */
function graphql(query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) args.push("-f", `${key}[]=${item}`);
    else args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  try {
    return JSON.parse(run("gh", args));
  } catch (error) {
    const body = String(error.stdout ?? "").trim();
    if (body.startsWith("{")) return JSON.parse(body);
    throw error;
  }
}

const rest = (method, path, body) =>
  JSON.parse(run("gh", ["api", "-X", method, path, ...(body ? ["--input", "-"] : [])], body ? JSON.stringify(body) : undefined) || "null");

const USAGE =
  "usage: node scripts/issue-groups.mjs [--apply | --suggest [--evaluate]]\n" +
  `  Makes GitHub's parent issues and sub-issues match ${CONFIG_PATH}.\n` +
  "  Without --apply it prints the plan for your working copy and changes nothing.\n" +
  "  --apply uses the file on the default branch and fails unless GitHub then matches it.\n" +
  "  --suggest proposes a group for each ungrouped open issue; --evaluate measures those proposals.\n";

const write = (line = "") => process.stdout.write(`${line}\n`);
// The file is found from the repository root, so the script runs from any directory in it.
let workingPath = CONFIG_PATH;
const parse = (text, where) => validateConfig(JSON.parse(text), where);

/** Who may apply: write or more. Below it GitHub drops a new issue's labels and refuses new labels. */
export const canApply = (permission) => ["WRITE", "MAINTAIN", "ADMIN"].includes(permission);

function report(plan) {
  write(plan.actions.length === 0 ? "  in sync, nothing to do" : plan.actions.map(formatAction).join("\n"));
  for (const [key, number] of plan.record) write(`  note: #${number} is the parent of ${key}; --apply records it in ${CONFIG_PATH}.`);
  for (const note of plan.notes) write(`  note: ${note}`);
  if (plan.ungrouped.length > 0) {
    write(`\n${plan.ungrouped.length} open issues are in no group (try --suggest):`);
    for (const issue of plan.ungrouped) write(`  #${issue.number} ${issue.title}${issue.parent ? ` (sub-issue of ${issue.parent}, not in the file)` : ""}`);
  }
}

/**
 * Writes parent numbers into the working copy's file. The numbers are printed first, so a working
 * copy that cannot be read or written (mid-edit, invalid) costs the convenience and never the
 * numbers: without them the next run cannot repair a parent that lost its label.
 */
function recordInWorkingCopy(numbers) {
  if (numbers.size === 0) return;
  write(`\nParents: ${[...numbers].map(([key, n]) => `${key} #${n}`).join(", ")}.`);
  try {
    const config = parse(readFileSync(workingPath, "utf8"));
    const known = new Set(config.groups.map((group) => group.key));
    writeFileSync(workingPath, formatConfig(recordParents(config, numbers)));
    write(`Recorded them in ${CONFIG_PATH}. Commit it through a pull request.`);
    for (const [key, number] of numbers) if (!known.has(key)) write(`  ${key} is not in your working copy; record "parent": ${number} for it by hand.`);
  } catch (error) {
    write(`Could not record them in your working copy (${String(error.message).split("\n")[0]}); add each as "parent" by hand.`);
  }
}

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

  workingPath = `${run("git", ["rev-parse", "--show-toplevel"])}/${CONFIG_PATH}`;
  const repoInfo = JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]));
  const repo = repoInfo.nameWithOwner;
  const branch = repoInfo.defaultBranchRef.name;
  // A stale remote-tracking ref would apply an old file; the explicit refspec updates it even in a
  // single-branch clone. Same reasoning as ledger-issues.mjs.
  run("git", ["fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  let published = null;
  try {
    published = run("git", ["show", `origin/${branch}:${CONFIG_PATH}`]);
  } catch {
    // not merged yet
  }
  if (apply && published === null) throw new Error(`${CONFIG_PATH} is not on origin/${branch} yet; merge it before --apply`);
  // --apply never needs the working copy; only the dry run plans it.
  const working = apply ? null : readFileSync(workingPath, "utf8");
  const config = parse(apply ? published : working);
  // Line endings differ by checkout (core.autocrlf), not by content.
  const same = (a, b) => String(a ?? "").replace(/\r\n/g, "\n").trim() === String(b ?? "").replace(/\r\n/g, "\n").trim();
  if (!apply && !same(working, published)) {
    write(`issue-groups: planning your working copy of ${CONFIG_PATH}, which differs from origin/${branch}; --apply uses origin/${branch}.`);
  }

  const parents = config.groups.flatMap((group) => (group.parent ? [group.parent] : []));
  const numbers = [...config.groups.flatMap((group) => group.issues), ...parents, ...(config.standalone ?? [])];
  const target = { repo, branch };
  const snapshot = readSnapshot(graphql, { repo, numbers, parents });
  const plan = planGroups(config, snapshot, target);

  if (suggesting) {
    const corpus = suggestionCorpus(config, snapshot, plan);
    const pct = (share) => `${(share * 100).toFixed(1)}%`;
    if (evaluating) {
      const { results, right, wrong, unclear, top2 } = evaluate(config, corpus);
      write(`issue-groups: leave-one-out over ${results.length} grouped issues, judged as --suggest prints them`);
      write(`  right: ${pct(right)}   wrong: ${pct(wrong)}   no clear group: ${pct(unclear)}   real group in top two: ${pct(top2)}`);
      for (const miss of results.filter((r) => !r.clear || r.rank !== 1)) {
        const verdict = miss.clear ? `guessed ${miss.guess}` : `no clear group (leaning ${miss.guess})`;
        write(`  #${miss.number} is in ${miss.actual}: ${verdict}, real group ranked ${miss.rank}`);
      }
      return;
    }
    if (plan.ungrouped.length === 0) {
      write("issue-groups: every open issue is in a group or listed as standalone");
      return;
    }
    write(`issue-groups: ${plan.ungrouped.length} open issues are in no group. Suggestions only; nothing is changed.`);
    for (const s of suggest(config, corpus, plan.ungrouped)) {
      write(`  #${s.number} ${s.title}`);
      if (!s.clear) write(`      no clear group (best ${s.best?.key ?? "none"}, ${s.best?.score.toFixed(3) ?? 0})`);
      else write(`      -> ${s.best.key} (${s.best.score.toFixed(3)}; next ${s.next?.key ?? "none"} ${s.next?.score.toFixed(3) ?? ""}) shares: ${s.best.evidence.join(", ")}`);
    }
    return;
  }

  write(`issue-groups: ${config.groups.length} groups in ${apply ? `origin/${branch}` : "your working copy"}, ${snapshot.issues.length} issues read from ${repo}`);
  report(plan);
  if (!apply) {
    if (plan.actions.length > 0) write(`\nDry run: ${plan.actions.length} actions, nothing changed. --apply makes them from origin/${branch}.`);
    return;
  }

  const record = new Map(plan.record);
  if (plan.actions.length > 0) {
    const permission = graphql("query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { viewerPermission } }", {
      owner: repo.split("/")[0],
      name: repo.split("/")[1],
    }).data.repository.viewerPermission;
    if (!canApply(permission)) throw new Error(`--apply needs write access or more to ${repo}, and this account has ${permission}; nothing was changed`);
    const labels = JSON.parse(run("gh", ["label", "list", "--repo", repo, "--limit", "1000", "--json", "name"]));
    if (!labels.some((label) => label.name.toLowerCase() === LABEL)) {
      run("gh", ["label", "create", LABEL, "--repo", repo, "--color", "0e8a16", "--description", `Parent issue managed from ${CONFIG_PATH}`]);
    }
    write("");
    try {
      for (const [key, issue] of applyPlan(plan, githubPort({ repo, rest, graphql }), write)) record.set(key, issue.number);
    } catch (error) {
      // Record what was created before stopping, so the next run repairs it rather than duplicating.
      for (const [key, issue] of error.created ?? []) record.set(key, issue.number);
      recordInWorkingCopy(record);
      throw error;
    }
  }

  // Record first: if the check below fails to read, the numbers must already be safe.
  recordInWorkingCopy(record);
  // Proof that it finished: read GitHub again, with every parent recorded, and plan again.
  const after = planGroups(recordParents(config, record), readSnapshot(graphql, { repo, numbers: [...numbers, ...record.values()], parents: [...parents, ...record.values()] }), target);
  if (after.actions.length > 0) {
    write(`\nGitHub still differs from the file after applying; ${after.actions.length} actions remain:`);
    write(after.actions.map(formatAction).join("\n"));
    process.exitCode = 1;
    return;
  }
  write("\nVerified: a fresh read of GitHub matches the file.");
}

if (invokedAs("scripts/issue-groups.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`issue-groups: ${error.message}\n`);
    process.exit(1);
  });
}
