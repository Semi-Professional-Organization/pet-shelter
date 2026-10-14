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
configured. It also keeps a liveness log, `claude-agent-guard.log`, appended by `log(...)` at line
152, before the `PostToolUse` branch at line 168. That file was last written at
2026-10-13T16:57Z — so no invocation that reached line 152 has happened since. **That is all it
proves.** Two gaps stop it proving more:

- **It is not written on every invocation.** If the hook's input fails to parse, the script calls
  `allow()` — `process.exit(0)` — at about line 117, *before* `log()`, and writes nothing. And
  `log()` swallows a failed append. So a changed or empty payload from the harness would leave the
  script running and the liveness log silent. (The comment on that exit says "Fail open, loudly";
  it is silent.)
- **It moves with the drift log.** Both default to `tmpdir()`, but each is overridden first by an
  environment variable — `AGENT_GUARD_LOG` and `AGENT_DRIFT_LOG` (lines 61 and 73). So a different
  temp directory, or either variable set for the hook process, would send both logs somewhere else
  and freeze this copy of each — exactly what is observed. The liveness log also begins only at
  2026-10-13T14:46Z, though nothing rotates it, so it was recreated around then too. That fits a
  temp-directory change or clean-up as well as it fits "not invoked".

So four candidates stay open: the hook not being invoked; its payload no longer parsing; its temp
directory having moved; or `AGENT_GUARD_LOG` / `AGENT_DRIFT_LOG` set in its environment. The per-session state file, `claude-agent-drift.<session>.state`, adds
nothing decisive — it exists for `1c022c97` only, is written inside the `PostToolUse` branch after
a `git status` in a `try` (line 200), and lives in the same `tmpdir()`.

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
and an empty result looks the same whether a session was quiet or the hook never ran.

**Do not use the liveness log to tell which.** Its lines are `timestamp agent tool` with no session
ID, so a hook firing for *any* concurrent session refreshes it — a session whose own hook is silent
would see a fresh file and wrongly trust its empty drift output. The only evidence keyed to one
session is its state file, `claude-agent-drift.<session-id>.state` in the same directory: if yours
exists, the hook reached the drift branch for you at least once; if it does not, that is ambiguous —
the hook may not have run, or its `git status` may have failed. Neither proves the drift log is
complete. So account for touched paths with `git status` and the branch diff against
`origin/master` regardless, as the PR #42 session did.

**Settles when:** the cause is found among the four — confirmed by something that can see past the
liveness log, such as the hook's resolved temp directory, its log-path environment variables or
the raw payload it receives — and the
drift log is writing again. Detecting the fix needs no separate experiment, since fresh liveness and
drift lines will show it, but a stale liveness log alone cannot say which cause it was. The silence
began around 2026-10-13T16:57Z.

One thing is ruled out for all four: **a committed change.** The last commit to touch
`.claude/settings.json` or `agent-guard.mjs` on `master` is from 2026-09-09, a month earlier. Every
remaining candidate lives where git does not look — uncommitted `.claude/settings.local.json`, the
user-level settings, the environment the harness gives the hook process, or how the harness loads
and feeds project hooks. A session that can inspect its own active hook configuration and
environment is better placed to check than one reading files after the fact.
