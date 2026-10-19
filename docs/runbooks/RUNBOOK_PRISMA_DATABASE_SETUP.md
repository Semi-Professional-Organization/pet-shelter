# Runbook: Resolving Production Database Schema & Prisma Fallback Errors

**Hope for Strays — Animal Shelter & Adoption Platform**  
*Service Component: Database Layer / Prisma ORM / PostgreSQL / Neon*  
*Severity: High | Operational Guide*

---

## 1. Problem Statement & Symptoms

### Symptom
During runtime execution (especially in production environments such as Vercel, Railway, Render, or Docker containers), server logs emit the following warning:

```text
[Database Store] Prisma applications query falling back to memory store: 
Invalid `prisma.adoptionApplication.findMany()` invocation:
Error: Table "public.adoption_applications" does not exist in the current database.
```
or
```text
[Database Store] Prisma pet query falling back to memory store:
Invalid `prisma.pet.findMany()` invocation:
```

### Impact
- Application queries fall back to the built-in memory caches (`src/lib/server/*.ts`), which holds initial seed records in RAM.
- Any newly submitted adoption applications, updated statuses, or modified pet profiles are **not persisted** to PostgreSQL and will be wiped upon the next serverless instance reboot or cold start.

---

## 2. Root Cause Analysis

| Factor | Description |
| :--- | :--- |
| **Missing DB Tables in Remote Database** | While local development or test suites may use local Postgres or memory stores, the remote production database (e.g. Neon, AWS RDS, Supabase) has not had the Prisma schema pushed or migrated yet. |
| **Missing / Improper `DATABASE_URL`** | The production hosting provider does not have `DATABASE_URL` configured in its environment variables, or the URL lacks the mandatory `?sslmode=require` / `channel_binding` flags. |
| **Prisma Client Drift** | The generated `@prisma/client` artifact in `node_modules` expects models/columns that differ from the remote database schema. |
| **Connection Pooling / Adapter Error** | The connection pool in [`src/lib/prisma.ts`](file:///c:/Users/User/pet-shelter/src/lib/prisma.ts) could not connect due to connection limit exhaustion, invalid credentials, or cold start timeouts. |

---

## 3. Step-by-Step Resolution Procedures

### Procedure A: Push Schema to Remote / Production Database

Run `prisma db push` targeting your production PostgreSQL or Neon connection string.

#### Option 1: Direct CLI Command (Manual Fix)
```bash
# Export the production DATABASE_URL (replace with your actual credentials)
export DATABASE_URL="postgresql://<user>:<password>@<neon-or-pg-host>/<database>?sslmode=require"

# Push schema directly to the database
npx prisma db push
```

*On Windows PowerShell:*
```powershell
$env:DATABASE_URL="postgresql://<user>:<password>@<neon-or-pg-host>/<database>?sslmode=require"
npx prisma db push
```

#### Option 2: Run via NPM Script
If `DATABASE_URL` is configured in your `.env.local` or environment:
```bash
npm run db:push
```

Expected Output:
```text
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-xxxx.ap-southeast-1.aws.neon.tech"

Applying the following changes to database:
  - CreateTable "users"
  - CreateTable "pets"
  - CreateTable "adoption_applications"
  - CreateTable "audit_logs"
  - CreateTable "shelter_settings"

🚀 Your database is now in sync with your Prisma schema. Done in 1.45s
```

---

### Procedure B: Seed Production Database with Initial Data

Once tables are created, populate default admin credentials, sample pet inventory, and initial shelter settings:

```bash
# Using tsx to execute seed script against production DB
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require" npx tsx prisma/seed.ts
```

*On Windows PowerShell:*
```powershell
$env:DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
npm run db:seed
```

Expected Output:
```text
🌱 Starting database seeding...
🧹 Cleaning up existing records...
👥 Creating initial administrative staff users...
  - Created Super Admin: admin@hopeforstrays.org
  - Created Coordinator: coordinator@hopeforstrays.org
  - Created Staff: staff@hopeforstrays.org
🐾 Creating sample pet inventory (8 animals)...
  - Created pet: Milo (Dog - Male)
  - Created pet: Luna (Cat - Female)
  ...
📋 Creating sample adoption applications...
  - Created application for Milo from Sarah Jenkins
🏢 Creating default shelter configuration...
✨ Database seeding completed successfully!
```

---

### Procedure C: Configure Production Hosting Environment Variables

In your deployment dashboard (e.g. **Vercel Project Settings $\rightarrow$ Environment Variables**, **Railway Variables**, **Render Environment**):

1. Set `DATABASE_URL`:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<neon-or-pg-host>/<database>?sslmode=require"
   ```
2. For Neon databases using connection pooling:
   - Use the **Pooled connection string** (port 5432 with `-pooler` endpoint) for runtime queries.
   - Use the **Direct/Unpooled connection string** if running migrations.
3. Ensure the Build Script runs `prisma generate`:
   [`package.json`](file:///c:/Users/User/pet-shelter/package.json) is already preconfigured with:
   ```json
   "build": "prisma generate && next build"
   ```

---

### Procedure D: Verify Connection Pool Configuration

`createPrismaClient` in `src/lib/server/prisma.ts` is the one place this is set; read it there
rather than from a copy here. What to check against it:

- **No `DATABASE_URL`**: an offline client. Every query rejects with P1001 at once, no socket is
  opened, and the process says so once outside tests. There is no localhost fallback
  (`tasks/decisions/2026-10-20-no-database-url-means-no-database.md`).
- **A `DATABASE_URL`**: a `pg` pool with at most 10 connections, idle ones closed after 30 s, and
  TLS decided by `resolveDatabaseSsl` (below). The connect timeout is `DB_CONNECT_TIMEOUT_MS`:
  10 s when it is unset, empty or not a number, and none at all when it is `0`.
- **A client that cannot be built** fails the import with its own error. Nothing falls back.
- **Outside production**, the client and the pool are kept across dev-server reloads, each only
  for the URL it was built from, so changing `DATABASE_URL` takes effect without a stale client.

> [!TIP]
> TLS to Neon is verified, not merely enabled: `resolveDatabaseSsl` (`src/lib/server/databaseSsl.ts`) demands a trusted certificate for any public host and strips `sslmode` so `pg` cannot override it. Never set `rejectUnauthorized: false` to get past a handshake error; see `tasks/decisions/2026-09-08-database-tls-is-decided-by-host-not-url-spelling.md`.

---

## 4. Verification & Health Checks

### Verification Command
Run a quick Node.js / tsx probe to confirm table presence:

```bash
npx tsx -e '
import { prisma } from "./src/lib/prisma";
async function verify() {
  const count = await prisma.adoptionApplication.count();
  console.log("✅ Successfully queried adoption_applications. Record count:", count);
  await prisma.$disconnect();
}
verify().catch((e) => { console.error("❌ Query failed:", e); process.exit(1); });
'
```

### Admin Portal Live Verification
1. Navigate to `/admin/applications` in your production deployment.
2. Verify that the table renders live records without displaying any fallback warnings in your server log output.
3. Submit a new test application from `/pets/[id]/apply`.
4. Refresh the admin dashboard and confirm the application appears immediately.

---

## 5. Rollback & Disaster Recovery

If schema push introduces unintended column types or conflicts:
1. Review [`prisma/schema.prisma`](file:///c:/Users/User/pet-shelter/prisma/schema.prisma) against git history.
2. Re-run `npx prisma db push --force-reset` on your staging / non-production environment, or alter table columns using standard SQL scripts if preserving live production data.
