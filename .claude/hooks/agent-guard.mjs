#!/usr/bin/env node
// PreToolUse guard for the sub-agents in `.claude/agents/`.
//
// It enforces exactly two rules, and both are **irreversible at the step**: once `schema-auditor`
// reaches a database or `atomic-commit` writes git history, no later check can undo it. That is the
// whole test for whether a rule belongs here.
//
// Rules about the *end state* — "this agent left product code modified" — are deliberately NOT
// here. Both shapes were built and removed. A step-level path rule blocked `test-writer` from
// mutating product code to watch a test fail, which is the only way to prove a test discriminates,
// while leaving the same write through Bash untouched. A `SubagentStop` end-state check fixed that
// but mitigated a hazard that only exists because two sessions share one working tree — and a
// worktree per session dissolves it instead, for free.
// See tasks/decisions/2026-08-31-worktrees-are-free-and-the-guard-was-the-wrong-layer.md.
//
// **There is no shell-command fence here any more (removed 2026-09-05).**
// ~520 lines parsed command strings with regexes to block `git reset --hard`, `rm -rf` and
// production database writes. It was hardened five times and the defect rate never fell:
// 8 of 9 crafted probes wrong, then 12 and 14 from two independent passes. Replayed over all
// 5,028 commands in this project's transcripts it denied 151, roughly 85 of them legitimate
// work. Root cause of every defect: it parsed shell without a shell parser. It is replaced by
// `permissions.deny` in `.claude/settings.json`, which the harness enforces.
// See `docs/tasks/TARGET_AGENT_GUARDRAILS.md` and
// `tasks/decisions/2026-09-05-first-party-permissions-replace-the-hand-rolled-fence.md`.
//
// It briefly survived here for the two sub-agents alone, wired through their frontmatter, on a
// defence-in-depth argument. That was incoherent — the same parser, the same defect rate, applied
// to whoever happened not to be the main conversation — and it was removed on the human's call.
// **Do not revive it.** `permissions` rules are prefix-matched, so `cd x && git reset --hard` is
// not caught; the thirteen shapes that escape are enumerated in `tests/unit/agentGuard.test.ts` as a
// ledger. If one of them must actually be blocked, that is a narrowly-scoped hook for one shape,
// with a corpus replay before it is armed — not this file again.
//
// **Two wirings, deliberately different.**
//   - Agent frontmatter (`schema-auditor`, `atomic-commit`): `PreToolUse`, binds those two agents.
//   - `.claude/settings.json`: `PostToolUse`, binds every session, for the drift log only.
//
// Consequence for the liveness protocol: the log fills with `main` lines from ordinary work, so
// "a line exists" no longer means "an agent ran". Grep for the agent name —
// `grep -E ' (schema-auditor|atomic-commit) ' <log>` — which is what
// `tasks/open/matcherless-hook-wiring-unverified.md` needs.
//
// `jq` is not installed on this machine; node is, and this is a node project, so node it is.
//
// Liveness: every invocation appends to <tmp>/claude-agent-guard.log. Frontmatter hooks come from
// the agent definition as it stood when the SESSION started, so a hook wired mid-session never
// fires, and a silent no-op looks exactly like a working guard
// (tasks/decisions/2026-08-31-agent-definitions-are-session-start-snapshots.md). The log is how you
// tell the difference:
//     cat "$TMPDIR/claude-agent-guard.log"    (Windows: %TEMP%\claude-agent-guard.log)
// No line after `schema-auditor` or `atomic-commit` has run means the hook never fired and the
// contract is still prose.

import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// `AGENT_GUARD_LOG` redirects this, so tests/unit/agentGuard.test.ts writes its own file
// instead of salting the shared one — otherwise a line here stops meaning "an agent ran".
const LOG = process.env.AGENT_GUARD_LOG || join(tmpdir(), "claude-agent-guard.log");

/**
 * Write-path drift log. Non-blocking by design: it records every file write so that
 * "while I'm here" edits are visible at review time, and it never denies, so it cannot
 * train reflex approval. A log nobody reads is furniture, so `AGENTS.md` carries the read rule
 * and `.claude/skills/midwife/SKILL.md` §5 places it before the ledger write — memory lives in
 * files, not in the chat. This hook writes the Claude log; `.codex/hooks/drift-log.mjs` writes its
 * own. Read the one your harness produced:
 *     PowerShell: cat "$env:TEMP/claude-agent-drift.log"   Git Bash: "$TEMP/..."
 *     elsewhere:  cat "${TMPDIR:-/tmp}/claude-agent-drift.log"
 */
const DRIFT = process.env.AGENT_DRIFT_LOG || join(tmpdir(), "claude-agent-drift.log");


/** Read-only git subcommands. Anything not on this list is a write until proven otherwise. */
const GIT_READS = new Set([
  "status", "diff", "log", "show", "blame", "describe", "shortlog",
  "rev-parse", "rev-list", "merge-base", "cat-file", "ls-files", "ls-tree",
  "symbolic-ref", "for-each-ref", "check-ignore", "var", "help", "grep",
]);

/** Everything `schema-auditor` may touch. Anything else, including any shell, is denied. */
const SCHEMA_AUDITOR_TOOLS = new Set(["Read", "Grep", "Glob"]);

/**
 * Tools that run a command line. `Bash` is not the only one this environment offers.
 * **Duplicated as the `PreToolUse` matcher in `.claude/agents/{schema-auditor,atomic-commit}.md`.**
 * Adding a tool here without adding it there means the hook never fires for it. The duplication is
 * deliberate and temporary: a matcherless hook removes it, and
 * `tasks/open/matcherless-hook-wiring-unverified.md` carries the measurement that would allow it.
 */
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "BashOutput", "KillShell"]);

function log(line) {
  try { appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`); } catch { /* never block on logging */ }
}

function allow() { process.exit(0); }

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow(); // Unparseable input is a harness problem, not a policy violation. Fail open, loudly.
}

// The harness sends the working directory in the payload. Deriving it from this
// process's cwd instead worked only because cwd happened to be the repo root — the
// same "it was luck, not evidence" shape this repo keeps rediscovering. Both the
// checkout-path discriminator and the drift log resolve against it.
const ROOT = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Previous `git status --porcelain` snapshot, so the log records deltas and not the tree.
 * **Keyed by session**, which stops concurrent sessions clobbering each other's baseline
 * and re-establishes the "first call attributes nothing" protection per session.
 *
 * It does NOT stop cross-attribution: `git status` observes one shared working tree, so a
 * write by the other session lands in this session's log against whatever tool ran last.
 * Only a worktree per session fixes that
 * (`tasks/decisions/2026-08-31-worktrees-are-free-and-the-guard-was-the-wrong-layer.md`).
 */
/**
 * The session a drift line belongs to. `DRIFT` is one shared append-only file — across
 * sessions, across days, and across checkouts on the same machine — so without this field a
 * reader cannot tell their own writes from a concurrent session's, and the "read it before the
 * ledger write" rule has nothing to filter on.
 * See `tasks/open/drift-log-cannot-be-attributed-to-a-session.md`.
 *
 * Sanitised because it also names a file: an id carrying a path separator would otherwise
 * escape `tmpdir()`. `.codex/hooks/drift-log.mjs` sanitises the same way.
 */
const SESSION = String(input.session_id || "nosession").replace(/[^a-zA-Z0-9_.-]/g, "_");

const DRIFT_STATE =
  process.env.AGENT_DRIFT_STATE || join(tmpdir(), `claude-agent-drift.${SESSION}.state`);

const agent = input.agent_type ?? "main";
const tool = input.tool_name;
log(`${agent} ${tool}`);

// ================= PostToolUse: the drift log, which never denies =================
// Writes are recorded, not judged. Path-based fences were built and deleted here
// (tasks/decisions/2026-08-31-step-rule-deleted-nothing-replaces-it.md); a log is what
// survives that finding, because it costs nothing at the step and cannot block correct
// work that merely looks out of scope.
//
// **It observes the TREE, not the tool input.** Reading `tool_input.file_path` recorded
// 1 of 6 files actually written in the session that built this, because auto mode steers
// file changes to `cat >`, `sed -i` and short node scripts — the identical blind spot
// that got the step-level path rule deleted. A matcher on tool names cannot see a
// heredoc. `git status` can.
//
// Measured cost: ~120ms per call. Paid deliberately, because a log with 1-in-6 recall is
// worse than no log: it produces confidence without coverage.
if (input.hook_event_name === "PostToolUse") {
  try {
    const porcelain = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
      // The index is shared with a live writer. `git status` would otherwise take
      // index.lock on every tool call just to refresh a cache nobody here reads.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    // Status code alone is not a delta: a file already ` M` that is edited again keeps
    // the same code, so six patch passes over one file logged nothing. mtime moves.
    const lines = porcelain
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        let mtime = 0;
        try {
          mtime = statSync(join(ROOT, l.slice(3))).mtimeMs;
        } catch {
          /* deleted, renamed, or a git-quoted path */
        }
        return `${l}\t${mtime}`;
      });
    const first = !existsSync(DRIFT_STATE);
    const before = new Map(
      (first ? "" : readFileSync(DRIFT_STATE, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((l) => [l.slice(3).split("\t")[0], l]),
    );
    writeFileSync(DRIFT_STATE, lines.join("\n"));
    // The first call establishes the baseline and attributes nothing. Logging a tree
    // that was already dirty would credit this tool with another session's work.
    if (!first) {
      const paths = new Set(lines.map((l) => l.slice(3).split("\t")[0]));
      const changed = lines.filter((l) => before.get(l.slice(3).split("\t")[0]) !== l);
      // A path that LEAVES porcelain is a change too: an untracked file deleted, or a
      // modification reverted. Without this the log misrepresents the tree it tracks.
      for (const [path, record] of before) {
        if (!paths.has(path)) changed.push(`${record.slice(0, 2)} ${path}\tgone`);
      }
      if (changed.length) {
        appendFileSync(
          DRIFT,
          changed
            .map(
              (l) =>
                `${new Date().toISOString()} ${SESSION} ${agent} ${tool} ${l.slice(0, 2).trim()} ${l
                  .slice(3)
                  .split("\t")[0]}`,
            )
            .join("\n") + "\n",
        );
      }
    }
  } catch { /* never block on logging */ }
  allow();
}

/**
 * Classify every `git ...` invocation in a shell command. Allowlist, and fail closed: a git call
 * whose subcommand cannot be identified counts as a write, because the alternative is a blocklist
 * and a blocklist is only as good as its author's imagination.
 */
function gitWrites(command) {
  const writes = [];
  // `git` at a word boundary ANYWHERE, not only after a separator. Anchoring on separators missed
  // `for f in a b; do git add $f; done`, `env git commit`, `xargs git add`, `time git push` and
  // `sh -c "git commit"` — every one of which writes the shared index. The lookbehind keeps
  // `github`, `.git` and `foo-git` out.
  for (const m of command.matchAll(/(?<![\w./-])git\s+([^;&|)`\n]*)/g)) {
    const args = m[1];
    // A redirect points git at another checkout. triage-rules.md section 5 bans these outright, so
    // they never need parsing — but the flag only counts INSIDE a git call: `ls -C`, `sort -C f`
    // and `grep -C 3 foo` are not git redirects.
    if (/(?:^|\s)(?:-C\b|--git-dir\b|--work-tree\b)/.test(args)) {
      writes.push("<redirected into another checkout>");
      continue;
    }
    const sub = args.trim().split(/\s+/).find((t) => t && !t.startsWith("-"));
    if (!sub) writes.push("<unparseable>");
    else if (!GIT_READS.has(sub)) writes.push(sub);
  }
  if (/GIT_DIR=|GIT_WORK_TREE=/.test(command)) writes.push("<redirected into another checkout>");
  return writes;
}

if (agent === "schema-auditor" && !SCHEMA_AUDITOR_TOOLS.has(tool)) {
  // An allowlist, not `tool === "Bash"`. This environment also exposes a PowerShell tool, and the
  // premise of this whole guard is that the frontmatter `tools:` list may not be enforced — so
  // naming one shell leaves every other execution path open to the production connection string.
  deny(
    `schema-auditor declares no shell and no '${tool}'. prisma.config.ts resolves the Neon ` +
    "PRODUCTION url at load, so every Prisma CLI call starts from a production connection string. " +
    "Read the schema file and grep the callers instead. " +
    "See tasks/decisions/2026-08-31-schema-auditor-has-no-shell.md.",
  );
}

if (agent === "atomic-commit" && SHELL_TOOLS.has(tool)) {
  const writes = gitWrites(String(input.tool_input?.command ?? ""));
  if (writes.length) {
    deny(
      `atomic-commit emits git commands, it does not run them — refusing 'git ${writes.join("', 'git ")}'. ` +
      "The index is shared with another session, so staging and committing belong to the caller. " +
      "Return the command block instead.",
    );
  }
}

allow();
