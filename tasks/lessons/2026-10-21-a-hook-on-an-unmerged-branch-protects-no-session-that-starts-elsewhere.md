# A hook on an unmerged branch protects no session that starts elsewhere

**Learned:** 2026-10-21

The thread building the context meter ran from 300K to 514K without a single line from it, and
noticed only when it ran `node scripts/agent.mjs meter` by hand. Project threads start in the main
checkout, on `master`; the meter's hooks lived in the clone's `.claude/settings.json`, on the
branch. Claude Code reads hooks from the folder a session starts in, so the tool the thread was
building could not warn the thread building it, and the hand-off came after the owner's 500K
level instead of at it.

**Rule:** until a hook is on `master`, a session that depends on it checks by hand. For the meter:
run `node scripts/agent.mjs meter` from the clone at each milestone and after any large read, and
act on the owner's levels as if the line had come.
