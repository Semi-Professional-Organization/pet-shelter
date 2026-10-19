# Impeccable's design hook runs for this project only, from a user-level skill

**Decided:** 2026-10-19

Impeccable 4.6.0 (engine 0.1.15) is installed once per machine at `~/.claude/skills/impeccable`, by
its own installer: `npx impeccable@4.6.0 install --providers=claude --scope=global --force -y`. The
same run added four helper agents, `~/.claude/agents/impeccable-*.md`, which the skill's finish
handoffs call. Its design-detector hook — `SessionStart`, `PostToolUse` on `Edit|Write`, and `Stop`
— is wired in this checkout's gitignored `.claude/settings.local.json`, pointing at the absolute
launcher path, and nowhere else.

**Why not the global hook the installer writes.** With `--scope=global` the installer deleted this
checkout's `.claude/settings.local.json` (it held only the previous impeccable hook, whose
`${CLAUDE_PROJECT_DIR}/.claude/skills/impeccable/…` path had stopped existing when the skill moved
to the user level on 2026-09-07, so that hook had been silently doing nothing) and wrote the hook
into `~/.claude/settings.json`. There it fires in every project on the machine: piped a
`PostToolUse` payload through it in an unconfigured scratch project on 2026-10-19, and it reported a
finding and created `.impeccable/hook.cache.json` in that project. Consent for the hook was given
for this project only (`.impeccable/config.local.json`, 2026-09-06), so the hook was moved back.

**Why not the Claude Code plugin.** Impeccable also ships as a plugin
(`claude plugin marketplace add pbakaus/impeccable`, then `claude plugin install
impeccable@impeccable`), with the same three hooks keyed to `${CLAUDE_PLUGIN_ROOT}`. Its README
recommends the CLI installer instead, and a plugin next to the user-level skill would load two
copies. Switching is reasonable if marketplace auto-update is wanted: install the plugin, delete
`~/.claude/skills/impeccable` and `~/.claude/agents/impeccable-*.md`, and drop the three hooks from
`.claude/settings.local.json`, since the plugin brings its own.

**Hallmark** (`nutlope/hallmark` v1.1.0) has no plugin form. It stays a user-level skill at
`~/.claude/skills/hallmark`, whose `SKILL.md` was identical to upstream `main` on 2026-10-19.

**Updating later:** `npx impeccable@latest install --providers=claude --scope=global --force -y`
followed by the same move of the hooks, or the same command with `--no-hooks`, which leaves the
project manifest alone (`--no-hooks` is documented by `install --help`; not yet run here).
