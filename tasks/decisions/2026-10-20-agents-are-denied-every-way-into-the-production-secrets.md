# Agents are denied every npm and node way into the production secrets, not just the three asked

**Decided:** 2026-10-20

The agent-scripts plan named three permission gaps, and the owner chose to close all three: deny
`npm run db:migrate:bulletins` (it reads `.env.local`, which is production in the main checkout),
deny `npm run secrets:decrypt:local` (it overwrites `.env.local`), and ask before
`npm run ledger:issues -- --apply` (it publishes GitHub issues).

Review of that change found the same door open by other handles, and these were closed too, in
`.claude/settings.json`, for both the Bash and the PowerShell tool:

- `secrets:run`, which decrypts `.env.production.enc` into any command's environment, and
  `secrets:edit:prod`, which decrypts it into an editor. Both are denied. `secrets:check`, which
  only reports whether decryption works, stays open.
- The direct `node scripts/secrets.mjs ...` and `tsx scripts/migrate-*.ts` forms of the same
  scripts, for both migrations, since the FAQ migration is the same shape as the bulletins one.
- `ledger:issues` with `--apply` anywhere in its arguments, since the script reads it anywhere.
- The bare `npm run db:migrate:bulletins` has its own exact rule, so it is denied even if a
  trailing ` *` turns out not to match a command with no arguments.

`db:migrate:bulletins:local`, the rehearsal against local Postgres, stays open; that is why the
bulletins rule is word-bounded rather than a bare `*`.

**Reversible, and why someone might:** a human who wants an agent to run `secrets:run` for a
one-off task can approve it in the moment only by changing the rule, because a deny cannot be
approved in band. If that happens often, `secrets:run` could move from `deny` to `ask`. It was
denied because the repo's standing position is that agents do not reach the production database.

Prefix rules still miss shapes: a leading `Set-Location`, another path spelling, the `sops` binary
the scripts call, `node --import tsx`. They are enumerated in `tests/unit/agentGuard.test.ts`;
whether the PowerShell tool honours rules per subcommand is open in
`tasks/open/permission-rules-bind-bash-only.md`.
