# Production Staff Account Lockdown Runbook

How to take the seeded staff accounts out of production and replace them with a real Super Admin,
without locking the owner out of `/admin` on the way.

**The governing fact:** every seeded account's password is published in this public repository and
its git history. Anyone can sign in as them — including `admin@hopeforstrays.org`, a Super Admin —
until the rows are suspended. The code fix (`loginAction` refusing published passwords in
production, `src/lib/security/publishedPasswords.ts`) closes the sign-in, but **no action in the app
changes an ACTIVE account's password**, so once that fix deploys, nobody can sign in as a seeded
account to do the steps below. Create the real Super Admin first.

---

## 1. Production state this runbook was written against (2026-09-17)

Confirmed by the owner, not observed from the repo:

| Setting | State | Consequence here |
|---|---|---|
| `DATABASE_URL` | Set; the Neon production branch (`ep-broad-band-…`); working | Suspending a row ends a live session on its **next request** wherever the app checks through `getVerifiedSession()`, which re-reads status. Not everywhere — see below |
| `RESEND_API_KEY` | **Not set** | Every email is simulated and delivered to nobody — see §2 |
| `STAFF_INVITE_SECRET` | Set (without it, production disables staff registration and logs why at boot) | "Create Account" on `/admin/login` works for anyone holding the value |
| `SESSION_SECRET` | Not rotated — **owner's decision of 2026-09-17**, made before the gap below was known | Accepts the 24-hour window described below. **Reconsider:** rotating is the only thing that closes it |

**What suspension and the code fix do not close.** A seeded-account cookie issued before
suspension — an attacker's, or the one §4 step 3 gives you, which signing out deletes from your
browser but does not revoke — stays validly signed until it expires, **24 hours after it was
issued**. Three things still honour it:

- **Cookie-only checks, until their fix deploys.** The transparency actions in
  `src/actions/transparency.ts` (expense entries, impact stats, financial reports, and the
  unpublished-draft snapshot), FAQ editing (`requireFaqEditor` in `src/actions/faqs.ts`) and the
  `/admin/faqs` page authorized from `getCurrentSession()` alone and never re-read the account's
  status. **With the database working, a suspended Super Admin's cookie could still write the public
  financial ledger and edit FAQs.** The follow-up to this PR (branch
  `fix/admin-actions-honour-suspension`) routes them through the DAL; once it is deployed this path
  is closed. See `tasks/decisions/2026-09-18-content-actions-honour-suspension.md`.
- **Every check, during a database outage.** `readVerifiedSession` in `src/lib/security/dal.ts`
  returns the cookie's own claims when the lookup throws.
- **Sign-in, during a database outage,** falls back to `userStore`'s in-memory copy of the seed,
  where `admin@hopeforstrays.org` / `admin123` is an active Super Admin. The code fix (PR #46)
  closes this one. Merge it as soon as §4 or §5 is done.

Rotating `SESSION_SECRET` invalidates every cookie at once, closing the first two immediately;
everyone signs in again. It loses no data: `SESSION_SECRET` only signs staff sessions, sponsor
sessions and notification-preference links (`signPayload` in `src/lib/security/crypto.ts`), and
`encryptField`, the one thing that could encrypt data with it, has no callers. Links in emails
already sent would stop working, and with email unset none were sent.

**What closes the window is Vercel:** set the new value — at least 32 random characters;
production refuses a weak or default value at boot — in the Production environment variables, then
redeploy. Nothing in the repo copies Vercel's values from anywhere else.

The production value also lives in the committed `.env.production.enc`
(`docs/runbooks/RUNBOOK_SOPS_SECRETS_MANAGEMENT.md` §7), but **do not edit that file now**: it
currently cannot be decrypted, and `tasks/open/sops-encrypted-env-timestamp-crlf-breaks-decryption.md`
says not to re-encrypt the only copy while that is diagnosed. After rotating, it holds a stale
`SESSION_SECRET`. Note that in the SOPS entry, and update the file once the entry settles, so that
nobody later restores the old key from it.

Not rotating leaves the first two open until 24 hours after the last sign-in to a seeded account.
Two records of sign-ins exist, and **both are best-effort**:

- The `AUTH_LOGIN_SUCCESS` audit row is written fire-and-forget. A failed insert is silent in
  production (`recordAuditLog`, `src/lib/domain/auditLog.ts`).
- `users."lastLoginAt"` is awaited, but `recordLogin` (`src/lib/server/memberStore.ts`) swallows its
  own failure.
- Neither records a sign-in made during a database outage, which is exactly when `admin123` still
  works through the in-memory seed until PR #46 deploys.

```sql
SELECT "actorId", max("createdAt") AS last_recorded_sign_in_utc FROM "public"."audit_logs"
 WHERE "action" = 'AUTH_LOGIN_SUCCESS'
   AND "actorId" IN ('usr-admin-01', 'usr-coord-01', 'usr-animal-01', 'usr-editor-01', 'usr-staff-01', 'usr-vol-01')
 GROUP BY 1 ORDER BY 2 DESC;

SELECT "id", "lastLoginAt" FROM "public"."users"
 WHERE "id" IN ('usr-admin-01', 'usr-coord-01', 'usr-animal-01', 'usr-editor-01', 'usr-staff-01', 'usr-vol-01')
 ORDER BY "lastLoginAt" DESC NULLS LAST;
```

Treat the latest time across both as a lower bound, not proof. An empty result does not mean
nobody signed in. Procedure A's step 3 is itself a seeded sign-in, so after §4 the window runs at
least until 24 hours after that step. If you cannot rule out an unrecorded sign-in, rotate.

## 2. Email is not configured

With no `RESEND_API_KEY`, `src/lib/email.ts` writes an `EMAIL_SENT` audit row with
`simulated: true` and sends nothing. The simulated send logs the template, recipient and subject —
**not the body, so no link can be recovered from logs**. In production that means:

- **Staff invitations cannot be delivered.** "Invite" in Staff & Permissions creates a pending
  account whose link nobody receives. Do not use it to create the Super Admin.
- Applicants get no confirmation, staff get no new-application alert, donors get no e-receipt email,
  and sponsors get no welcome or photo updates. The records themselves are still written.

Enabling email is `docs/runbooks/EMAIL_DELIVERABILITY_BEST_PRACTICES.md`. Until then, use §4.

## 3. Which seeded accounts to expect

Production was seeded once: one `DATABASE_SEEDED` audit row, 2026-08-15 10:58 UTC, sixteen minutes
after `e0884e9` committed the seed. That version of `prisma/seed.ts` wrote four accounts; the two
marked "later seed" exist only if it was run again. Check the roster in Staff & Permissions.

| Id | Email | Published password | Seeded by |
|---|---|---|---|
| `usr-admin-01` | `admin@hopeforstrays.org` | `admin123` | `e0884e9` (role ADMIN, shown as Super Admin) |
| `usr-coord-01` | `coordinator@hopeforstrays.org` | `coord123` | `e0884e9` |
| `usr-staff-01` | `staff@hopeforstrays.org` | `staff123` | `e0884e9` |
| `usr-vol-01` | `volunteer@hopeforstrays.org` | `vol123` | `e0884e9`, removed from the seed 2026-09-02 |
| `usr-animal-01` | `animals@hopeforstrays.org` | `animal123` | later seed only |
| `usr-editor-01` | `content@hopeforstrays.org` | `content123` | later seed only |

## 4. Procedure A — in the app (recommended; every step is audited)

Do this **before** the published-password fix deploys.

1. **Get the invite code.** Vercel → the project → Settings → Environment Variables →
   `STAFF_INVITE_SECRET` (Production). If Vercel shows it as a sensitive value that cannot be
   revealed, use Procedure B instead.
2. **Create your account.** `https://pet-shelter-phi.vercel.app/admin/login` → **Create Account**.
   Your name, your own email, a password of 12+ characters you use nowhere else, and the invite
   code. **Not one of the passwords in §3:** production accepts them until the code fix deploys,
   and refuses them at sign-in forever after, which would lock this account out. You are signed in
   as STAFF. Sign out.
3. **Promote it.** Sign in as `admin@hopeforstrays.org` (the seeded account — this is the last time).
   **Staff & Permissions** → your account → role **Super Admin**. Sign out.
4. **Suspend the seeded accounts.** Sign in as **your** account. **Staff & Permissions** → set every
   account from §3 that appears to **Suspended**. The app refuses to suspend yourself or the last
   active Super Admin, which is why step 3 comes first.
5. **Verify.**
   - Signing in as `admin@hopeforstrays.org` now answers "This staff account has been suspended"
     (or "Invalid staff email or password" once the code fix is deployed).
   - Your own sign-in still works.
   - The audit log shows one `MEMBER_SUSPENDED` row per account, with you as the actor.
6. **Merge the code fix** (PR #46), then confirm the deployed `/admin/login` shows no pre-filled
   email and no "Quick Demo" block.

## 5. Procedure B — SQL in the Neon console (when the invite code is unavailable)

Run in the Neon SQL editor against the production branch. Rehearsed 2026-09-17 on a throwaway local
PostgreSQL with production's `users` and `audit_logs` shape, then again after code review: sixteen
checks passed. B3 refuses to run while your account is missing, even when some other Super Admin
exists, and its suspension statement run on its own suspends nothing. B1's hash verifies with the
app's own `verifyPassword`, keeps leading and trailing spaces, and refuses published and short
passwords. Each suspension writes one audit row, and a re-run changes nothing. None of this has
been run against production.

**B1. Hash your password on your own machine** (Git Bash, from anywhere with Node). The password is
read without echo and never leaves the machine; only the hash is printed. It refuses a password
shorter than 12 characters or one of the published ones (the list in
`src/lib/security/publishedPasswords.ts`): once the code fix deploys, a published password can never
sign in, so a Super Admin created with one is a lockout.

```bash
IFS= read -rs -p "New password: " PW && echo && PW="$PW" node -e 'const p=process.env.PW,c=require("crypto");if(p.length<12||["admin123","coord123","animal123","content123","staff123","vol123"].includes(p)){console.error("Refused: use 12+ characters, and not a password published in this repository.");process.exit(1)}const s=c.randomBytes(16).toString("hex");process.stdout.write(s+":"+c.scryptSync(p,s,64).toString("hex")+"\n")'; unset PW
```

**B2. Create your Super Admin.** Replace the three placeholders; paste the hash from B1.

```sql
INSERT INTO "public"."users" ("id", "email", "name", "passwordHash", "role", "status", "updatedAt")
VALUES ('usr-owner-' || substr(md5(random()::text), 1, 12), lower('YOU@EXAMPLE.ORG'), 'Your Name',
        'PASTE-THE-HASH-FROM-B1', 'SUPER_ADMIN', 'ACTIVE', now());
```

Sign in with it at `/admin/login` before going on. If the insert fails on `role`, stop: the
production `Role` type is not what this runbook assumes.

**B3. Suspend the seeded accounts.** Replace every `YOU@EXAMPLE.ORG` with the email from B2. It
refuses to run unless that account is an active Super Admin, and the suspension itself repeats the
check, so it cannot suspend anything without your account even if an editor runs the statements one
at a time. Writes one `MEMBER_SUSPENDED` audit row per account it suspends. Safe to re-run.

```sql
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "public"."users"
     WHERE lower("email") = lower('YOU@EXAMPLE.ORG') AND "status" = 'ACTIVE' AND "role" = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'YOU@EXAMPLE.ORG is not an active Super Admin. Create it and sign in with it first.';
  END IF;
END $$;

WITH suspended AS (
  UPDATE "public"."users" SET "status" = 'SUSPENDED', "updatedAt" = now()
   WHERE "id" IN ('usr-admin-01', 'usr-coord-01', 'usr-animal-01', 'usr-editor-01', 'usr-staff-01', 'usr-vol-01')
     AND "status" <> 'SUSPENDED'
     AND EXISTS (
       SELECT 1 FROM "public"."users" AS owner
        WHERE lower(owner."email") = lower('YOU@EXAMPLE.ORG') AND owner."status" = 'ACTIVE' AND owner."role" = 'SUPER_ADMIN'
     )
  RETURNING "id", "email", "role"::text AS "role"
)
INSERT INTO "public"."audit_logs" ("id", "action", "actorId", "actorEmail", "actorRole", "targetEntity", "targetId", "details", "metadata")
SELECT 'aud-lockdown-' || "id" || '-' || to_char(now(), 'YYYYMMDDHH24MISS'),
       'MEMBER_SUSPENDED', NULL, 'operator@direct-sql', 'SYSTEM', 'User', "id",
       'Suspended by direct SQL: a seeded account whose password is published in the public repository.',
       jsonb_build_object('memberEmail', "email", 'memberRole', "role", 'runbook', 'RUNBOOK_PRODUCTION_STAFF_ACCOUNT_LOCKDOWN.md')
  FROM suspended;

COMMIT;

SELECT "id", "email", "role"::text, "status"::text FROM "public"."users"
 WHERE "id" IN ('usr-admin-01', 'usr-coord-01', 'usr-animal-01', 'usr-editor-01', 'usr-staff-01', 'usr-vol-01')
 ORDER BY "id";
```

**B4. Verify.**

- Signing in as `admin@hopeforstrays.org` answers "This staff account has been suspended" (or
  "Invalid staff email or password" once the code fix is deployed). Your own sign-in still works.
- The audit log shows one `MEMBER_SUSPENDED` row per suspended account, with actor
  `operator@direct-sql` rather than your account, because the change did not go through the app.

Then merge the code fix, as in §4 step 6.

## 6. Undo

Reactivating a seeded account re-opens the hole for as long as the code fix is not deployed, and
achieves nothing once it is (its password is refused). If it is ever needed for a single account:

```sql
UPDATE "public"."users" SET "status" = 'ACTIVE', "updatedAt" = now() WHERE "id" = 'usr-…';
```

## 7. Related production work

- **Status enum migration.** Adoption applications and status changes are being lost in production
  because the `ApplicationStatus`/`PetStatus` types are missing. The rehearsed fix is
  `prisma/migrations/manual/20260917_status_enums/migration.sql`, on master since PR #47; its
  header is the procedure. It changes only the database and has to be applied by hand in the Neon
  SQL editor, and every day it waits loses whatever applications arrive.
- **The 2026-09-14 test rows.** Local e2e wrote three RM30 donations holding receipts
  `HFS-DON-202609-0001` to `0003`. Receipts are append-only statutory records
  (`prisma/schema.prisma`, model `Donation`): correct them with an offsetting record, never by
  deleting or renumbering. That decision is the owner's; see
  `docs/runbooks/RUNBOOK_DONATION_AND_LHDN_TAX_RECEIPTS.md`.
