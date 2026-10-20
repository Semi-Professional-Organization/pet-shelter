# Hand-off: Context meter PR 2

**Status:** open · opened 2026-10-21

- **From session:** `5fbaaa5d-b8d9-4631-a7c3-ee9bba240350`, whose transcript `node scripts/agent.mjs recall <term>` searches.
- **Where:** `C:/Users/User/AppData/Local/Temp/claude/D--Dev-Repos-pet-shelter/5fbaaa5d-b8d9-4631-a7c3-ee9bba240350/scratchpad/ps` on `claude/project-thread-n57o1i` at `d9a5cc9`; 3 ahead and 0 behind `origin/master`; 0 uncommitted paths.
- **Context at hand-off:** 449K tokens on claude-opus-5-5.

## Decided

- A hand-off is `tasks/open/HANDOFF-<slug>.md`: an open entry, never mirrored to an issue
  (`scripts/ledger-issues.mjs`), deleted by the session that finishes the work (`tasks/README.md`).
- Hooks: the meter has its own `PostToolUse` entry with no matcher (seen firing after Read, Grep and
  Glob on Claude Code 2.1.304), plus `UserPromptSubmit`; `SessionStart` runs
  `orient --brief --hook`. Any command line with `--hook` exits 0 and prints nothing on failure
  (`cli()` in `scripts/agent.mjs`), because exit 2 on `UserPromptSubmit` drops the person's message.
- No Stop hook: the catalog's design lists three hooks, and kill condition 3 in
  `tasks/open/agent-scripts-must-cut-what-a-session-costs.md` decides whether one is needed.
- The CLAUDE.md step 6 scope rule the brief assigned here is already on master from #143.
- Review round 1 (`/code-review high`): 10 findings, all in scope, all fixed in `d9a5cc9`, each fix
  shown caught by a test with a mutant.

## Open

- Review round 2 has not run. Stop rule (CLAUDE.md step 6): stop after two consecutive rounds with
  no in-scope correctness finding; ask the owner at round 8.
- The PR is not open yet (review comes first). The body is drafted at
  `<scratchpad>/pr-body.md`; update it: the cold-resume replay is now through the meter's own code
  (122 messages, 30 cold, 92 warm, all right), the meter's PostToolUse entry has no matcher, and
  SessionStart runs `orient --brief --hook`.
- Close-out not done: tick the todo stream and write its Review section; the lesson "price a call
  by the context it re-reads, not by what it prints" is not written yet; delete this file at close.
- Follow-up for the PR body: `permissions.allow` holds `"gh pr merge"`, which Claude Code skips as
  invalid.

## Next step

Run `/code-review high origin/master...HEAD` with the clone's folder named in the arguments, and
"never touch D:/Dev/Repos/pet-shelter" (lesson `2026-10-20-a-forked-review-may-run-where-the-session-started`).

## Paths

- `<scratchpad>` is `C:/Users/User/AppData/Local/Temp/claude/D--Dev-Repos-pet-shelter/5fbaaa5d-b8d9-4631-a7c3-ee9bba240350/scratchpad`.
  The clone `<scratchpad>/ps` has `node_modules` and is on the branch, pushed. Never edit
  `D:/Dev/Repos/pet-shelter`: other threads share it.
- Code: `scripts/agent/{meter,orient,ledger,recall,handoff,transcript}.mjs`, `cli()` in
  `scripts/agent.mjs`, hooks in `.claude/settings.json`; tests in `tests/unit/agentMeter.test.ts`
  and `tests/unit/agentHandoff.test.ts`.
- Replays: `<scratchpad>/replay/replay.mjs` (reading against usage) and `cold.mjs` (cold call
  through the meter's code); run as `node replay/cold.mjs <clone>/scripts/agent` with forward slashes.
- Mutation probes: `<scratchpad>/probes*.mjs`. Commit messages: `<scratchpad>/msg1-3.txt`.

## Commands and results

- `npm test`: 2287 pass. `typecheck`, `lint`, `docs:check`: exit 0 at `d9a5cc9`.
- `test:components` 281 pass, `test:integration` 93 pass, `build` exit 0, all at `96b7abb`; the
  fix round touched no app code. Build env: random `SESSION_SECRET`, `ADMIN_SECRET_KEY`,
  `STAFF_INVITE_SECRET`, with `DATABASE_URL=""` and `RESEND_API_KEY=""`; nothing listens on 5432.
- Replay: the meter's reading equals `usage`'s on 18 of 18 transcripts; the next prompt exceeds the
  reading by p50 281, p90 1.5K, p99 6.5K, max 90K tokens.
- Headless `claude -p ... --model haiku` in the clone, with a probe `settings.local.json` feeding an
  old 892K transcript to the meter: the orient, cold-resume and level lines all reached the model.
- `git merge-tree --write-tree HEAD origin/master`: clean at `96b7abb`.

## Verified

Everything under Commands and results. Not verified: the hooks inside the desktop app (only the
headless CLI was run); a real cold resume end to end (only an old transcript fed to the hook); the
full seven gates after `d9a5cc9`, which close-out must re-run.

**Settles when:** the session that continues this work closes it and deletes this file.
