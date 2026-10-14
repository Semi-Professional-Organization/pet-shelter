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

**The hook is not being called at all — and its own files already show it.** The script
`.claude/hooks/agent-guard.mjs` exists and `.claude/settings.json` references it, so it is
configured. And it leaves a trace that settles whether it runs: every invocation appends a line to
`claude-agent-guard.log` **unconditionally** — `log(...)` at line 152 of the script, before the
`PostToolUse` branch at line 168. That file was last written at 2026-10-13T16:57Z. So the script
has not been invoked by any session since. That rules out every explanation that needs the script
to run — exiting early, a held file handle, a bad drift-log path — and leaves the ones where it is
never invoked: the hook not being loaded, its matcher not firing, or the command failing before
the script starts.

A weaker trace agrees. The per-session state file, `claude-agent-drift.<session>.state`, exists for
`1c022c97` only. It is weaker because it is written *inside* the `PostToolUse` branch, after a
`git status` call in a `try` (line 200), so its absence alone could mean `git status` failed rather
than that the hook never ran. The liveness log has no such condition.

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
and an empty result looks the same whether a session was quiet or the hook never ran. **There is a
cheap way to tell them apart at close-out:** check the modification time of
`%TEMP%\claude-agent-guard.log` (`$TMPDIR` elsewhere). If it is older than your session's first
tool call, the hook did not run for you, and the drift log's silence means nothing. Then account
for touched paths with `git status` and the branch diff against `origin/master`, as the PR #42
session did.

**Settles when:** the hook is invoked again — which the liveness log shows directly, so no separate
experiment is needed to *detect* the fix — and the cause is recorded: why a configured hook stopped
being called around 2026-10-13T16:57Z. **A committed change is ruled out:** the last commit to
touch `.claude/settings.json` or `agent-guard.mjs` on `master` is from 2026-09-09, a month earlier.
That leaves what git does not record — uncommitted `.claude/settings.local.json`, the user-level
settings, or how the harness loads project hooks — and a session that can inspect its own active
hook configuration is better placed to check than one reading files after the fact.
