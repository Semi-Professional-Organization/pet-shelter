# The drift log recorded nothing for an entire session that wrote hundreds of files

**Status:** ASSERTED · opened 2026-10-14 · found during the close-out of PR #42

Step 2 of the close-out in `CLAUDE.md` is "read the drift log, filtered to your own session, and
account for every path in it". For the session that worked PR #42 — a background job, running in
`.claude/worktrees/pr-42-birth-date`, active from 2026-09-22 to 2026-10-14 — that step was vacuous.
`claude-agent-drift.log` holds **zero** lines for it, across hundreds of `Bash`, `Edit` and `Write`
calls, including `sed -i`, heredoc and `node -e` writes.

That is not a filtering mistake. Checked three ways:

1. No line carries the session's UUID (`ce7c7635-e65b-423d-9cd8-aafc95b52973`, read from its own
   tool-results path as `AGENTS.md` prescribes).
2. No line, under *any* session ID, names a file only that session wrote — four ledger and lesson
   files with distinctive names were searched for and none appears.
3. No line mentions the `pr-42-birth-date` worktree path.

**The hook is not simply off.** In the same 24 hours the log recorded 161 lines for one other
session, `1c022c97-…`, which was *also* a background job in a worktree
(`worktree-pet-birth-date-migration`) writing to overlapping files — `src/actions/pets.ts`,
`prisma/migrations/manual/20260922_pets_birth_date/*`. Same session type, opposite result. At least
two further sessions were active in that window and also appear nowhere, so the PR #42 session is
not the only one missing; it is the one that went looking.

**Belief, not observed — the difference may be how the worktree was entered.** How the logged
session started was never checked; that it began inside its worktree is a guess. What *is* known is
how the silent one started: in `.claude/worktrees/e2e-local-database-only`, a
directory that existed on disk but was *not* a registered worktree, so git resolved it to the main
checkout (`tasks/lessons/` and memory both record that trap); it then switched into its real
worktree mid-session via `EnterWorktree`. If hooks are bound to the directory a session starts in,
that would explain it. Nothing here has tested that.

**Why it matters more than a missing log line.** The drift log is the close-out's only mechanical
check for "while I am here" edits. `AGENTS.md` already warns that an empty log means "no *observed*
drift, not none" — but a reader at close-out sees an empty filter result and has no way to tell a
quiet session from a session the hook never saw. The PR #42 session accounted for its paths from
`git status` instead, which works only because everything it touched was committed.

**Settles when:** someone starts a session the way this one did — in an unregistered worktree
directory, then `EnterWorktree` into a real one — makes one write, and checks the log. If the line
is missing, the cause is confirmed and the close-out step needs a fallback written into it. If it is
present, the cause is something else and this entry should say so before anyone builds on it.
