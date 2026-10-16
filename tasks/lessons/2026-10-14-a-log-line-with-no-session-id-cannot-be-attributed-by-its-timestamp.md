# A shared log line with no session id cannot be attributed by its timestamp

**Learned:** 2026-10-14

`tasks/open/drift-log-recorded-nothing-for-a-whole-session.md` stated, in bold, "**The hook is
firing.**" The evidence was that `$TEMP/claude-agent-guard.log` kept growing while the session
worked — the last lines landed minutes before the check. From that, the entry reasoned that the
hook ran and only its drift branch failed, and built its whole suspected cause on top.

A guard line is `<timestamp> <agent> <tool>`. It carries no session id. Every Claude session on the
machine appends to the same file, and several were running. The lines that "proved" the hook fired
could have been anyone's.

Three weeks later the same session ran the controlled version: count the guard log, make one Bash
call, count again. `140` before, `140` after, newest line nineteen hours old. The hook had written
nothing for that call — the opposite of the claim. The earlier cause (`session_id` or `ROOT`
arriving wrong in the payload) never applied, because neither field is reached by a hook that does
not run.

**Rule:** to attribute activity in a shared, unattributed log to yourself, perturb and measure —
record the count, take exactly one action, record it again. Timing alone shows that *something*
wrote, which on a machine running several agents is almost always true. And before writing
"observed" next to a claim, ask whether the observation would look any different if the claim
were false.
