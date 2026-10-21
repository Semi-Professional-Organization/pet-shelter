# One resolver names a session, in lower case

**Decided:** 2026-10-21

Every agent script that needs "which session" asks `scripts/agent/transcript.mjs`: `resolveSession`
for an id given by `--session` or `CLAUDE_CODE_SESSION_ID` (expanding a prefix from the transcript
folders), `hookEvent` for a hook's stdin, and `sessionId` for an id read back from a hand-off. Each
returns the whole id in lower case, so `meter`, `orient`, `recall` and `ledger handoff` compare one
form of it. Before, each command got and compared the id its own way, and rounds 1, 2, 4, 6 and 7
of the meter's review each found the mistake in a different command: a prefix recorded unexpanded
(twice), `orient`'s hook reading the environment instead of its event, an event with no session
sharing one marker folder, and an upper-case id.

## A reversal of round 7

Round 7 made an upper-case id a refusal, because ids were compared as written. UUIDs ignore case,
so the resolver lower-cases instead: an upper-case id names the same session, and a hand-off
recorded in upper case by hand is still its writer's. The meter's marker folder is named by the
id itself, which the resolver guarantees is a UUID, so the character filter it carried is gone.

## What is believed, not observed

`CLAUDE_CODE_SESSION_ID` after `/clear`: Claude Code 2.1.304's bundle builds each shell's
environment from the session's id when it starts the shell, so the variable should follow a
`/clear`. That was read from the code, not watched happening. If it turns out stale, the fix
belongs in `resolveSession`, the one place that reads it.

Plan: the "Context meter: root-cause plan" doc, root 2.
