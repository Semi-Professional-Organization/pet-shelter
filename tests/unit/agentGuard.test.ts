import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * `.claude/hooks/agent-guard.mjs` is the only enforcement any sub-agent has,
 * and it enforces exactly two rules — both irreversible at the step:
 * `schema-auditor` "never connects to a database", `atomic-commit` "emits
 * commands, does not run them".
 *
 * There is deliberately no rule about an agent leaving product code modified.
 * That hazard exists only because two sessions share one working tree, and a
 * worktree per session dissolves it — measured free on this machine, since
 * `.claude/worktrees/` sits inside the repo and Node resolves `node_modules`
 * upward from there. See
 * tasks/decisions/2026-08-31-worktrees-are-free-and-the-guard-was-the-wrong-layer.md
 *
 * The guard is invoked by Claude Code, not by this repo, so nothing else here
 * exercises it. A regression in the git allowlist or the tool allowlist would
 * be invisible until an agent quietly did the thing it promised not to.
 *
 * **The shell-command fence is gone (2026-09-05), and with it 35 tests.** It
 * blocked `git reset --hard`, `rm -rf` and production database writes by parsing
 * command strings with regexes; three review rounds found 8, then 12, then 14
 * defects and the rate never fell. `permissions.deny` in `.claude/settings.json`
 * does that job now and the harness enforces it. What remains here is the two
 * agent rules, the drift log, and — in the wiring block — assertions about the
 * permission rules themselves plus a ledger of the shapes prefix matching cannot
 * reach, in Bash and in PowerShell. See docs/archives/tasks/TARGET_AGENT_GUARDRAILS.md.
 *
 * What this file does NOT establish: that Claude Code runs the hook. Frontmatter
 * hooks load from the definition as it stood at SESSION START, so a hook wired
 * mid-session never fires —
 * tasks/decisions/2026-08-31-agent-definitions-are-session-start-snapshots.md.
 * The liveness log is the only way to tell a working guard from a silent one.
 *
 * Background: tasks/decisions/2026-08-31-declared-tools-are-not-a-mechanism.md
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const GUARD = join(ROOT, ".claude", "hooks", "agent-guard.mjs");

type ToolInput = { command?: string; file_path?: string };

function ask(
  agent: string | null,
  tool: string,
  toolInput: ToolInput,
  extraEnv: Record<string, string> = {},
): "ALLOW" | "DENY" {
  const payload: Record<string, unknown> = {
    hook_event_name: "PreToolUse",
    cwd: ROOT,
    tool_name: tool,
    tool_input: toolInput,
  };
  if (agent) {
    payload.agent_type = agent;
    payload.agent_id = "test";
  }
  const out = execFileSync("node", [GUARD], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    // Redirect the liveness log. Without this, running the suite writes lines
    // indistinguishable from a real agent invocation, and the liveness signal
    // stops meaning anything.
    env: {
      ...process.env,
      AGENT_GUARD_LOG: join(tmpdir(), "agent-guard-test.log"),
      AGENT_DRIFT_LOG: join(tmpdir(), "agent-drift-test.log"),
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!out.trim()) return "ALLOW";
  const decision = JSON.parse(out).hookSpecificOutput?.permissionDecision;
  return decision === "deny" ? "DENY" : "ALLOW";
}

const repoFile = (p: string) => join(ROOT, p);

/**
 * Drive a PostToolUse event with isolated drift log + state, and return the log lines.
 *
 * `cwd` defaults to this repo but is a parameter because the drift log reads
 * `git status --porcelain`: a test that asserts it recorded something is really
 * asserting that this tree is dirty, which is a property of whoever committed
 * last, not of the guard. The callers that need a delta pass a scratch repo.
 */
function driftAfter(
  tool: string,
  seedState: string | null,
  cwd: string = ROOT,
  sessionId?: string,
): string[] {
  const log = join(tmpdir(), `drift-${randomUUID()}.log`);
  const state = join(tmpdir(), `drift-${randomUUID()}.state`);
  if (seedState !== null) writeFileSync(state, seedState);
  execFileSync("node", [GUARD], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      cwd,
      tool_name: tool,
      tool_input: { command: "irrelevant" },
      ...(sessionId === undefined ? {} : { session_id: sessionId }),
    }),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_GUARD_LOG: join(tmpdir(), "agent-guard-test.log"),
      AGENT_DRIFT_LOG: log,
      AGENT_DRIFT_STATE: state,
    },
  });
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
}

describe("agent guard", () => {
  it("has no opinion about the main conversation", () => {
    // Every rule below is keyed on agent_type. Without one, a human session
    // must be able to do anything it could do before this file existed.
    expect(ask(null, "Bash", { command: "git commit -m x" })).toBe("ALLOW");
    expect(ask(null, "Write", { file_path: repoFile("src/lib/email.ts") })).toBe("ALLOW");
  });

  describe("schema-auditor has no shell", () => {
    it("denies every Bash command, not a list of dangerous ones", () => {
      // prisma.config.ts resolves the production URL at load, so "which
      // subcommand connects" is not a margin worth reasoning about.
      expect(ask("schema-auditor", "Bash", { command: "npx prisma validate" })).toBe("DENY");
      expect(ask("schema-auditor", "Bash", { command: "ls" })).toBe("DENY");
    });

    it("denies every other execution path, not just the one named Bash", () => {
      // The premise of this guard is that a declared `tools:` list may not be
      // enforced. Naming one shell leaves the rest open to the production URL,
      // and this environment also exposes PowerShell.
      expect(ask("schema-auditor", "PowerShell", { command: "ls" })).toBe("DENY");
      expect(ask("schema-auditor", "BashOutput", {})).toBe("DENY");
      expect(ask("schema-auditor", "Write", { file_path: repoFile("prisma/schema.prisma") })).toBe("DENY");
      expect(ask("schema-auditor", "WebFetch", {})).toBe("DENY");
    });

    it("leaves the three tools it declares alone", () => {
      expect(ask("schema-auditor", "Read", { file_path: repoFile("prisma/schema.prisma") })).toBe("ALLOW");
      expect(ask("schema-auditor", "Grep", {})).toBe("ALLOW");
      expect(ask("schema-auditor", "Glob", {})).toBe("ALLOW");
    });
  });

  describe("atomic-commit emits git commands rather than running them", () => {
    it("allows the reads it needs to do its job", () => {
      expect(ask("atomic-commit", "Bash", { command: "git status --short" })).toBe("ALLOW");
      expect(ask("atomic-commit", "Bash", { command: "git diff --cached --name-only" })).toBe("ALLOW");
      expect(ask("atomic-commit", "Bash", { command: "git log --format=%h | head -3" })).toBe("ALLOW");
      expect(ask("atomic-commit", "Bash", { command: "ls -la" })).toBe("ALLOW");
    });

    it("denies every write, including chained and sub-shelled ones", () => {
      expect(ask("atomic-commit", "Bash", { command: "git add -- a.ts" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "git status; git commit -F msg" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "(cd x && git commit -F m)" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "git push --force origin HEAD" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "git stash" })).toBe("DENY");
    });

    it("finds git wherever it appears, not only after a separator", () => {
      // Anchoring on separators let every one of these through, and each writes
      // the index that another session is using.
      expect(ask("atomic-commit", "Bash", { command: "for f in a b; do git add -- $f; done" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "if true; then git commit -m x; fi" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "env git commit -m x" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: 'sh -c "git commit -m x"' })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "ls | xargs git add" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "time git push" })).toBe("DENY");
    });

    it("denies the word git inside a string too, because failing closed is the point", () => {
      // The cost of this false positive is one confusing denial with a message
      // that says what to do. The cost of the false negative it replaces is a
      // commit in shared history.
      expect(ask("atomic-commit", "Bash", { command: 'echo "remember to git add"' })).toBe("DENY");
    });

    it("denies redirects into another checkout", () => {
      // triage-rules.md section 5 bans these outright; the guard does not try
      // to parse them.
      expect(ask("atomic-commit", "Bash", { command: "git -C /other status" })).toBe("DENY");
      expect(ask("atomic-commit", "Bash", { command: "GIT_DIR=/x git status" })).toBe("DENY");
    });

    it("does not read -C on a non-git command as a checkout redirect", () => {
      expect(ask("atomic-commit", "Bash", { command: "ls -C" })).toBe("ALLOW");
      expect(ask("atomic-commit", "Bash", { command: "sort -C file.txt" })).toBe("ALLOW");
      expect(ask("atomic-commit", "Bash", { command: "git diff | grep -C 3 foo" })).toBe("ALLOW");
    });

    it("is an allowlist, so an unrecognised subcommand is a write", () => {
      expect(ask("atomic-commit", "Bash", { command: "git some-new-plumbing-verb" })).toBe("DENY");
    });

    it("covers the other shell tool this environment exposes", () => {
      expect(ask("atomic-commit", "PowerShell", { command: "git commit -m x" })).toBe("DENY");
      expect(ask("atomic-commit", "PowerShell", { command: "git status" })).toBe("ALLOW");
    });
  });

  describe("no agent is stopped from writing product code", () => {
    // Deliberate, and it is the whole shape of this guard. Mutating product
    // code to watch a test fail is the only way to prove a test discriminates
    // against code that already works, and a step-level path rule blocked that
    // through Edit while permitting it through Bash. The thing it was reaching
    // for — an agent dirtying a tree a second session commits with `git add -A`
    // — is dissolved by a worktree per session, not by a hook.
    it("lets any agent edit product code, through any tool", () => {
      expect(ask("test-writer", "Write", { file_path: repoFile("src/lib/server/prisma.ts") })).toBe("ALLOW");
      expect(ask("test-writer", "Edit", { file_path: repoFile("prisma/env.ts") })).toBe("ALLOW");
      expect(ask("test-writer", "Bash", { command: "sed -i s/a/b/ prisma/env.ts" })).toBe("ALLOW");
      expect(ask("spike-runner", "Bash", { command: "cat > src/probe.ts <<EOF" })).toBe("ALLOW");
    });

    it("does not restrict the shell an agent needs to run the suite", () => {
      expect(ask("test-writer", "Bash", { command: "npm test" })).toBe("ALLOW");
      expect(ask("ui-critic", "Bash", { command: "npx vitest run" })).toBe("ALLOW");
      expect(ask("spike-runner", "Bash", { command: "npm test" })).toBe("ALLOW");
    });
  });

  describe("the drift log observes the tree, not the tool input", () => {
    // Reading tool_input.file_path recorded 1 of 6 files actually written in the session
    // that built this guard, because auto mode steers file changes to \`cat >\` and
    // \`sed -i\`. That is the identical blind spot that got the step-level path rule
    // deleted on 2026-08-31. A matcher on tool names cannot see a heredoc; git status can.

    // Both assertions below need a tree with uncommitted work, so they make one rather
    // than borrowing this one. Reading ROOT, they passed only until the working tree was
    // committed — the same live-tree coupling the checkout tests were moved out of, in
    // the opposite direction. A test whose verdict flips on `git commit` is not a test.
    let dirty: string;

    beforeAll(() => {
      dirty = mkdtempSync(join(tmpdir(), "guard-drift-"));
      const git = (...args: string[]) =>
        execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
          cwd: dirty,
          stdio: "ignore",
        });
      git("init", "-q");
      writeFileSync(join(dirty, "tracked.txt"), "committed\n");
      git("add", "-A");
      git("commit", "-qm", "base");
      // One modification and one untracked file: the two shapes `git status --porcelain`
      // reports and a tool-name matcher would miss if they arrived via `cat >`.
      writeFileSync(join(dirty, "tracked.txt"), "written through a heredoc\n");
      writeFileSync(join(dirty, "untracked.txt"), "written through a heredoc\n");
    });

    it("records files written through Bash, which no tool-name matcher can see", () => {
      // Seeded with an empty baseline, so every dirty path reads as a delta.
      const lines = driftAfter("Bash", "", dirty);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => l.includes(" main Bash "))).toBe(true);
      expect(lines.some((l) => l.endsWith("tracked.txt"))).toBe(true);
      expect(lines.some((l) => l.endsWith("untracked.txt"))).toBe(true);
    });

    it("attributes nothing on its first call, because the tree was already dirty", () => {
      // No state file: establish the baseline and credit this tool with nothing. Logging
      // a pre-existing diff would attribute another session's work to this tool call.
      // Run against the dirty scratch repo, so there is something it could have wrongly
      // attributed — against a clean tree this assertion would hold vacuously.
      expect(driftAfter("Bash", null, dirty)).toEqual([]);
    });

    // The log is ONE shared append-only file: across sessions, across days, and across
    // checkouts on the same machine. Measured 2026-09-08 at 602 lines spanning three days
    // and two different checkouts of this repo, with no field to tell them apart, which made
    // "read the drift log before the close write" unbounded in practice.
    // tasks/open/drift-log-cannot-be-attributed-to-a-session.md
    it("stamps each line with the session, so a reader can isolate their own writes", () => {
      const mine = "0569a56d-27bc-4da0-b772-4523fd31162c";
      const lines = driftAfter("Bash", "", dirty, mine);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => l.includes(` ${mine} main Bash `))).toBe(true);
      // The discriminating half: a different session's lines must NOT match that grep.
      const theirs = driftAfter("Bash", "", dirty, "6d9de0a7-bab8-4943-8913-ac909e83b65a");
      expect(theirs.length).toBeGreaterThan(0);
      expect(theirs.some((l) => l.includes(mine))).toBe(false);
    });

    it("falls back to a placeholder rather than an empty field when there is no session", () => {
      // An absent id must not shift every later field left and silently corrupt the format.
      const lines = driftAfter("Bash", "", dirty);
      expect(lines.every((l) => l.includes(" nosession main Bash "))).toBe(true);
    });

    it("sanitises the session id, which also names a file under tmpdir", () => {
      // The id is interpolated into the state filename. A separator would escape tmpdir,
      // and a space would break the log's field alignment.
      const lines = driftAfter("Bash", "", dirty, "../../etc/pass wd");
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => l.includes(" .._.._etc_pass_wd main Bash "))).toBe(true);
      expect(lines.some((l) => l.includes("/") && l.includes("etc/pass"))).toBe(false);
    });

    it("never denies, whatever it sees", () => {
      expect(
        ask(null, "Write", { file_path: repoFile("src/lib/email.ts") }),
      ).toBe("ALLOW");
    });
  });

  describe("the wiring, which no unit test can exercise by invoking the hook", () => {
    // A hook that enforces nothing still produces confidence, so the capability is
    // asserted where it lives — the config — not in the module.
    //
    // The PreToolUse fence this file used to guard is GONE. It parsed shell command
    // strings with regexes, was hardened five times (8, then 12, then 14 defects per
    // independent pass, a rate that never fell), blocked its own disarm script, and
    // denied 151 of 5,028 real commands. It is replaced by first-party permission rules
    // and autoMode entries, which is what these tests now pin.
    // tasks/decisions/2026-09-05-first-party-permissions-replace-the-hand-rolled-fence.md
    const settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
    const SHELLS = ["Bash", "PowerShell", "BashOutput", "KillShell"];

    it("no longer wires a PreToolUse shell parser", () => {
      expect(settings.hooks.PreToolUse).toBeUndefined();
    });

    it("denies the production database writes outright, and not their local variants", () => {
      const deny = settings.permissions.deny.join("\n");
      for (const rule of ["npm run db:seed", "npx prisma db push", "npx prisma migrate"]) {
        expect(deny).toContain(rule);
      }
      // Exact-match entries, so the three :local escapes in triage-rules.md section 1
      // are not swept up. A wildcard here would be the false-positive trainer the
      // hand-rolled version needed four rounds to stop being.
      expect(deny).not.toContain("npm run db:push:local");
      expect(deny).not.toContain("npm run db:seed:local");
      expect(deny).not.toContain("Bash(npm run db:push*)");
      // The FAQ and bulletin migrations are the same shape of script, so both deny the npm and
      // the direct invocation, in both shells.
      for (const [script, npm] of [["migrate-faqs", "db:migrate:faqs"], ["migrate-bulletins", "db:migrate:bulletins"]]) {
        for (const tool of ["Bash", "PowerShell"]) {
          expect(covered(`npx tsx scripts/${script}.ts`, tool), `${script} in ${tool}`).toBe(true);
          expect(covered(`npm run ${npm}`, tool), `${npm} in ${tool}`).toBe(true);
        }
      }
    });

    it("asks rather than denies for the judgment calls, so the override is in band", () => {
      // The mechanism this replaced could only be overridden by relaunching Claude Code
      // with an environment variable — which an agent cannot request and a human had to
      // restart for.
      const ask = settings.permissions.ask.join("\n");
      for (const rule of ["git reset --hard", "git stash", "git rebase", "rm -rf"]) {
        expect(ask).toContain(rule);
      }
    });

    it("leaves the auto-mode profile to the user settings, which own it", () => {
      // A project `autoMode` block was added here on the belief that no profile existed.
      // One does: ~/.claude/settings.json carries 23 `environment` and 3 `soft_deny`
      // entries, including this repo's visibility and a PDPA data-location entry.
      // Array-valued settings are replaced by the highest-precedence source rather than
      // merged — the `$defaults` sentinel re-inherits built-ins and there is no `$user`
      // equivalent, which is the tell — so a block here discards all 23 for this repo.
      // Removed by the human 2026-09-05; this pins it staying removed.
      // tasks/decisions/2026-09-05-first-party-permissions-replace-the-hand-rolled-fence.md
      expect(settings.autoMode).toBeUndefined();
    });

    // ================= what prefix matching does not reach =================
    // `permissions` rules match from the START of the command string, so every rule
    // here is defeated by putting something in front of the verb. That was recorded as
    // prose ("what is honestly worse now") and never enumerated, which is how a known
    // gap becomes a forgotten one.
    //
    // The corpus below is lifted from the evasion suite of ECC's GateGuard
    // (github.com/affaan-m/ecc, MIT, Copyright (c) 2026 Affaan Mustafa) — 174 adversarial
    // cases, six of them regression tests for GHSA-4v57-ph3x-gf55 — plus the three
    // bypasses its own 2,876-line test file does NOT cover, found by reading the source:
    // `sudo`, an env-var prefix, and `xargs`. Both projects anchor on the first token,
    // so both lose to the same trick; theirs took a CVE to find, ours is measured here
    // before it costs anything.
    //
    // This is a LEDGER, not a fence. Nothing here is enforced. If a shape becomes
    // covered, move it to COVERED and say what covers it — an entry silently changing
    // sides is the regression this exists to catch.
    // Per the permissions reference (code.claude.com/docs/en/permissions): `*` matches anything,
    // anywhere in the rule, and a trailing ` *` also matches the bare command (`Bash(ls *)`
    // matches `ls`).
    const matchesRule = (rule: string, command: string): boolean => {
      const body = rule.replace(/^\w+\(/, "").replace(/\)$/, "");
      const pattern = (text: string) => new RegExp(`^${text.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      return pattern(body).test(command) || (body.endsWith(" *") && command === body.slice(0, -2));
    };
    const covered = (command: string, tool = "Bash"): boolean =>
      [...settings.permissions.deny, ...settings.permissions.ask]
        .filter(r => r.startsWith(`${tool}(`))
        .some(r => matchesRule(r, command));

    // Permission gaps found while planning the agent scripts, closed for both shells: this repo's
    // agents run PowerShell as often as Bash, and the permissions reference documents PowerShell
    // rules as their own `PowerShell(...)` shape. Whether a Bash rule also binds PowerShell is
    // unobserved; the older rules above are Bash-only —
    // tasks/open/permission-rules-bind-bash-only.md.
    it.each(["Bash", "PowerShell"])("denies the scripts that reach production secrets, in %s", (tool) => {
      // In the main checkout `.env.local` is production: db:migrate:bulletins reads it, and
      // secrets:decrypt:local overwrites it. secrets:run decrypts the production file into any
      // command's environment, and secrets:edit:prod decrypts it into an editor. secrets:check,
      // which only reports whether decryption works, stays open. db:migrate:bulletins:local is
      // the rehearsal and must stay open, which is why the bulletins rule is word-bounded, not a
      // bare `*`.
      for (const command of [
        "npm run db:migrate:bulletins",
        "npm run db:migrate:bulletins -- --dry-run",
        "npx tsx scripts/migrate-bulletins.ts",
        "npm run secrets:decrypt:local",
        "node scripts/secrets.mjs decrypt-to-local .env.production.enc .env.local",
        "npm run secrets:run -- npm run db:seed",
        "node scripts/secrets.mjs run .env.production.enc -- npm start",
        "npm run secrets:edit:prod",
        "node scripts/secrets.mjs edit .env.production.enc",
      ]) {
        expect(covered(command, tool), `expected covered: ${command}`).toBe(true);
      }
      // The bare command has its own exact rule, so it is denied even if a trailing ` *` turned
      // out not to match a command with no arguments, which the reference says but nobody here
      // has observed.
      expect(settings.permissions.deny).toContain(`${tool}(npm run db:migrate:bulletins)`);
      expect(covered("npm run db:migrate:bulletins:local", tool)).toBe(false);
      expect(covered("npm run secrets:check", tool)).toBe(false);
      expect(settings.permissions.deny).not.toContain(`${tool}(npm run db:migrate:bulletins*)`);
    });

    it.each(["Bash", "PowerShell"])("asks before the ledger mirror publishes issues, and not for its dry run, in %s", (tool) => {
      // The mirror reads --apply anywhere in its arguments, so the rule does too.
      expect(settings.permissions.ask).toContain(`${tool}(npm run ledger:issues *--apply*)`);
      expect(covered("npm run ledger:issues -- --apply", tool)).toBe(true);
      expect(covered("npm run ledger:issues -- --branch master --apply", tool)).toBe(true);
      expect(covered("node scripts/ledger-issues.mjs --apply", tool)).toBe(true);
      expect(covered("node scripts/ledger-issues.mjs --branch x --apply", tool)).toBe(true);
      expect(covered("npm run ledger:issues", tool)).toBe(false);
      expect(covered("npm run ledger:issues -- --branch master", tool)).toBe(false);
    });

    it("catches the destructive commands only when they lead the string", () => {
      // The rules work. This is the control for the test below it.
      for (const command of [
        "git reset --hard HEAD~1",
        "git clean -fd",
        "git stash push -m x",
        "rm -rf build",
        "npx prisma db push",
      ]) {
        expect(covered(command), `expected covered: ${command}`).toBe(true);
      }
    });

    it("does not catch any of them behind a prefix, which is the whole gap", () => {
      const UNCOVERED = [
        // Segment separators: the rule never sees the second command.
        "cd src && git reset --hard",
        "true; git clean -fd",
        "true & rm -rf build",
        "echo x | xargs rm -rf",
        // Env-var and privilege prefixes. ECC misses these too — `sudo` and `xargs`
        // appear 0 times in its source AND 0 times in its 174-case suite.
        "FOO=1 rm -rf build",
        "sudo rm -rf build",
        "env rm -rf build",
        // Command substitution and shell wrappers (GHSA-4v57-ph3x-gf55 shapes).
        "sh -c 'git reset --hard'",
        "bash -c \"rm -rf build\"",
        "$(git reset --hard)",
        // Quoted command word, and a leading git option before the subcommand.
        "'rm' -rf build",
        "git -c core.pager=cat reset --hard",
        // Under the npm scripts: the sops binary they call, and another way to load tsx.
        "sops --decrypt --input-type dotenv --output-type dotenv .env.production.enc",
        "node --import tsx scripts/migrate-bulletins.ts",
      ];
      for (const command of UNCOVERED) {
        expect(covered(command), `newly covered, move it: ${command}`).toBe(false);
      }
    });

    it("does not catch, by prefix, a PowerShell path spelled another way or a leading statement", () => {
      // The rules name `scripts/x` with forward slashes and no `./`. PowerShell accepts every
      // path spelling below, and each one reaches the same script.
      const UNCOVERED_POWERSHELL = [
        "npx tsx .\\scripts\\migrate-bulletins.ts",
        "npx tsx ./scripts/migrate-bulletins.ts",
        "node .\\scripts\\secrets.mjs decrypt-to-local",
        "node scripts\\secrets.mjs run -- npm start",
        // The commonest PowerShell shape in this repo's transcripts: a leading statement. The
        // reference says PowerShell rules are checked per subcommand of the parsed command, which
        // would catch these; this prefix model cannot, and nobody here has observed either.
        "Set-Location D:\\Dev\\Repos\\pet-shelter; npm run secrets:run -- npm start",
        "$env:FOO='1'; npm run db:migrate:bulletins",
      ];
      for (const command of UNCOVERED_POWERSHELL) {
        expect(covered(command, "PowerShell"), `newly covered, move it: ${command}`).toBe(false);
      }
    });

    it("logs drift after shell writes, not only after Edit and Write", () => {
      // auto mode steers file changes to \`cat >\` and \`sed -i\`; a matcher that omits
      // the shells records a fraction of what is written. Measured: 1 file of 6.
      const matcher = settings.hooks.PostToolUse[0].matcher;
      for (const tool of [...SHELLS, "Edit", "Write", "NotebookEdit"]) {
        expect(matcher).toContain(tool);
      }
      expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain("agent-guard.mjs");
    });
  });

});
