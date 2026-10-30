/**
 * `node scripts/agent.mjs orient`: where this session is. The SessionStart hook runs it as
 * `orient --brief --hook`, so a fresh session starts knowing its checkout, its branch against
 * the default branch, its uncommitted work and any hand-off waiting for it, without spending a call.
 *
 * This is the minimal orient of the agent-scripts plan's second pull request. Who else is working
 * here, open pull requests on your paths, the ledger read from the default branch and ports come with
 * the full one, in a later pull request.
 *
 * Read-only: it runs git, never fetches, and reads `tasks/open/HANDOFF-*.md`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { caseFolder } from "../lib/invokedAs.mjs";
import { readHandoffs } from "./handoff.mjs";
import { ago } from "./meter.mjs";
import { hookEvent, sessionId } from "./transcript.mjs";
import { git } from "./usage.mjs";

/** The per-worktree folders under a repository's common git directory. */
function worktreeDirs(common) {
  try {
    return readdirSync(join(common, "worktrees")).map((name) => join(common, "worktrees", name));
  } catch {
    return [];
  }
}

/**
 * The remote default branch `cwd` compares against, and how to repair a clone that disagrees with
 * it. The default branch was renamed from `master` to `main` on 2026-10-28. A clone made before
 * that keeps an `origin/HEAD` naming `origin/master`: plain `git fetch` neither moves it nor prunes
 * `origin/master`, which stays resolvable and frozen at the rename, and `git fetch --prune` leaves
 * `origin/HEAD` dangling. A single-branch clone (any `--depth` clone) never gets `origin/main` at
 * all. So `origin/main` wins whenever it exists, `origin/HEAD` is only the fallback without it, and
 * either disagreement adds a repair line.
 *
 * ceiling: knows one remote, `origin`, and one name, `main`. A fork whose own default is still
 * `master` gets a repair line that fails there, and a clone with no `origin/HEAD` gets none; a
 * local `master` still tracking `origin/master` is not checked. The next rename edits BRANCH here
 * and the `(?:master|main)` alternatives in usage.mjs. Orient is read-only: it reports, never
 * repairs.
 */
const BRANCH = "main";
const MAIN = `origin/${BRANCH}`;
function defaultBranch(cwd) {
  // symbolic-ref, unlike rev-parse, still names the target of a dangling origin/HEAD.
  const head = git(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (git(cwd, ["rev-parse", "--verify", "--quiet", `${MAIN}^{commit}`])) {
    return { base: MAIN, repair: head && head !== MAIN ? `origin/HEAD names ${head}, not ${MAIN}; repair with: git remote set-head origin -a` : null };
  }
  if (!head) return { base: MAIN, repair: null };
  const resolves = git(cwd, ["rev-parse", "--verify", "--quiet", `${head}^{commit}`]);
  // set-branches as well as fetch: a single-branch clone's refspec names only the old branch, so a
  // one-off fetch of the new one would never update again.
  const fix = `git remote set-branches origin ${BRANCH} && git fetch origin && git remote set-head origin -a`;
  return { base: resolves ? head : MAIN, repair: `this clone has no ${MAIN}; repair with: ${fix}` };
}

/**
 * The checkout `cwd` is in, or null outside a git repository. `stray` is set when `cwd` is a
 * `.claude/worktrees/<name>` folder git does not know as a worktree, so it silently resolves to
 * the checkout above it; whatever a session there edits lands in that checkout.
 */
export function whereAmI(cwd, { now = Date.now(), platform = process.platform } = {}) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top) return null;
  const gitDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const common = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const { base, repair } = defaultBranch(cwd);
  const counts = git(cwd, ["rev-list", "--left-right", "--count", `${base}...HEAD`]);
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const status = git(cwd, ["status", "--porcelain"]);
  // Every checkout of a repository shares its remote refs, but each worktree writes its own
  // FETCH_HEAD, so the last fetch anywhere is the newest of them.
  let fetched = null;
  for (const path of common ? [join(common, "FETCH_HEAD"), ...worktreeDirs(common).map((dir) => join(dir, "FETCH_HEAD"))] : []) {
    try {
      fetched = Math.max(fetched ?? 0, statSync(path).mtimeMs);
    } catch {
      // not fetched from there
    }
  }
  const fold = caseFolder(platform);
  const slashed = (p) => fold(resolve(p).replace(/\\/g, "/"));
  const folder = /^(.*\/\.claude\/worktrees\/[^/]+)/.exec(slashed(cwd))?.[1];
  return {
    top,
    worktree: Boolean(gitDir && common && slashed(gitDir) !== slashed(common)),
    branch: git(cwd, ["branch", "--show-current"]) || null,
    head: git(cwd, ["rev-parse", "--short", "HEAD"]),
    base,
    repair,
    ahead,
    behind,
    uncommitted: status ? status.split("\n").filter(Boolean).length : 0,
    fetchedMinutesAgo: fetched === null ? null : (now - fetched) / 60_000,
    stray: folder && slashed(top) !== folder ? folder : null,
  };
}

/** One sentence about the checkout, for a hand-off's header. */
export function describeWhere(w) {
  const against = w.ahead === null ? `no \`${w.base}\` to compare with` : `${w.ahead} ahead and ${w.behind} behind \`${w.base}\``;
  const repair = w.repair ? ` The counts may be stale: ${w.repair}.` : "";
  return `\`${w.top}\` on ${w.branch ? `\`${w.branch}\`` : "a detached HEAD"} at \`${w.head ?? "no commit"}\`; ${against}; ${w.uncommitted} uncommitted paths.${repair}`;
}

/**
 * The report, as lines. Pure. `session` is the current one, whose own hand-off is not news to it.
 *
 * @param {{ hook?: boolean, session?: string }} [options]
 */
export function orientLines(w, handoffs, options = {}) {
  const { hook = false, session } = options;
  const kind = w.worktree ? "worktree" : "main checkout";
  const at = `${kind} ${w.top} on ${w.branch ?? "a detached HEAD"} at ${w.head ?? "no commit"}`;
  const lines = [
    w.stray
      ? `orient: FAIL ${w.stray} is not a registered worktree, so git resolves it to ${w.top}: edits here land in that checkout`
      : `orient: PASS ${at}`,
  ];
  if (w.stray) lines.push(`where: ${at}`);
  const fetched = w.fetchedMinutesAgo === null ? "never fetched" : `as of the last fetch, ${ago(w.fetchedMinutesAgo)} ago`;
  lines.push(
    w.ahead === null
      ? `git: no ${w.base} to compare with; ${w.uncommitted} uncommitted paths`
      : `git: ${w.ahead} ahead and ${w.behind} behind ${w.base} ${fetched}; ${w.uncommitted} uncommitted paths`,
  );
  if (w.repair) lines.push(`git: ${w.repair}`);
  const waiting = handoffs.filter((h) => !session || h.session !== session);
  for (const h of waiting.slice(0, 3)) {
    lines.push(`hand-off: ${h.file} "${h.title}", from session ${(h.session ?? "unknown").slice(0, 8)}${h.opened ? ` on ${h.opened}` : ""}`);
  }
  if (waiting.length > 3) lines.push(`hand-off: ${waiting.length - 3} more in tasks/open/HANDOFF-*.md`);
  if (hook) {
    lines.push("meter: on. It adds a line when this session should write its hand-off: node scripts/agent.mjs ledger handoff --help");
  }
  return lines;
}

/**
 * The session a hook event names, or null. The SessionStart hook is given its session on stdin;
 * the environment is only a fallback, since nothing documents it for hook processes.
 */
function hookSession(read) {
  try {
    return hookEvent(read()).session;
  } catch {
    return null;
  }
}

const HELP = `usage: node scripts/agent.mjs orient [--brief] [--hook]

Where this session is: main checkout or worktree, branch and HEAD, ahead and behind origin/main
(origin/HEAD in a clone without it) as of the last fetch (it never fetches), uncommitted paths, and
hand-offs waiting in tasks/open/HANDOFF-*.md. It warns when the folder is a .claude/worktrees/ one
git does not know, which silently resolves to the checkout above it. When origin/HEAD or a missing
origin/main shows a clone made before the rename to main, it adds a repair line (still a pass).
Read-only.

  --brief  the short form a session starts with; until the full orient lands it is the only one
  --hook   as the SessionStart hook in .claude/settings.json runs it: the hook event on stdin,
           the short form, a line saying the meter is on, and exit 0 whatever happens, since a
           hook's output reaches the session only then

Exit codes: 0 pass, 1 a warning (the stray folder), 2 could not run.`;

export async function main(argv, io = {}) {
  const out = io.out ?? process.stdout;
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const hook = argv.includes("--hook");
  const unknown = argv.filter((a) => !["--brief", "--hook", "--help", "-h"].includes(a));
  if (argv.includes("--help") || argv.includes("-h")) {
    out.write(`${HELP}\n`);
    return 0;
  }
  if (unknown.length) {
    out.write(`orient: ERROR unknown argument: ${unknown[0]}\nnext: node scripts/agent.mjs orient --help\n`);
    return hook ? 0 : 2;
  }
  try {
    const w = whereAmI(cwd, { now: io.now ?? Date.now() });
    if (!w) {
      out.write(`orient: ERROR ${cwd} is not in a git repository\n`);
      return hook ? 0 : 2;
    }
    const session = (hook ? hookSession(() => io.stdin ?? (process.stdin.isTTY ? "" : readFileSync(0, "utf8"))) : null) ?? sessionId(env.CLAUDE_CODE_SESSION_ID);
    const lines = orientLines(w, readHandoffs(w.top), { hook, session });
    out.write(`${lines.join("\n")}\n`);
    return hook || !w.stray ? 0 : 1;
  } catch (error) {
    out.write(`orient: ERROR ${error.message}\n`);
    return hook ? 0 : 2;
  }
}
