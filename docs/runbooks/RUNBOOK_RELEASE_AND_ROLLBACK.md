# Release & Rollback Runbook

How a change gets tested before production, and how to undo it when production breaks.

**The governing fact:** Vercel can undo code in one click. Nothing undoes the database. Every
rule below exists so that a code rollback is always safe to press.

Decided 2026-10-28: no long-lived `dev` or `staging` branches. `master` is production, and every
pull request's Preview deployment is its staging copy.

---

## 1. Before merge: the Preview deployment is staging

Every PR gets a Preview deployment, linked from the PR. Click through the change there, not just CI.

A preview is only safe to click through if it cannot touch production data. Check once, and again
whenever anyone edits Vercel's environment variables:

1. Vercel → Project → Settings → Environment Variables → reveal `DATABASE_URL` for **Preview**.
2. Its host must be a **separate Neon branch**, not the production branch's host. If they match,
   every preview writes real applications, donations and staff edits into production.
3. `RESEND_API_KEY` must be **absent** in Preview, so previews never email real people.

The full Preview variable list is in
[RUNBOOK_VERCEL_DEPLOY_VERIFICATION.md §2](RUNBOOK_VERCEL_DEPLOY_VERIFICATION.md#preview).

The preview's Neon branch is a copy of production from the moment it was created and does not
follow later migrations. Before testing a PR that needs a new schema, apply that PR's
`migration.sql` to the preview branch first (§3 step 3), or reset the branch from production in the
Neon Console (Branches → the preview branch → **Reset from parent**).

---

## 2. After merge: rolling back code

Vercel → Project → production deployment tile → **Instant Rollback** → confirm.

- **Hobby plan:** you can only go back to the deployment immediately before the current one.
  Rolling back twice in a row is not possible.
- **Environment variables are not rolled back.** If the break came from a variable change, fix the
  variable and redeploy instead.
- **Auto-deploy pauses after a rollback.** New merges to `master` build but do not go live until
  someone clicks **Undo Rollback** on the same tile (or runs `vercel promote <url>`). Undo it as
  soon as the fix is merged, or the next several merges silently never reach users.

---

## 3. Shipping a migration so that rollback stays safe

Schema changes already ship as hand-written additive SQL under `prisma/migrations/manual/`
(`tasks/lessons/2026-09-03-schema-changes-ship-as-additive-sql-here-never-as-db-push.md`). The
order below is what keeps §2 safe.

1. **Expand, then contract, in separate PRs.** The first migration only adds (columns, tables,
   enum values). The code that stops using the old shape merges next. A drop or rename ships in a
   later `_contract` migration, after production has run the new code without trouble. The
   `20260922_pets_birth_date` / `20260922_pets_birth_date_contract` pair is the worked example.
   This is what lets the old deployment run on the new schema when you roll back.
2. **Rehearse** where a `rehearse.mjs` exists (embedded Postgres, never production).
3. **Try it on real data.** Neon Console → Branches → **Create branch** from `production`, at the
   current point in time. Run `migration.sql` in the SQL Editor on that branch, check the result,
   then delete the branch. The Free plan allows 10 branches per project.
4. **Snapshot production.** Neon Console → `production` branch → Backup & Restore →
   **Create snapshot**. The Free plan keeps **one** manual snapshot, so delete the previous one
   first. Do not skip this: the Free plan's own restore history only reaches back **6 hours**.
5. **Apply** `migration.sql` to `production` in the SQL Editor.
6. **Merge** the PR that needs the schema, then verify the deploy (
   [RUNBOOK_VERCEL_DEPLOY_VERIFICATION.md §3](RUNBOOK_VERCEL_DEPLOY_VERIFICATION.md#3-verifying-a-deployment-actually-read-the-database)).

---

## 4. Rolling back the database

Try these in order and stop at the first one that works:

1. **Do nothing to the database.** If the migration was additive (§3 step 1), roll back the code
   (§2) and leave the new columns in place, unused.
2. **`rollback.sql`** beside the migration, if it has one. Read its header first: a rollback for a
   dropped column cannot bring back the data
   (`tasks/lessons/2026-09-22-a-rollback-file-for-a-drop-column-is-fiction-unless-something-kept-the.md`).
3. **Restore the snapshot** from §3 step 4: Backup & Restore → the snapshot → **Restore →
   One-step restore**. The connection string stays the same, so Vercel needs no change.
   **This discards every write since the snapshot,** including donations, applications and admin
   edits. Note what was written in that window before you press it, and use this only when 1 and 2
   cannot work.

---

## 5. When to revisit

Revisit this setup if any of these becomes true: the team needs a fixed staging URL that clients
or shelter staff can click (map a domain to a `staging` branch, available on Hobby), you need to
roll back further than one deployment, or you move to Vercel Pro (named staging environment, roll
back to any production deployment). Vercel Hobby only deploys **public** repositories owned by a
GitHub organisation, so keep the repository public if it moves to one.
