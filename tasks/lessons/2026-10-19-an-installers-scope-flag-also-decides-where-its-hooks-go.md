# An installer's scope flag also decides where its hooks go, and it may delete a project file

**Learned:** 2026-10-19

`npx impeccable@4.6.0 install --providers=claude --scope=global --force -y` was run to update the
user-level skill. Its output said only "Installed hooks into: .claude". In fact it had done three
things:

- deleted this checkout's `.claude/settings.local.json`, which held the old impeccable hook and
  nothing else;
- written that hook into `~/.claude/settings.json`, where it fires in every project on the machine;
- added four agents to `~/.claude/agents/`.

The deleted file only showed up because checksums of the settings files had been taken before the
run. The fix is recorded in `tasks/decisions/2026-10-19-impeccable-hook-is-project-local.md`.

**Rule:** before running any tool's installer or updater:

- checksum every settings file it could touch: `.claude/settings*.json`, `~/.claude/settings.json`,
  `.codex/hooks.json`;
- list `~/.claude/agents` and `~/.claude/skills`;
- diff all of it afterwards and read the diff before moving on;
- pass the narrowest flags the tool offers (`--providers=…`, and `--no-hooks` when the hook belongs
  somewhere else).
