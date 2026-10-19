# The older permission rules bind the Bash tool only, not PowerShell

**Status:** ASSERTED · opened 2026-10-20

Every `deny` and `ask` rule in `.claude/settings.json` that predates 2026-10-20 is written as
`Bash(...)`: the production `db:push`, `db:seed` and `db:migrate:faqs` denials, the Prisma
denials, `git push --force`, and the `ask` rules for `git reset --hard`, `git stash`, `rm -rf` and
the rest. Claude Code's permissions reference says PowerShell rules "use the same shape as Bash
rules" and are written `PowerShell(...)`; a `Bash(...)` rule is not described as binding the
PowerShell tool. This machine runs Windows, PowerShell is the primary shell, and agents here use
both tools.

The rules added on 2026-10-20 (`db:migrate:bulletins`, `secrets:decrypt:local`, `secrets:run`,
`secrets:edit`, `ledger:issues -- --apply`) are written for both tools. The older ones were left
alone to keep that change to the gaps it was asked to close.

A second unobserved question rides on the same test. Agents here usually start a PowerShell
command with `Set-Location <dir>;`, and the reference says PowerShell rules are checked against
each subcommand of the parsed command, which would catch a denied command after that prefix.
`tests/unit/agentGuard.test.ts` models rules as prefixes, so it records those shapes as uncovered.

This is reasoned from the documentation, not observed: nobody has run a denied command through the
PowerShell tool and watched whether it was refused.

**Settles when:** a session records two observations, each made only with a harmless command that
touches no database or secret. First, `npx prisma migrate --help`, which `Bash(npx prisma
migrate*)` covers, run through the PowerShell tool: refused or not. Second, a temporary
`PowerShell(...)` deny rule for a harmless command, run behind `Set-Location .;`: refused or not.
If the first was not refused, every older rule gains its `PowerShell(...)` twin; either way
`tests/unit/agentGuard.test.ts` is updated to say what was seen.
