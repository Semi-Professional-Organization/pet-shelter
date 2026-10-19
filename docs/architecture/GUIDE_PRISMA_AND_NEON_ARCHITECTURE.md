# Architecture Guide: Prisma ORM & Neon Serverless PostgreSQL

**Hope for Strays — Animal Shelter & Adoption Platform**  
*Service Component: Database Layer, ORM, Connection Pooling & Cloud Branching*  
*Author: Engineering Team | Comprehensive Guide*

---

## 1. Executive Summary: The Dual-Engine Stack

A frequent point of confusion is whether the application uses **Prisma** or **Neon**. The answer is: **both, working in harmony as complementary layers of the database stack.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js 16 App Router                              │
│       Client Components (React 19)   │   Server Actions & Route Handlers    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    Prisma ORM (Data Access Layer)                           │
│  - Defined in prisma/schema.prisma                                          │
│  - Generates TypeScript Types (@prisma/client)                              │
│  - Translates TypeScript commands into SQL statements                       │
│  - Manages migrations and schema synchronization (prisma db push)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ SQL over Connection Pool (pg adapter)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│             Neon Serverless PostgreSQL (Cloud Database Engine)              │
│  - Physical PostgreSQL 16 database running in the cloud                     │
│  - Stores rows, indexes, foreign keys, and tables                           │
│  - Manages storage autoscaling, scale-to-zero, and instant branch cloning    │
│  - Provides pooled and direct connection endpoints                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ On connection failure
┌──────────────────────────────────────▼──────────────────────────────────────┐
│              Resilient In-Memory Fallback Engine (Safety Net)               │
│  - src/lib/server/*.ts (RAM caches seeded from src/data/*.json)             │
│  - Ensures the site remains online even during network or database outages   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Neon Explained: The Cloud Database Engine

### What is Neon?
**Neon** is a serverless, cloud-native **PostgreSQL database**. It provides the actual PostgreSQL server running on AWS or Google Cloud that stores the shelter's data.

### Key Capabilities in this Project:
1. **Serverless Autoscaling & Scale-to-Zero:**
   When no traffic is hitting the shelter website (e.g., late at night), Neon scales compute to zero to save costs. When a user arrives, it resumes in milliseconds.
2. **Instant Database Branching:**
   Similar to Git branches for code, Neon allows you to branch your entire database in seconds.
   - `production`: The live production branch.
   - `development` / `preview`: Isolated copies of production data for testing schema changes or preview deployments without risking live customer data.
3. **Connection Pooling (PgBouncer Built-in):**
   Serverless functions (Vercel) can spin up hundreds of concurrent lambdas, which can overwhelm traditional PostgreSQL connection limits. Neon provides built-in connection pooling via its `-pooler` connection strings.

### Connection Endpoints in Neon:
| URL Type | Format Example | Used For |
|---|---|---|
| **Pooled Connection** | `postgresql://user:pass@ep-xyz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Runtime app queries (`DATABASE_URL` in Next.js Server Actions) |
| **Unpooled (Direct) Connection** | `postgresql://user:pass@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | CLI Schema migrations (`DATABASE_URL_UNPOOLED` for `prisma db push`) |

---

## 3. Prisma Explained: The ORM & Schema Manager

### What is Prisma?
**Prisma** is an **Object-Relational Mapping (ORM)** library for TypeScript and Node.js. It does not store data itself; rather, it is the tool your code uses to talk to PostgreSQL.

### Key Capabilities in this Project:
1. **Single Source of Truth (`prisma/schema.prisma`):**
   You define your data models (e.g. `Pet`, `AdoptionApplication`, `User`, `AuditLog`, `ShelterSettings`) in a clean, human-readable schema file.
2. **Auto-Generated TypeScript Client:**
   Prisma generates fully typed functions:
   ```typescript
   // You write clean TypeScript with auto-completion:
   const pets = await prisma.pet.findMany({
     where: { status: "Available", species: "dog" },
     orderBy: { createdAt: "desc" }
   });
   
   // Prisma translates this to SQL and sends it to Neon:
   // SELECT * FROM "pets" WHERE "status" = 'Available' AND "species" = 'dog' ORDER BY "createdAt" DESC;
   ```
3. **Database Schema Syncing (`prisma db push`):**
   Prisma automatically compares `prisma/schema.prisma` with your Neon database and creates any missing tables, indexes, or columns.

---

## 4. How Neon and Prisma Connect in the Codebase

### Connection Architecture (`src/lib/server/prisma.ts`)
In this project, Prisma 7 uses `@prisma/adapter-pg` with the Node.js `pg` driver to connect
directly to Neon, with verified TLS and a connection pool. `createPrismaClient` in
`src/lib/server/prisma.ts` is the source, and Procedure D in
`docs/runbooks/RUNBOOK_PRISMA_DATABASE_SETUP.md` lists what it sets. In short: no `DATABASE_URL`
gives an offline client that refuses every query with P1001 and opens no socket, with no
localhost fallback (`tasks/decisions/2026-10-20-no-database-url-means-no-database.md`); a
`DATABASE_URL` gives a pool of up to 10 connections whose TLS `resolveDatabaseSsl`
(`src/lib/server/databaseSsl.ts`) decides.

---

## 5. Complete Developer Lifecycle & Workflows

### Workflow 1: Connecting to a New Neon Database
1. Create a project at [Neon Console](https://console.neon.tech).
2. Copy the **Pooled Connection String** from the dashboard.
3. Paste it into `.env.local`:
   ```env
   DATABASE_URL="postgresql://neondb_owner:npg_xxxx@ep-cool-fog-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
   ```
4. Push the schema to Neon:
   ```bash
   npm run db:push
   ```
5. Seed initial data (admin users & sample pets):
   ```bash
   npm run db:seed
   ```

---

### Workflow 2: Modifying Database Schema (Adding Fields/Tables)
Whenever you want to add a new property (e.g. adding `microchipNumber` to `Pet`):

1. **Edit [`prisma/schema.prisma`](file:///c:/Users/User/pet-shelter/prisma/schema.prisma):**
   ```prisma
   model Pet {
     id              String   @id @default(cuid())
     name            String
     microchipNumber String?  // <-- New Field
     ...
   }
   ```
2. **Push to Neon:**
   ```bash
   npm run db:push
   ```
3. **Generate Updated TypeScript Types:**
   ```bash
   npm run db:generate
   ```
4. **Use in Server Actions:**
   `prisma.pet.create({ data: { name: "Buddy", microchipNumber: "985141000..." } })` is now fully typed and validated.

---

### Workflow 3: Neon Database Branching for Pull Requests
With Neon, you can create a zero-copy clone of your production database for testing:

```bash
# Create a new branch named 'feat-adoption-interviews'
npx neon branches create feat-adoption-interviews

# Connect Prisma to the new branch
export DATABASE_URL="postgresql://user:pass@ep-branch-xxxx.neon.tech/neondb?sslmode=require"
npx prisma db push
```

---

## 6. The In-Memory Fallback Subsystem

The application features a resilient **two-tier data layer** across `src/lib/server/` — `petRepository.ts` and `applicationRepository.ts` carry it, while `rehabNeedsCatalog.ts` and `faqCatalog.ts` are fixture-only and have no database tier:

```
Application Action (e.g. getApplications())
         │
         ▼
Try Prisma Query (against Neon)
  ├── ✅ Success ──► Return Live Database Records
  └── ❌ Failure ──► Log Warning & Return In-Memory Mock Store (RAM)
```

### Why does this exist?
- **Zero-Downtime Resilience**: If Neon undergoes scheduled maintenance, cold start pauses, or internet connectivity is temporarily disrupted, the public catalog (`/pets`) still renders from memory instead of showing an unhandled crash screen.
- **Offline Local Development**: New contributors can clone the repo and run `npm run dev` immediately without needing Docker or a live database configured.

### How to Check if You Are Using Live Database vs Memory Fallback:
- **Using Live Database:** No warnings in terminal; modifications persist across server restarts.
- **Using Memory Fallback:** Terminal prints:
  `[Database Store] Prisma applications query falling back to memory store: ...`

---

## 7. Common Pitfalls & Quick Fix Matrix

| Issue / Error | Cause | Solution |
| :--- | :--- | :--- |
| `Invalid prisma.pet.findMany() invocation: Table 'pets' does not exist` | Tables have not been created in Neon yet. | Run `npm run db:push` with your `DATABASE_URL`. |
| `Connection terminated unexpectedly` / `timeout` | Neon compute was suspended (scale-to-zero) and pool timeout was too short. | Handled automatically by `connectionTimeoutMillis: 10000` in [`src/lib/prisma.ts`](file:///c:/Users/User/pet-shelter/src/lib/prisma.ts). |
| `Max client connections reached` | Creating multiple unpooled Prisma instances. | Use the pooled Neon connection string (`-pooler`) and singleton pattern in `prisma.ts`. |
| `Self-signed certificate in certificate chain` | Neon SSL handshake requires valid SSL settings. | Do **not** turn verification off: Neon's chain verifies (`tasks/decisions/2026-09-16-neon-verifies-under-strict-tls.md`). This error means something between you and the host is presenting another certificate, such as an intercepting proxy; pin that CA with `ssl.ca` instead. |
