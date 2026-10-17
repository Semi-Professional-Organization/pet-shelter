# Vercel Deployment & Verification Runbook

How to provision this app's environment on Vercel, and — the part that matters — how to prove a
deployment is actually reading the database rather than silently serving the demo fixtures.

**The governing fact:** exactly one missing variable fails the build. Every other one degrades into
something that looks like success. A green deployment is not evidence that the app works.

---

## 1. Which failures are loud, and which are silent

| Variable | Missing in production | Where |
|---|---|---|
| `SESSION_SECRET` | **Build fails.** `SecretConfigurationError` while collecting page data | `src/lib/security/crypto.ts:7` resolves it at module load; `next build` imports every route module |
| `ADMIN_SECRET_KEY` | **Boot fails**, after a green build | `src/instrumentation.ts` → `assertSecretsConfigured()` |
| `STAFF_INVITE_SECRET` | **Boot fails**, after a green build | same |
| `DATABASE_URL` | **Silent.** Serves `src/data/pets.json` fixtures | `src/lib/server/petRepository.ts` |
| `RESEND_API_KEY` | **Silent.** Emails "sent", audit row written with `simulated: true`, nothing delivered | `src/lib/email.ts:65` |
| `EMAIL_FROM` | **Silent.** From-address stays on Resend's shared sandbox sender | `src/lib/email.ts:31` |
| `SHELTER_NOTIFICATION_EMAIL` | **Silent.** Application notices go to a default address nobody owns | `src/lib/email.ts:30` |
| `NEXT_PUBLIC_APP_URL` | **Silent.** Email links point at the default host | `src/lib/email.ts:34` |

`next build` compiles `instrumentation.ts` but never calls `register()`, which is why the two
non-session secrets clear the build and fail at boot instead. Only `SESSION_SECRET` is resolved at
module scope, and only module scope runs during a build.

> `EMAIL_FROM` is the name the code reads. Do not set `SENDER_EMAIL` — nothing reads it.

---

## 2. Provisioning

Vercel → Project → Settings → Environment Variables → **Add New**. Create each entry scoped to a
single environment; a name may appear more than once as long as scopes do not overlap.

### Production

All eight from §1. Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Minimums enforced by `src/lib/security/secrets.ts`: `SESSION_SECRET` 32 characters,
`ADMIN_SECRET_KEY` 16. `STAFF_INVITE_SECRET` has a *recommended* 16: a shorter value boots with a
warning in the logs, so check the logs, not the boot, for it. These invite codes are refused at
any length, and refusing them fails the boot: `HOPE2026`, `1234`, the seeded staff passwords
(`admin123` and the rest), and any value this repository has published for a secret (a
development default, an old `.env.example` placeholder, a former hardcoded fallback), in any
letter case and with or without surrounding quotes. A value made only of quote marks,
backticks, whitespace or invisible characters (`""`, a zero-width space) counts as unset and is
refused too. Any other value is used as typed, quotes included, with surrounding whitespace trimmed.
For all three secrets, a value equal to any secret's `DEV_SECRET_DEFAULTS` entry is rejected,
including with the `.env.example` quotes left on (for the session and admin keys this match is
exact in letter case), which is why `.env.example`
publishes those exact defaults — copying it verbatim into production refuses to boot by design.

### Preview

Only four, and **all different from production**:

| Variable | Value |
|---|---|
| `SESSION_SECRET`, `ADMIN_SECRET_KEY`, `STAFF_INVITE_SECRET` | Freshly generated, distinct from production |
| `DATABASE_URL` | A **separate Neon branch**, never the production string |

Deliberately omit `RESEND_API_KEY` in Preview. Without it `src/lib/email.ts` returns
`{success: true, simulated: true}` before reaching the Resend call, which is the only thing stopping
a preview deploy from emailing real applicants at their real addresses. With the key omitted,
`EMAIL_FROM` and `SHELTER_NOTIFICATION_EMAIL` are unused, so omit those too.

Preview URLs are per-deployment, so no fixed `NEXT_PUBLIC_APP_URL` is correct there. Omit it.

### Two traps

- **Never copy the `NODE_ENV` line** from `.env.production.enc` into Vercel. Vercel sets it per
  environment; overriding it makes builds behave unpredictably.
- **`NEXT_PUBLIC_*` is inlined at build time.** Adding or changing `NEXT_PUBLIC_APP_URL` after a
  deploy requires a rebuild, not a restart.

### Where the values live

`.env.production.enc` (`npm run secrets:edit:prod`, needs the age private key) holds most of them.
It does **not** carry `EMAIL_FROM`, `SHELTER_NOTIFICATION_EMAIL` or `NEXT_PUBLIC_APP_URL`, so it is
not a complete production config on its own.

> **Do not run `npm run secrets:decrypt:local`** to read them. `scripts/secrets.mjs:153` is a bare
> `fs.writeFileSync` — it overwrites `.env.local` wholesale with no merge and no backup, destroying
> any key the encrypted file lacks.

---

## 3. Verifying a deployment actually read the database

A green build proves only that `SESSION_SECRET` was set. Do this every time.

### Step 1 — count the rows

Neon Console → SQL Editor → select the **production** branch → run:

```sql
SELECT count(*) AS pets, min(id) AS sample_id FROM pets;
```

The table is `pets`, lowercase — the Prisma model is `Pet` with `@@map("pets")`
(`prisma/schema.prisma:107`).

### Step 2 — count the prerendered routes

In the build log, find the `/pets/[id]` block:

```
├   /pets/[id]
│ ├ ● /pets/pet-001
│ ├ ● /pets/pet-002
│ └ ● [+6 more paths]
```

### Step 3 — compare the two numbers

`generateStaticParams` (`src/app/pets/[id]/page.tsx:11`) calls `getPets()`, which excludes only
archived pets. **The prerendered path count must equal the non-archived row count.**

| Observation | Meaning |
|---|---|
| Counts match | The build read the database. Good. |
| Path count equals the number of entries in `src/data/pets.json` | The build fell back to fixtures. Go to §4. |

**Do not use the ids to decide this.** `prisma/seed.ts:5` seeds from that same JSON, so a correctly
seeded database also contains `pet-001`-style ids. The ids look identical either way; only the
count separates them.

### Why the failure is invisible

`getServerPetsAsync` in `src/lib/server/petRepository.ts`:

```ts
if (dbPets && dbPets.length > 0) {
  return dbPets.map(mapDbPetToPet);
}
} catch (err) {
  handlePersistenceError("Prisma pet query", err, "read");
}
return serverPets;   // fixtures
```

A thrown query and a query returning zero rows produce the identical result. And
`handlePersistenceError` with kind `"read"` warns in development only — in a production build it
logs nothing at all.

---

## 4. Fixture fallback: what to check, in order

Work down the list; each item is cheap and rules out the one below it.

1. **Is the connection string pointing at the branch you queried?** Reveal the Production
   `DATABASE_URL` in Vercel and compare its hostname to the Neon branch's. Must be the same branch,
   and the **pooled** host (contains `-pooler`).
2. **Is it pointing at the right *database within* that branch?** A Neon branch can hold more than
   one; the console defaults to `neondb`. A correct host with the wrong database name gives a
   successful connection, a missing `pets` table, a thrown query, and fixtures — indistinguishable
   from every other cause here. Check the path segment after the host, not just the host.
3. **Did the deployment reuse a cached build?** `generateStaticParams` does not re-run if the route
   output came from `.next/cache`. Redeploy with **Use existing Build Cache** unticked. A deployment
   created before the variable was added also never sees it — env vars are applied at build start.
4. **Is a Neon IP Allow list blocking the build container?** Your console query succeeds from your
   own address while the Vercel builder is refused. Neon → Settings → IP Allow.
5. **Is the compute cold?** `src/lib/server/prisma.ts` allows 10s to connect
   (`DB_CONNECT_TIMEOUT_MS` overrides it). A suspended Neon compute that wakes slowly exceeds it.
   Run any query in the console first to wake the branch, then redeploy.

---

## 5. What a green deployment still does not give you

- **Uploads.** `/api/upload` stores nothing in any configuration — the S3 and Cloudinary providers
  return success without uploading, and no storage SDK is even a dependency. See
  [`TARGET_UPLOAD_STORAGE_STUBS.md`](../tasks/TARGET_UPLOAD_STORAGE_STUBS.md). Do not set
  `STORAGE_PROVIDER` hoping to fix it; that converts a visible error into a silent one.
- **Fresh pet pages.** The `/pets/[id]` routes are prerendered with no `revalidate`. A pet added in
  admin renders on demand (there is no `dynamicParams: false`), but a deleted one keeps its page
  until the next deploy, and the listing reflects the build-time snapshot.
- **Email.** Confirm `EMAIL_FROM` is an address on a domain verified in Resend. An unverified
  domain fails at Resend, not in this app.

---

## 6. Worked example — 2026-09-03

Production build was green. The `/pets/[id]` block listed **10** paths. The database reported:

```
 pets | sample_id
------+-----------
    8 | pet-001
```

`src/data/pets.json` contains exactly 10 entries. Ten prerendered paths against eight rows meant the
build had not read the database — the site was publishing two pets that no longer existed. The
`pet-001` sample id was a red herring: that database had been seeded from the same fixture file and
then diverged by two rows.

The connection string was confirmed to match the queried branch, which eliminated §4 item 1 and
pointed at items 2–5.
