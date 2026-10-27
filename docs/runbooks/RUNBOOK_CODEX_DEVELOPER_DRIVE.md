# Codex, VS Code, and the Windows Developer Drive

This runbook records the development-machine layout chosen on 2026-09-06, the migration evidence, and the operating rules for Codex and VS Code. It is intentionally local-machine oriented; never add machine secrets to it.

## Chosen layout

- Keep ordinary development checkouts under `D:\Dev\Repos` on the native Windows Developer Drive.
- Run VS Code, Git, Node.js, and Codex natively on Windows for these checkouts.
- Keep the VS Code WSL extension installed for genuinely Linux-native work, but do not open these repositories through `/mnt/d`. A future WSL-native project should instead be cloned into the Linux filesystem and opened with Remote - WSL.
- Keep the engineering wiki at `C:\Users\User\Documents\Obsidian\Personal\Resources\Wiki`; it is part of the Obsidian vault, not the development-drive migration.

This follows [OpenAI's WSL guidance](https://learn.chatgpt.com/docs/windows/wsl): WSL is most useful when both the tools and repository live inside the Linux filesystem. A Windows checkout reached through `/mnt/d` combines two environments and their file semantics without gaining that benefit.

## Migration inventory

Eighteen Git repositories were copied, including `.git`, ignored files, local environment files, symlinks, and dirty working trees. Paths relative to `C:\Users\User` were preserved to avoid collisions.

| Destination under `D:\Dev\Repos` | State observed during migration |
| --- | --- |
| `pet-shelter` | Clean and synchronized after pushing `master` |
| `Documents\GitHub\ai-react-workshop` | Clean; upstream two commits ahead |
| `Documents\GitHub\Angular-University` | Dirty; 11 status entries preserved |
| `Documents\GitHub\DATAWAREHOUSE` | Clean; no upstream/origin configured |
| `Documents\GitHub\FaceMask-Detector` | Clean; upstream two commits ahead |
| `Documents\GitHub\langchain-13-min` | Dirty; 7 status entries preserved |
| `Documents\GitHub\LangChain DB SQL Project` | Clean; upstream four commits ahead |
| `Documents\GitHub\LangChain DB SQL Project-1` | Clean and synchronized |
| `Documents\GitHub\malay2sql` | Clean; upstream two commits ahead |
| `Documents\GitHub\Mood robot` | Clean and synchronized on branch `mic` |
| `Documents\GitHub\Nexometry` | Clean and synchronized |
| `Documents\GitHub\NL2SQL` | Clean; upstream four commits ahead |
| `GGApp_Test` | Dirty; 2 status entries preserved |
| `GGApp_Test-1` | Dirty; 4 status entries preserved; same remote and HEAD as `GGApp_Test` |
| `GGApp_Test2` | Clean on branch `ID260225`; no upstream |
| `git` | Clean and synchronized |
| `reactasp-1` | Clean and synchronized |
| `source\repos\AngularUniversity` | Dirty; 1 status entry preserved |

The similarly named and duplicate-looking repositories were deliberately preserved. Do not deduplicate them until their owners and histories have been reviewed.

The safe copy shape was:

```powershell
robocopy <source> <destination> /E /COPY:DAT /DCOPY:DAT /SL /XJ /R:2 /W:1
```

Robocopy codes `0` through `7` were treated as success and `8` or greater as failure. No `/MOVE` or `/MIR` operation was used. Verification compared exact `HEAD`, current branch, local branches, tags, remotes, porcelain-v2 status, worktrees, `git fsck --full`, and a second Robocopy `/L` pass.

## Recovery and final cleanup

Seventeen original repositories were renamed to allowlisted `.migrated-backup` directories rather than deleted. Retain them until their `D:` replacements have been opened and used successfully. Delete them later only from the explicit migration inventory; never recursively delete a derived or broad path.

The original `pet-shelter` directory could not be renamed because the migration session itself was using it. After closing every VS Code window and terminal attached to the old checkout, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Dev\finish-pet-shelter-migration.ps1
code D:\Dev\Repos\pet-shelter
```

The cleanup script is deliberately guarded and performs the final rename. If it refuses, identify the process holding `C:\Users\User\pet-shelter`; do not weaken its path checks.

## Codex and VS Code

- Open this project with `code D:\Dev\Repos\pet-shelter`.
- Leave `chatgpt.runCodexInWindowsSubsystemForLinux` unset or `false` for `D:` projects.
- Sign in to the IDE extension with ChatGPT. Native Windows CLI and IDE sessions can share the Windows authentication cache.
- The global `C:\Users\User\.codex\config.toml` trusts `d:\dev\repos\pet-shelter`. The obsolete `C:` trust entry was removed only after copy verification.
- At migration time, native Codex CLI `0.153.0` was installed and reported `0.153.4` as available. Upgrading is optional maintenance, not part of migration correctness.
- Use `/status` to confirm the active checkout, sandbox, and approval policy. Use `/mcp` to inspect MCP connections.
- Ask Codex to summarize the active `AGENTS.md`, project skills, MCP servers, sandbox, and approval policy before a high-impact task.

Codex discovers `AGENTS.md` from the relevant directory hierarchy; keep durable project instructions there rather than only in chat. See the official [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [IDE settings](https://learn.chatgpt.com/docs/developer-settings?surface=ide), and [configuration guide](https://learn.chatgpt.com/docs/config-file/config-basic).

## Claude Code import

Running `/import` from the `D:` checkout imported 59 items with no failures:

- 47 chats
- 5 agents
- 2 skills
- 3 slash commands represented as skills
- 1 MCP server (`obsidian`)
- 1 hook

Imported project material lives under `.agents/skills/` and `.codex/`. Import did not overwrite
`AGENTS.md`. The imported files were reviewed as ordinary source changes: broken source paths and
stale claims were corrected, read-only agents received explicit sandbox defaults, and the Codex
lifecycle hook was separated from the Claude-specific guard instead of retaining duplicate Git
hooks.

Re-running `/import` is acceptable when Claude configuration changes, but compare the result and preserve the repository's canonical instructions. See the official [Claude Code import guide](https://learn.chatgpt.com/docs/import).

## Skills, plugins, hooks, and MCP

- Repository skills remain usable from `.agents/skills`. Imported examples include `midwife`, `test-harness`, and the three `source-command-*` skills.
- Plugins bundle capabilities such as skills, MCP servers, and apps. Install and manage them through Codex CLI or the ChatGPT desktop app; the IDE extension does not directly manage plugins. See [Skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins) and [Plugins](https://learn.chatgpt.com/docs/plugins).
- The Codex lifecycle hook under `.codex/hooks` is observational, not an authorization boundary.
  Its command resolves from the Git root, so it remains valid when Codex starts in a subdirectory
  or the checkout moves.
- Obsidian MCP configuration is project-local in `.codex/config.toml`, but its bearer token is not. The configuration refers to the Windows user environment variable `OBSIDIAN_API_KEY`.
- Restart VS Code after setting or changing `OBSIDIAN_API_KEY` so the extension inherits the new environment. Confirm with `/mcp`; never print the token or commit it.
- A plain authenticated HTTP GET to the MCP endpoint returned `406`, which proves reachability but is not a protocol health check. MCP requests require the expected protocol headers and handshake.

## Verification evidence

At migration completion:

- All 18 destination repositories passed Git metadata/status comparisons, `git fsck --full`, and Robocopy dry-run comparisons.
- `pet-shelter` `master` was pushed to origin at `a459e244077f3f920a8e8e4222894c9f230993ed` before the final copy.
- `npm ci` completed and generated the Prisma client.
- `npm run check` completed with 0 errors and 18 existing warnings.
- `npm test` passed 77 files and 1,277 tests.
- `git diff --check` passed.
- Approximately 40.24 GiB remained free on the 50 GiB Developer Drive after migration.

Some repositories already contained dangling Git objects, and the local `git` repository emitted an existing malformed-tagger warning. The source/destination comparisons preserved these conditions; they were not introduced by ReFS or the copy.

## Known follow-up findings

1. `npm audit` reported six vulnerabilities: five high and one moderate, involving the direct `prisma` dependency and transitive packages including `@prisma/config`, `deepmerge-ts`, `mysql2`, `fast-uri`, and `qs`. The proposed Prisma remediation was a semver-major downgrade to `6.19.3`, so no automatic audit fix was applied. Review upgrades deliberately.
2. Package install-script approvals remain pending for `@prisma/engines`, `esbuild`, `prisma`, and `unrs-resolver`. Resolve them through the repository's package-manager policy rather than blanket-enabling scripts.
3. `npm run secrets:check` printed a decryption failure for `.env.production.enc` because a timestamp contained a carriage return, yet exited with code 0. Since 2026-10-27 it exits 1 and names the cause (a CRLF working copy); what remains is tracked in `tasks/open/sops-encrypted-env-timestamp-crlf-breaks-decryption.md`.

## Operating rules

- Work only from the `D:` checkout after the final source rename.
- Before destructive cleanup, resolve and validate every absolute path against the allowlist.
- Never delete `.migrated-backup` directories merely because Git is clean; first prove the `D:` checkout opens, builds, tests, and has the expected local-only files.
- Keep secrets in environment variables or gitignored local files, never in `.codex/config.toml`, documentation, hooks, or imported skills.
- Treat `AGENTS.md` as the canonical cross-agent instruction layer. Keep tool-specific adaptations small and reviewable.
- Run the repository's required local verification before reporting changes complete; report exact failures and remaining risk.
