# The drift log has recorded nothing from any session since 2026-10-13

**Status:** open · opened 2026-10-14 · rewritten 2026-10-14 after its first version was wrong

Step 2 of the close-out in `CLAUDE.md` is "read the drift log, filtered to your own session, and
account for every path in it". As of 2026-10-14 that step is vacuous for every session, not just
one.

What `claude-agent-drift.log` actually contains, measured directly:

- **161 lines, all from one session** (`1c022c97-…`), and only one distinct session ID in the whole
  file.
- **The first line is 2026-10-13T15:09:34Z and the last is 2026-10-13T16:37:18Z** — ninety minutes.
- **The file's modification time is the moment of that last line** (16:37:18Z, which is 00:37 on
  2026-10-14 in Kuala Lumpur). Nothing has been written to it since, although several sessions
  have written hundreds of files in the day after.

`AGENTS.md` describes this file as "shared across sessions, days and checkouts, and … never
rotated". A log that holds ninety minutes from one session and nothing older therefore looks to
have been recreated around 15:09Z on 2026-10-13, then gone quiet about ninety minutes later.

**What was checked and is not the cause:** the hook script `.claude/hooks/agent-guard.mjs` exists,
and `.claude/settings.json` references it. So it is configured. Why it stopped writing — a changed
`TEMP` path, the hook exiting early, a matcher no longer firing, the file being held open — is not
known, and nothing here has tested any of those.

## Correction

The first version of this entry, filed earlier the same day, compared the PR #42 session's zero
lines against the 161 lines for `1c022c97` and blamed the difference on how that session had
entered its worktree (mid-session, via `EnterWorktree`, from a directory that was not a registered
worktree). That comparison was meaningless. The 161 lines all fall inside a ninety-minute window in
which the PR #42 session wrote nothing, and every write it made — before and after — falls outside
the only window the file covers. It was not singled out; nobody is logged. A review of the branch
carrying the entry caught it.

**Why it matters.** The drift log is the close-out's only mechanical check for a "while I am here"
edit. `AGENTS.md` already warns that an empty filter result means "no *observed* drift, not none",
but a reader at close-out has no way to tell a quiet session from a log that has stopped
recording. Until this is fixed, account for touched paths with `git status` and the branch diff
against `origin/master`, as the PR #42 session did.

**Settles when:** someone starts a fresh session the ordinary way, makes one write through a
matched tool, and checks whether a line appears. If it does not, the hook is broken for everyone
and the cause above needs finding. If it does, the silence is specific to how the earlier sessions
ran, and this entry should say what that was. Either way, record where the log is being written
and confirm it is the path `AGENTS.md` names.
