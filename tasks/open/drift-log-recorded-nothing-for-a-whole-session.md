# The drift log recorded nothing for an entire GRAVE session

**Status:** open · opened 2026-09-22 · observed, not inferred

Step 2 of the close-out in `CLAUDE.md` says to read the write-path drift log filtered to your own
session and account for every path in it. For the session that built the bulletin server store
(branch `worktree-bulletins-76`), that filter returned **zero lines**:

    $ grep -c "<this session's uuid>" "$TEMP/claude-agent-drift.log"
    0

    $ tail -1 "$TEMP/claude-agent-drift.log"
    2026-09-21T14:55:50.079Z 60c30e3b-… claude Bash M tasks/todo.md

The most recent entry in the whole file predates the session by a day, so this is not "the session
made no writes the matcher covers" — the session made dozens, including `cat >`-style writes
through Bash, which is precisely the case the log exists to catch. The hook did not fire at all.

`AGENTS.md` already warns that an empty log is evidence of no *observed* drift rather than of none.
What is new here is that the log was empty for a session that definitely wrote, which makes the
step a no-op rather than a weak check — and it fails silently, exactly like the matcher problem in
`matcherless-hook-wiring-unverified.md`. That entry is about `PreToolUse` matcher *shapes* and the
liveness log; this one is about the write-path log not running at all. They may share a cause.

Two candidate causes, neither tested:

1. The session ran as a **background job** in a **git worktree** under `.claude/worktrees/`, and
   the hook may be wired relative to the main checkout.
2. The hook may not be registered for this harness configuration at all.

The session closed without the check by accounting for paths the other way — `git status` was
empty, so every file touched is in a commit — which happens to be a stronger check for *this*
session but does not generalise: it cannot see a write that was made and then reverted, which is
the "while I am here" edit the log is meant to surface.

**Settles when:** a session in a worktree makes a Bash write and a line for it appears in the log
under that session's id — or the close-out step is changed to name a check that actually runs
here, and the reason the log does not is recorded.
