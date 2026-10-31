# Commit messages

The standard is **[Chris Beams' seven rules](https://cbea.ms/git-commit/)**, narrowed to this
repo's Conventional Commits grammar. It binds everyone who writes a commit here: the human, Claude
Code, and every sub-agent.

This page is the only copy. `CONTRIBUTING.md`, `WHERE_CODE_GOES.md` and
`.claude/agents/atomic-commit.md` point here and state nothing themselves — three copies of a
convention is how a convention drifts, which is this repo's most frequent defect shape.

The rules are enforced by `scripts/commit-msg.mjs`, covered by `tests/unit/commitMessage.test.ts`,
and run in CI. **Where this page and the linter disagree, the linter wins** and this page is the
bug: a rule that is documented but not implemented is a rule nobody follows.

```bash
npm run commit:check <file>   # lint one message
npm run commit:audit          # report on existing history
npm run commit:hook           # install the git commit-msg hook (opt-in, see §7)
```

---

## 1. The shape

```
type(scope): Imperative summary, capitalized, no period

Body prose explaining what changed and why it needed to change, hard
wrapped at 72 columns. The diff already says how.

Ledger: tasks/decisions/2026-09-01-some-decision.md
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

## 2. The seven rules, as they bind here

| # | Beams | How it binds in this repo | Level |
|---|---|---|---|
| 1 | Separate subject from body with a blank line | Line 2 is blank or the message ends at line 1 | error |
| 2 | Limit the subject line to 50 characters | Aim for 50; **72 is the hard limit** | warn >50, **error >72** |
| 3 | Capitalize the subject line | Capitalize the **summary after the colon** — see below | error |
| 4 | Do not end the subject line with a period | Verbatim. A trailing `...` is allowed | error |
| 5 | Use the imperative mood in the subject line | `Add`, never `Added`/`Adds`/`Adding` | error |
| 6 | Wrap the body at 72 characters | Verbatim, with the exemptions in §5 | error |
| 7 | Use the body to explain what and why vs. how | **No machine checks this** — see §6 | advisory |

**Rule 2 is two-tier because Beams is.** He asks for 50 and notes that GitHub truncates a subject
past 72. So 50 is the target the linter nags about and 72 is the wall it stops you at. A prefix
like `refactor(donations): ` spends 21 of the 50 before the first word, which is a reason to
choose a narrower scope, not a reason to write a longer subject. If the summary will not fit, the
commit is usually doing two things — split it.

**Rule 3 lands on the summary, not on column 1.** Conventional Commits fixes the first token as a
lowercase machine keyword; capitalizing `Feat(ui):` would break every parser that reads this
history. Beams' rule is about the part a human reads as a title, and here that part starts after
the colon:

```
feat(ui): Add the image uploader      ← correct
feat(ui): add the image uploader      ← rule 3
Feat(ui): Add the image uploader      ← breaks the grammar
```

This is the one place the standard **changes** this repo's habit: 190 of 203 existing commits
write a lowercase summary. History is grandfathered (§8); new commits are not.

**Rule 5's test is Beams' own.** A properly formed summary completes this sentence:

> If applied, this commit will **_serve the export from the ledger_**.

The linter carries a blocklist of the common wrong moods. It is deliberately incomplete — it
catches `Added`/`Adds`/`Adding`, and it will not catch every case, because `Seed`, `Embed`,
`Feed`, `Proceed` and `Needs` are legitimate imperatives that a naive `-ed`/`-s` rule would
reject. **Green from the linter is not proof of rule 5.** Apply the sentence test yourself.

## 3. Types and scopes

Type is required and comes from this closed set:

`build` · `chore` · `ci` · `docs` · `feat` · `fix` · `perf` · `refactor` · `revert` · `style` · `test`

Scope is optional, lowercase kebab-case, and **exactly one**. It names the area of the codebase,
not a list of them. `fix(pets,donations):` is in this history twice and is a commit that should
have been two commits. Scopes already in use, most-used first:

`tasks` · `agents` · `ui` · `lib` · `ledger` · `email` · `donations` · `security` · `design-system`
· `testing` · `lessons` · `db` · `data` · `admin` · `prisma` · `schema` · `secrets` · `types`

A breaking change takes `!` before the colon: `feat(api)!: Drop the v0 route`.

## 4. Trailers

Machine-readable metadata, in a block at the end, after a blank line. Recognized here:

| Trailer | Use |
|---|---|
| `Ledger:` | The `tasks/decisions/` or `tasks/open/` entry this work produced. Required when it produced one. |
| `Verified:` | The check that was actually run, with its result. See §6. |
| `Refs:` | The `docs/tasks/` target or handoff this advances. |
| `Co-Authored-By:` | Emitted by the calling session. **Never invent or hardcode it** — this history already carries two variants, and a third arrives with the next model. Copy it from the caller or from `git log -1 --format=%b`. |

## 5. What rule 6 exempts

A line is exempt from the 72-column wrap only when no wrapping could fix it:

- trailer lines, whose payload is a path, URL or identity;
- fenced (` ``` `) and 4-space-indented code blocks, which wrapping would corrupt;
- any line carrying a single unbreakable token longer than 72 — a URL or a long path.

Everything else wraps. Prose does not get an exemption for being awkward to wrap.

**A fence must be closed.** An odd number of ``` lines used to latch the exemption on and silently
excuse every remaining line, trailers included, from the wrap. The linter now reports
`unclosed-fence` and checks all of them instead: an exemption that cannot be turned off is not an
exemption, it is a hole.

## 6. Rule 7 is the one that matters, and no machine enforces it

The linter warns when a commit has no body at all. It cannot tell a good body from a bad one, and
it never will. That check is yours.

**The body explains what changed and why. The diff already explains how.** Name the thing that was
wrong and what it cost:

```
fix(donations): Serve the LHDN export from the ledger

The statutory Section 44(6) export was assembled from the 250 most
recent audit rows OF ANY KIND. Pet edits, logins and application
approvals consume that budget, so on a shelter with ordinary admin
traffic older receipts silently fall off a filing that is only
useful when it is complete.

Verified: donations 24 tests, tsc --noEmit clean
Ledger: tasks/decisions/2026-08-31-lhdn-export-reads-the-ledger.md
```

A body is optional only when the subject is the whole truth — a typo, a rename, a formatting pass.
If you are reaching for "and" a second time in the subject, you have two commits.

`Verified:` is this repo's rule from `AGENTS.md`: report the check you ran and its result, or
report that it could not run. Never write `Verified:` for a command you did not execute.

## 7. Enforcement

**The linter** — `scripts/commit-msg.mjs`. Exit 1 on any error, 0 on warnings. Also runs as an
audit over history: `npm run commit:audit -- --verbose`.

**The git hook** — `.claude/hooks/commit-msg`, installed with `npm run commit:hook`. It is opt-in
and **not installed by default**, for the same reason `.claude/hooks/pre-commit` is not: git keeps
hooks in the *common* git directory, so installing one from anywhere — including from a linked
worktree — arms it for the main checkout, every other worktree, and the concurrent session on this
branch at once. That is the human's call, not an agent's. Verified: `git rev-parse --git-path
hooks` run inside `.claude/worktrees/` returns the main repository's `.git/hooks`.

Bypass a single commit with `git commit --no-verify`; remove it with
`node scripts/install-git-hooks.mjs --uninstall commit-msg`.

**CI** — the `commits` job lints the commits a pull request adds, using the range
`origin/<base>..HEAD`. That excludes everything already reachable from the base branch, so
merging the base *into* a feature branch never dilutes the result.

The same job lints the pull request's title, which becomes the squash-merge subject. It lives in
`.github/workflows/commit-messages.yml` rather than `ci.yml` so that editing the title reruns it:
`Commit messages` is a required check for merging into `main`, and a result for a title the pull
request no longer has would either block the merge or wave the wrong subject through. Pull requests
that Dependabot opens skip the commit audit, because their bodies quote release notes, but not the
title check.

The CI audit uses `--first-parent`, so when your branch merges a sibling branch, its side-history
commits are not re-linted as part of your pull request's check. The first-parent path still catches
the commits made directly on your branch.

**What nothing lints: merge commits.** The audit passes `--no-merges`, and the hook skips any
subject beginning `Merge `, `Revert `, `fixup!`, `squash!` or `amend!`. Git generates those, and
failing a developer's commit over wording they did not write is how a hook gets uninstalled. The
consequence is that a merge commit's message — including the part a human *does* write, explaining
why the merge was taken and how a conflict was resolved — is governed by nothing but judgement.
Write it as if it were linted. An empty range also passes, and does so confusingly: it exits 0
while printing `0 commits linted` and `clean (no errors): 0/0 (0%)`. The `0%` reads like a failure
and the exit code says success; the exit code is the truthful one. Read the count before believing
either.

**On whether the hook is live here:** §7 describes the repo default, which is opt-in and off. It
has since been installed for this machine — see
`tasks/decisions/2026-09-01-commit-msg-hook-installed-repo-wide.md` and
`docs/tasks/TARGET_COMMIT_STANDARD_ADOPTION.md` §1.1 for what that does and does not protect. Do
not infer from this section that no hook is armed.

## 8. The measured baseline

Reproduce with `npm run commit:audit -- 28159f3` — the pinned branch point, which is exactly the
203 commits that predate the standard. A bare `npm run commit:audit` walks `HEAD` and reports a
larger denominator as adoption proceeds.

**The table counts commits; the tool prints findings.** They agree only for rules that can fire
once per commit. Rule 6 fires once per over-long *line*, so the audit reports
`error:body-wrap 1021` against the 97 commits below. Neither number is wrong and no flag prints
this table; it was computed per commit. As of 2026-09-01, across 203 commits:

| Rule | Commits violating |
|---|---|
| 3 · capitalize | 190 (94%) |
| 2 · subject over 72 | 97 (48%) |
| 6 · body wrap | 97 (48%) |
| 2 · subject over 50 (warning) | 86 (42%) |
| 7 · no body (warning) | 87 (43%) |
| — · not Conventional Commits | 13 (6%) |
| 1 · no blank line after subject | 5 (2%) |
| — · stray shell delimiter | 5 (2%) |

**Zero of 203 commits pass cleanly.** That is the honest starting point, and it is why history is
grandfathered rather than rewritten — rewriting a shared branch is a one-way door
(`.claude/templates/triage-rules.md` §5).

The mean subject here is 72.7 characters. Beams' 50 is not a description of this repo; it is the
target it is now aiming at.

## 9. How to commit here, mechanically

The index is shared with a concurrent Claude session. This is not style advice; getting it wrong
commits someone else's in-flight work under your message.

```bash
git add -- <explicit paths>
git commit -F <message-file> -- <the same explicit paths>
```

- **`git add -A`, `git add .` and `git commit -a` are forbidden.** Pathspec on both halves.
- Read `git diff --cached --name-only` in its **own** tool call before committing — chained after
  a `git add`, you are reading your own writes.
- Never `git stash`, `reset --hard`, force-push, or rewrite a shared branch.

**Write the message to a file and use `-F`.** Not `-m`. Five commits in this history have a bare
`@` as their subject line and the real subject stranded on line 2, because a PowerShell here-string
(`@'…'@`) handed its own delimiter to `git commit -m`. `git log --oneline` renders those five as
`@`. The linter now catches that shape by name, but writing the message to a file avoids the class
entirely. Put the file in the session scratchpad, never in the repo.

Splitting rules — one coherent change per commit, refactor before the behaviour it enables, tests
with the behaviour they cover, no generated files, and never a docs-only pull request — are in
`.claude/agents/atomic-commit.md`.

## 10. Examples

```
✅ fix(donations): Serve the LHDN export from the ledger
✅ refactor(lib): Remove the barrel file re-exporting the repositories
✅ test(prisma): Cover resolveDatabaseUrl, which decides every push target
✅ docs(ledger): Record why worktree isolation for spike-runner died

❌ updates                                   no type, no summary, no body
❌ fix: fixed the thing.                     rules 3, 4, 5
❌ feat(pets,donations): add tabs and sponsorship carousel and chooser
                                             two scopes, two commits, rule 3
❌ @                                          a here-string delimiter, not a message
❌ docs & fix(db): optimize Neon pool         two types is two commits
```
