# The write-path hook writes nothing at all for some sessions, so their drift cannot be read

**Status:** open · opened 2026-09-22 · observed at `8d36ace` from a linked worktree · cause still
not established; the last section records what the session transcripts show

`AGENTS.md` ("Read the drift log before the close write") and `CLAUDE.md` close-out step 2 both
require a session to filter `claude-agent-drift.log` by its own id and account for every path. A
session that made three commits across eleven source files on 2026-09-22 could not: **its id appears
in no drift file at all, and none of the files it created appear either.**

## What was observed

The session id is `a17e9995-a38a-45f4-90a8-3c549790d98a` (the UUID in its own
`.claude/projects/.../tool-results/` path, which is the filter `AGENTS.md` prescribes).

    grep "a17e9995-a38a-45f4-90a8-3c549790d98a" "$TEMP/claude-agent-drift.log"   -> no lines
    grep -rh "homeAnchors|homeMalay|heroDialogMounts" "$TEMP"/*drift*            -> no lines
    ls "$TEMP/claude-agent-drift.a17e9995-"*.state                               -> no such file

Those three files were created in that session and committed. The shared log's newest line is

    2026-09-21T14:55:50.079Z 60c30e3b-8a59-44b4-bd50-bada923361d5 claude Bash M tasks/todo.md

i.e. nothing has been appended for about two hours of continuous tool use across several sessions.

**The hook is wired.** `.claude/settings.json` binds `PostToolUse` with matcher
`Edit|Write|NotebookEdit|Bash|PowerShell|BashOutput|KillShell`, and `.claude/hooks/agent-guard.mjs`
exists and is executable.

**Correction, 2026-10-14: an earlier version of this entry said "The hook is firing", and that was
not established.** It rested on `$TEMP/claude-agent-guard.log` growing during the session — but a
guard line is `<timestamp> <agent> <tool>` with no session id, so lines written then could have
come from any session on the machine. Correlation in time was read as attribution. See the
controlled test below, which points the other way.

**The state file written at that moment belongs to a different session, and is empty.** The only
`claude-agent-drift.*.state` touched on 2026-09-22 is

    -rw-r--r-- 1 User 0 2026-09-22 01:17  claude-agent-drift.44dc9b6b-b166-453b-a37b-cb750a6c5686.state

`44dc9b6b…` is the session that wrote `tasks/open/hero-mounts-a-quiz-and-sponsor-dialog-nothing-can-open.md`
on 2026-09-17. It is not the session running at 01:17. The file is **zero bytes**, so the
`git status --porcelain -uall` the hook ran at `:170` returned nothing for its `ROOT`.

## Why this is worse than an empty log

`AGENTS.md` already warns that an empty log is evidence of no *observed* drift rather than none.
This is a different failure: the log is not merely missing writes, it is **misattributing the
session**, and a zero-byte state file means the next call re-establishes a baseline and
"attributes nothing" by design (`:200`). A reader who follows the documented procedure — filter by
my uuid, find nothing, conclude no drift — gets a clean bill of health that was never checked.

The same hole has a second victim already. On 2026-09-22 around 00:50 local, an unidentified
session edited `src/components/layout/Hero.tsx` and wrote
`tasks/decisions/2026-09-22-hero-removes-dead-dialog-mounts.md` **in the shared checkout on
`master`**, uncommitted. Nothing in any drift log records it, so the session responsible could not
be identified from the log; a peer session was asked and confirmed it was not theirs. The log's
whole purpose is to answer exactly that question at review time.

## A controlled test, 2026-10-14

The same session, resumed three weeks later, still had no line in the drift log and no state file
under its own id. By then the log was being written again — its newest line belonged to another
session, `1c022c97…`, at 2026-10-13T16:37Z — so the log is not down globally, as the 2026-09-22
observation alone could suggest. Whatever this is, it is specific to some sessions.

The guard log was then counted, one Bash call made, and counted again:

    claude-agent-guard.log   before: 140 lines   after: 140 lines
    newest guard line        2026-10-13T16:57:24Z    ("now" was 2026-10-14T12:11Z)

**The hook wrote nothing for that call.** `log()` runs on every `PostToolUse` before the drift
branch, so a hook that ran at all would have added a guard line. Either it did not run for this
session, or it wrote somewhere else. The second was checked and ruled out: `os.tmpdir()`, `$TEMP`
and `$TMP` all resolve to `C:\Users\User\AppData\Local\Temp`, and no other
`claude-agent-guard.log`, `claude-agent-drift.log` or drift state file exists under the OS temp
directory or the session's job directory.

The only drift state file touched while this session ran was again another session's (`1c022c97…`,
0 bytes). With the controlled test in hand that is best read as that session's own activity, not as
misattribution of this one's.

## Not established

**Superseded by the controlled test above, kept for the record:** the earlier guess was that
the cause is `ROOT` or `session_id` arriving wrong in the hook payload. If the hook does not run
for the session at all, neither field is reached. `ROOT` is `input.cwd || CLAUDE_PROJECT_DIR || process.cwd()` (`:123`) and `SESSION` is
`input.session_id || "nosession"` (`:144`); both come from the harness payload, which was not
captured. The stale-but-current-mtime state file under another session's id is consistent with
`session_id` being wrong, and the zero-byte content is consistent with `ROOT` pointing at a clean
tree — but neither was measured, and they are not necessarily the same fault.

**Why the hook does not run is not established.** This session is both a background job and
isolated in a linked worktree under `.claude/worktrees/`; the sessions observed writing to the log
may be neither. Which property matters — or whether it is a third thing — is untested, and needs a
session that is one without the other. The 2026-09-08 lines in the shared log carry no uuid field at all, so the attribution
field is newer than most of the file.

## A second session, observed independently

The session that built the bulletin server store (branch `worktree-bulletins-76`, merged as #103)
filed its own entry at this same path, written without knowing of this one; the two met as an
add/add conflict when `master` was merged into this branch on 2026-10-15. Its observation, kept
here rather than dropped:

    $ grep -c "<this session's uuid>" "$TEMP/claude-agent-drift.log"
    0

    $ tail -1 "$TEMP/claude-agent-drift.log"
    2026-09-21T14:55:50.079Z 60c30e3b-… claude Bash M tasks/todo.md

That session also wrote dozens of files, including `cat >`-style writes through Bash, the case the
log exists to catch. It too ran **as a background job in a git worktree under
`.claude/worktrees/`** — so both observed instances share both properties named under "Not
established" above, and neither separates them. It added a point this entry did not make: closing
by `git status` instead (empty, so every touched file is in a commit) is a stronger check for one
session but does not generalise, because it cannot see a write that was made and then reverted —
the "while I am here" edit the log is meant to surface.

## What the session transcripts show, 2026-10-17

Observations from the transcripts under `~/.claude/projects`. They narrow the cause; they do not
establish it.

- **Where each session was launched splits logged from silent.** Every silent session on record
  was launched from `.claude/worktrees/e2e-local-database-only`, a former worktree that
  `60c30e3b` removed on 2026-09-21, leaving an empty directory that later gained a `.claude/`
  folder holding only `settings.local.json`. Every session that logged (`60c30e3b`, `44dc9b6b`,
  `1c022c97`) was launched from the main checkout. CLI background jobs are on both sides, so
  "background job" does not separate them. `44dc9b6b`'s state file, read above as
  misattribution, was its own.
- **Sometimes the hook ran and could not find its script.** `.claude/settings.json` runs
  `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-guard.mjs"`. Some silent sessions record, in
  their transcripts but not to the session, non-blocking `PostToolUse` errors of the form

      Cannot find module 'D:\Dev\Repos\pet-shelter\.claude\worktrees\e2e-local-database-only\.claude\hooks\agent-guard.mjs'

  They appear in periods: within such a period every successful matched call carries the error,
  and outside them there is no sign the hook ran at all, including calls by the same session and
  version at other times.

At least two such periods are on record. Most sessions launched from that directory failed on
every call in one shared window on 2026-09-21, from about 17:05Z to 17:41Z. One of them,
`9b859c16`, failed again on 2026-10-15 from about 16:12Z to 16:34Z, on a later version and
working in another worktree, still naming the stray directory's path. `e8689beb`, active in the
2026-09-21 window on the same version as the others, shows no sign of the hook at any time. What
switches the hook between failing and not running is not established. Deleting
the directory could break sessions still running from it, so the fix should wait until the
mechanism is known.

Unchanged facts from the 2026-10-14/15 reading: the current drift log holds 161 lines, all from
`1c022c97`, 2026-10-13T15:09Z to 16:37Z, inside that session's lifetime; no
`settings.local.json` (in the main checkout or the stray directory), and no user or managed
settings layer, sets `hooks` or `disableAllHooks`; and older log contents are gone, by a means not
observed.

Related but distinct: `tasks/open/matcherless-hook-wiring-unverified.md` (only an alternation
matcher has been observed firing — this one *is* an alternation matcher, and for this session it
did not fire),
and `tasks/open/drift-log-credits-a-merge-to-the-session-that-ran-it.md`.

**Settles when:** a session launched from `.claude/worktrees/e2e-local-database-only`, or any
directory that is not a full checkout, writes a file and finds that write in
`claude-agent-drift.log` under its own `session_id`. Alternatively, the close-out step that
depends on the log is changed to name what it can actually verify, and this entry records which.
