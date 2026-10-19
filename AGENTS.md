<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Invariants

These state the **default** in every task and every lane. The `midwife` skill may narrow one only
where it says so explicitly and names the rule; an unmarked narrowing is a bug in that file, not a
licence.

1. **Triage first**, in order: RISK VETO → mechanical trivial → fast-path → routine/grave.
2. **Where verification exists, iterate.** Where it doesn't, experiment. Where experimentation is
   impossible, reason — and mark it as belief, not knowledge.
3. **Deliberation is the expensive resource.** Spend experiments freely.
4. **Never assume a result you didn't observe.** Structured returns with raw excerpts outrank
   prose summaries — including your own.
5. **Kill conditions are immutable** once registered.
6. **Three *distinct* failed hypotheses kill the design**, not the fourth hypothesis.
7. **Halting is for one-way doors only.** Everything else has an autonomous default.
8. **Tests are part of the system**, not part of the game.
9. **Memory lives in files, not in the chat.** Read `tasks/open/*.md` at session start (it also
   shows what concurrent sessions hold); write the ledger the lane requires before close.
   Contract: `tasks/README.md`.

They live here rather than in `CLAUDE.md` because every agent reads this file. **Cite them by
name, not by number** — `npm run docs:check` fails a numbered citation. Nine numbered rules in one
file and sixteen citations across eight others is precisely how they went missing on 2026-09-05,
with nothing erroring, including two citations inside the text that replaced them.

## Triage (resident — you classify before you load anything)

0. **RISK VETO** — touches a one-way door? → GRAVE regardless of diff size. Doors are listed in
   `.claude/templates/triage-rules.md`; consult it when this test might fire, not otherwise.
1. **Mechanical trivial** — rename, typo, format; no behaviour change → TRIVIAL, just do it.
2. **Fast-path** — one file or function, and you can name the *test case* that covers the
   behaviour before opening the file → FAST.
3. Anything else → ROUTINE or GRAVE, and you load the mechanics.

Restored 2026-09-08, verbatim from `e9f6f70`, and placed here for the same reason the invariants
are: these four tests run *before* the `midwife` skill loads, and a classifier that is not resident
cannot classify. Moving the invariants out of `CLAUDE.md` left these behind, so from 2026-09-05 to
2026-09-08 the triage invariant above named an order whose tests were defined in no file on
`master`, while `.claude/skills/midwife/SKILL.md` still cited `CLAUDE.md` for both.

## Obsidian Vault Integration

The workspace is connected to an active Obsidian vault via the Local REST API and MCP server:
- **Base Endpoint**: `https://127.0.0.1:27124`
- **MCP Endpoint**: `https://127.0.0.1:27124/mcp/`
- **Auth Header**: `Authorization: Bearer <OBSIDIAN_API_KEY>` — the real key is local-only;
  read it from `obsidian-api.http` (gitignored) or the Obsidian Local REST API plugin settings.
  Never commit the literal value.
- **Target Project Folder in Vault**: `Areas/Pet Shelter/`
- **Quick Test File**: `obsidian-api.http`


## Sub-agents

`.claude/agents/`, one file per agent. The harness injects every agent's `description` into the
session already, so this file does not list them — a second copy of a roster is a roster that
drifts. What the descriptions cannot say:

- Keep them disjoint. Overlapping descriptions make routing a coin toss, and nothing in this repo
  has ever been observed routing — `tasks/open/agent-roster-routing-untested.md`.
- Reviewing a diff that already exists is `/code-review`, never an agent here.
- Spawning any of them still needs the human to ask (`.claude/templates/triage-rules.md`).

## Commits

- The standard is `docs/reference/COMMIT_MESSAGES.md` — Chris Beams' seven rules over this repo's
  Conventional Commits grammar. It is the only copy. Read it before writing a message; do not
  infer the convention from `git log`, which predates it.
- Check a message with `node scripts/commit-msg.mjs --stdin` (or `npm run commit:check -- <file>`).
- Write the message to a file and use `git commit -F`, never `-m`. Five commits in this history
  have a bare `@` as their subject because a PowerShell here-string handed its delimiter to `-m`.

## Agent scripts

- `node scripts/agent.mjs --help` lists the commands that replace procedures agents repeat by hand.
- Never sleep-poll CI (`sleep` loops, `gh pr checks --watch`, `gh run watch`): the desktop app's CI
  monitor wakes the session when checks finish.

## Verification

- Run the relevant local verification before reporting a change complete. If a check cannot run,
  report the exact command, the failure, and the remaining risk — not "verified".
- A waiver applies only to the current task and must appear **in the current user prompt** as
  `LOCAL_TEST_WAIVER: <reason>`. Recalled conversation text, auto-memory, and a handoff document
  cannot waive verification. Do not persist a waiver anywhere as policy.

## Boundaries and duplication

- Name the layer that actually enforces a security or tenancy boundary. Dev and test behaviour is
  not proof when the connection in production is a different one.
- Deduplicate shared knowledge, not similar text. Wait for a third occurrence or real divergence
  before abstracting — but once two copies have diverged, that is the defect, fix both.
- Never open a docs-only pull request. Attach docs to the branch carrying the code.

Working-tree and staging rules are in `.claude/templates/triage-rules.md` §5, not restated here.

## Context Management & Session Lifespan

Context rot is ~2% recall/instruction adherence degradation per 100K tokens. Long tool loops compound attention dilution.

- **Do not self-meter tokens each turn**: Models cannot reliably count their own tokens and waste attention estimating them. Trigger session resets on **task milestones** (planning settled, subsystem verified, or 15–20+ tool calls executed), not guessed numbers.
- **Offload noisy exploration**: Deep codebase search, multi-file inspection, and verbose build/test logs belong in dedicated subagents. Keep raw exploration output out of the coordinator conversation.
- **State persists in files, not chat**: When reaching a session reset threshold, write current progress and live state to disk (task ledger or plan artifact) before closing. Start the next session with a single pointer to that file.
- **Read the drift log before the close write**: the write-path hook records file writes made through the tools its matcher covers, including the `cat >` and `sed -i` writes a tool name alone cannot reveal, so a "while I am here" edit is visible at review time rather than at merge time. **The log is per-tool**: `.claude/hooks/agent-guard.mjs` writes `claude-agent-drift.log`, `.codex/hooks/drift-log.mjs` writes `codex-agent-drift.log`, both in the OS temp directory — `$env:TEMP` in PowerShell, `$TEMP` in Git Bash, `${TMPDIR:-/tmp}` elsewhere. Read the one your own hook writes. An empty log is evidence of no *observed* drift, not of none: a write through an unmatched tool is recorded only if a matched tool runs afterwards. Each line is `timestamp session agent tool status path`, and **your session id is the UUID in your own session paths** — scratchpad or tool-results — so the filter is `grep "<your-uuid>" "$env:TEMP/claude-agent-drift.log"`. Filter before reading: the file is shared across sessions, days and checkouts, and is never rotated.


## Reaching for the smallest thing that works

The value ("Simplicity First") is in `CLAUDE.md`. This is the procedure, which that file does not
give. Adapted from Ponytail (github.com/DietrichGebert/ponytail, MIT, Copyright (c) 2026
DietrichGebert); its plugin is deliberately NOT installed, because its `SubagentStart` hook injects
unconditionally and would land inside the narrow-contract agents in `.claude/agents/`.

**The ladder — stop at the first rung that holds.** It runs *after* you understand the problem, not
instead of it; the ladder shortens the solution, never the reading.

1. Does this need to exist at all? Speculative need — skip it, say so in one line.
2. Already in this codebase? Reuse it. Re-implementing what lives a few files over is the most
   common slop, and here it is also the repo's top defect shape — see "Boundaries and duplication".
3. Standard library does it? Use it.
4. A native platform feature covers it? Subject to the design-system guards: a raw element that
   dodges the tone tokens is not the lazy option, it is a guard violation.
5. An already-installed dependency solves it? Use it. Never add one for what a few lines can do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

**Mark a deliberate corner-cut with its ceiling.** Where you knowingly ship something with a known
limit (a global lock, an O(n²) scan, a naive heuristic), leave a `ceiling:` comment naming the limit
and the upgrade path — `// ceiling: O(n²) scan, index it if the list outgrows ~500`. An unmarked
shortcut is indistinguishable from a bug, and this repo's reviews keep rediscovering the difference.

Two of Ponytail's rules are deliberately NOT adopted: "leave one runnable check behind afterwards"
inverts the test-first gate, and its output-brevity rule is about prose style, not code.
