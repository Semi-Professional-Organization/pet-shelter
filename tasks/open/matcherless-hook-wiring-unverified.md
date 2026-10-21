# Only one `PreToolUse` matcher shape has ever been observed firing

**Status:** open · opened 2026-08-31 · ASSERTED

The liveness log holds exactly one line in its history:

    2026-08-30T18:08:54.747Z test-writer Write

It came from `matcher: Edit|Write|NotebookEdit`. **An alternation matcher is therefore the only
frontmatter wiring shape MEASURED to work in this repo.** The docs say `"*"`, `""` or an omitted
matcher all match every tool, and nothing here has ever confirmed that.

This matters because the failure is silent. A matcher the harness does not honour produces no
error — the hook simply never runs, and `schema-auditor`'s fence in front of the Neon **production**
connection string quietly stops existing. It is the same shape as the YAML parse failure in
`tasks/lessons/2026-08-31-a-config-file-whose-parse-failure-is-silent-needs-a-test-that-parses.md`: a
config this repo writes, a parser it does not control, absence as the symptom.

## What was done instead, and what it costs

Both remaining hooks use `matcher: Bash|PowerShell|BashOutput|KillShell` — the verified shape,
covering every tool that can run a command line. Two costs, both accepted deliberately:

1. **`SHELL_TOOLS` in `.claude/hooks/agent-guard.mjs` is now duplicated as that matcher, in two
   files.** A tool added to the set but not the matchers is a hook that never fires for it. Named at
   the source in both places. This is the repo's recurring divergence defect, taken on knowingly
   because the alternative is an unverified fence.
2. **`schema-auditor`'s allowlist can no longer fire for non-shell tools.** The guard would deny
   `Write` or `WebFetch` for that agent, but the hook is not invoked for them. That is a contract
   violation left unenforced, not a RISK VETO §1 exposure — the production connection string is only
   reachable through a shell, and shells are covered.

## Agent-checkable trigger

In a session started **after** the definitions carried this wiring (agent definitions are loaded at
session start — `tasks/decisions/2026-08-31-agent-definitions-are-session-start-snapshots.md`):

```bash
# 1. run schema-auditor on anything, then:
cat "$TEMP/claude-agent-guard.log"      # Windows; $TMPDIR elsewhere
```

**Expected:** a `schema-auditor Bash` line, and a denial visible in the agent's own transcript.
**If no line appears:** the alternation matcher does not fire either, and the guard has never worked
for this agent — which would also mean the 2026-08-30 line was luck, not evidence.

## Settles when

A line appears for `schema-auditor` or `atomic-commit` under the alternation matcher, **and** a
second session tries a matcherless entry and gets a line for a non-shell tool. Then the matcher can
be dropped, both duplications collapse, and cost 2 above disappears.

Until then: **do not remove the matcher to tidy the duplication.** The duplication is the cheaper
defect.

---

## 2026-09-05 — `settings.json` wiring measured; this entry is NOT settled by it

A `PreToolUse` hook wired in `.claude/settings.json` with `matcher:
"Bash|PowerShell|BashOutput|KillShell"` **fired**, and a `PostToolUse` hook with `matcher:
"Edit|Write|NotebookEdit"` fired too:

    2026-09-05T02:34:28.197Z main Bash
    2026-09-05T02:43:24.888Z main Write

**And `settings.json` hooks hot-reload mid-session** — the wiring was added one tool call before
the first line appeared. Frontmatter hooks do not
(`tasks/decisions/2026-08-31-agent-definitions-are-session-start-snapshots.md`). **The two wiring
surfaces have different liveness rules**, which was not previously recorded anywhere; this entry's
session-start caveat applies to frontmatter only.

**Why this does not settle the entry:** the measurement is of `settings.json`, while the open
question is *frontmatter* wiring for `schema-auditor` and `atomic-commit`, which have still never
produced a line. It also does not test a matcherless entry. Both settle conditions stand unchanged.

---

## 2026-10-21: a matcherless `settings.json` entry fires for non-shell tools

In a headless session on Claude Code 2.1.304, a `PostToolUse` entry with no `matcher`, wired in
`.claude/settings.local.json` of a clean clone, logged one line for each of `Read`, `Grep` and
`Glob`. That is the second half of the settle condition above, for `settings.json`-style wiring.
The context meter's `PostToolUse` entry relies on it (it must see every tool, not only shells and
edits). The first half, frontmatter wiring for `schema-auditor` and `atomic-commit`, is still
unobserved, so this entry stays open and the matcher in their frontmatter stays.
