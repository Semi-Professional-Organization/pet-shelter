---
name: "source-command-remove-legacy-admin-token"
description: "Remove the legacy admin_session shared-secret branch from verifyAdminSession, closing TARGET_SECRET_HARDENING 3.5"
---

# source-command-remove-legacy-admin-token

Use this skill when the user asks to run the migrated source command `remove-legacy-admin-token`.

## Command Template

Remove the legacy `admin_session` shared-secret branch from `verifyAdminSession()`.

Read `src/lib/security/adminSession.ts` first. Full background:
`docs/tasks/TARGET_LEGACY_ADMIN_TOKEN_REMOVAL.md`. This closes
`docs/tasks/TARGET_SECRET_HARDENING.md` §3.5, which that target deliberately refused to
roll into itself.

## What is being removed

`verifyAdminSession()` resolves an admin principal from two branches:

1. the signed, expiring, per-user session cookie — **keep**;
2. an `admin_session` cookie compared against `ADMIN_SECRET_KEY` — **remove**.

Branch 2 is a static bearer token with no expiry, no subject, and no revocation, and it
authorizes as a genuine `ADMIN` via `LEGACY_ADMIN_TOKEN_PRINCIPAL`. It guards
`src/actions/pets.ts:100` and `src/app/api/upload/route.ts:34` and `:131`.

## First, verify the claim this rests on

**Do not inherit this — check it and report:** nothing in `src/` ever *sets* that cookie. The
only `cookieStore.set` calls are for `SESSION_COOKIE_NAME` in `src/lib/security/session.ts`,
and `src/lib/client/adminAuth.ts` holds `hope_for_strays_admin_session`, a **localStorage**
key with no relationship to the cookie. If that holds, this is not the behavioural change the
older target feared. **If it does not hold, stop and say so** — something issues the token and
removal would break a live path.

## Then the actual decision, before any code

**What happens to `ADMIN_SECRET_KEY`?** `assertSecretsConfigured()`
(`src/lib/security/secrets.ts`) checks it at boot and logs a bad one, which disables the legacy
cookie but no longer stops the boot (only `SESSION_SECRET` does, since 2026-10-27). Once nothing
reads it:

- drop it entirely (touches `secrets.ts`, `.sops.yaml`, the runbook, ~12 assertions in
  `tests/unit/secrets.test.ts`);
- keep it required at boot (a false requirement the next reader must rediscover);
- keep the accessor but drop it from the boot check.

Weigh it against `.env.production.enc` (`8e61027`) carrying the value with rotation already
outstanding — retiring a secret is cheaper than rotating it. **Propose, justify, then
implement.** The reasoning is the deliverable; the deletion is mechanical.

## Constraints

- **Do NOT weaken the session branch.** Same cookie name, same `timingSafeCompare`, same
  session-first order, same fail-closed `catch`. You are removing an authorization path, never
  loosening one.
- **Prove it is gone with a test.** Set `admin_session` to the correct secret and assert
  `verifyAdminSession()` resolves `null`. A guard never seen fail is not known to work.
- **Run any deliberate breakage in a detached worktree, never in the shared tree.** A parallel
  Codex session commits this branch with `git add -A`. On 2026-08-28 a type error live for
  ~2 minutes was read as a real gap and committed, leaving HEAD unable to typecheck until
  `4b06451`. Use `git worktree add --detach <tmp> HEAD`, copy the files under test in, junction
  `node_modules`, run there, then `cmd /c rmdir` the junction **before** removing the worktree
  so the real `node_modules` survives.
- **Commit with a pathspec**: `git add -- <paths>` then `git commit -F <msg> -- <the same
  paths>`, checking `git diff --cached --name-only` in a *separate* call first. The index is
  shared. If `git diff --stat -- <your paths>` later comes back empty, check
  `git show HEAD:<path>` — your work probably landed under the other session's message. Do not
  re-commit and do not amend its commit.

## Verify

```bash
npx tsc --noEmit
npm run lint
npx vitest run --project unit tests/unit/softDeleteAndAuth.test.ts tests/unit/secrets.test.ts tests/unit/upload.test.ts tests/unit/rbac.test.ts
npm run test:all
```

Baseline was **53 files / 710 tests** at `76de94f`. **Re-measure before quoting it** — this
branch takes several commits an hour and every number in a target doc here goes stale.

Finish by marking `TARGET_SECRET_HARDENING.md` §3.5 closed with the commit SHA, and appending
retrospective lessons to `tasks/lessons/` — one file per lesson, `tasks/lessons/README.md`.
