# Setup & Installation Guide

This guide walks new developers through setting up the pet-shelter application locally.

---

## Prerequisites

- **Node.js**: v20 or later (check via `node --version`)
- **npm**: v10 or later (check via `npm --version`)
- **Git**: Configured with your GitHub account
- **PostgreSQL**: Neon serverless or local Postgres 15+
- **Code Editor**: VS Code (recommended) with TypeScript support

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/Semi-Professional-Organization/pet-shelter.git
cd pet-shelter
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages defined in `package.json`, including:
- Next.js 16 (App Router)
- React 19
- Prisma 7 (ORM)
- Tailwind CSS 4
- Zod (validation)
- Vitest (unit testing)
- TypeScript 5

---

## Step 3: Configure Environment Variables

### Create `.env.local`

Copy the environment template and populate it with your values:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your credentials:

```env
# Database Connection
DATABASE_URL="postgresql://user:password@host:5432/pet_shelter"

# Admin Credentials (for local development seeding)
ADMIN_EMAIL="admin@hopeforstrays.org"
ADMIN_PASSWORD="admin123"

# Email Service (Resend SDK)
RESEND_API_KEY="re_xxxxxxxxxxxxx"
EMAIL_FROM="Hope for Strays <noreply@hopeforstrays.org>"

# Optional: Observability & Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=""
NODE_ENV="development"
```

#### For Neon PostgreSQL (Recommended)

If you don't have a Postgres database:

1. **Sign up** at [console.neon.tech](https://console.neon.tech)
2. **Create a project** and get your connection string
3. **Copy the connection string** to `DATABASE_URL` in `.env.local`

Example Neon URL:
```
DATABASE_URL="postgresql://username:password@ep-aged-frost-a1234567.us-east-1.neon.tech/pet_shelter?sslmode=require"
```

---

## Step 4: Initialize the Database

### Push Schema to Database

```bash
npm run db:push
```

This command:
- Compares your `prisma/schema.prisma` against the database
- Generates SQL migrations automatically
- Applies any pending schema changes
- Regenerates `@prisma/client`

### Seed Sample Data (Optional)

```bash
npm run db:seed
```

This populates the database with sample pets, applications, and audit logs for local testing.

---

## Step 5: Generate TypeScript Types

```bash
npm run db:generate
```

This command generates the Prisma client and TypeScript types based on your schema. (Usually runs automatically after `db:push`, but can be run manually if needed.)

---

## Step 6: Start the Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000` with **fast refresh** and **hot reloading**.

- **Public pages**: `/`, `/pets`, `/pets/[id]`
- **Admin dashboard**: `/admin/login` (credentials from `.env.local`)
- **Server logs**: Visible in the terminal running `npm run dev`

---

## Step 7: Verify the Setup

### Run Tests

```bash
npm test
```

This runs all Vitest unit tests. Expected result: **100% pass rate**.

### Build for Production

```bash
npm run build
```

This compiles the Next.js app and produces an optimized production build. If this succeeds, your environment is correctly configured.

### Lint Code

```bash
npm run lint
```

Checks TypeScript and ESLint rules. Fix issues with `npm run lint -- --fix` if needed.

---

## Step 8: Explore the Codebase

Key directories to understand the architecture:

```
src/
├── app/              # Next.js App Router pages & layouts
├── actions/          # Server-side form & data mutations
├── components/       # React components (UI + features)
├── hooks/            # Custom React hooks
├── lib/              # Utilities, stores, auth, database
├── types/            # TypeScript type definitions
└── data/             # Static seed data (JSON)

prisma/
├── schema.prisma     # Database schema & relationships
└── seed.ts           # Script to populate sample data

tests/
└── unit/             # Vitest unit test suites

docs/
├── README.md                      # Documentation Navigation Portal
├── setup.md                       # Installation & setup guide
├── design-system.md               # UI tokens and design guidelines
├── architecture/                  # Architecture blueprints
├── runbooks/                      # Operational & database runbooks
├── tutorials/                     # Step-by-step developer tutorials
└── archives/                      # Historical handoffs & archives
```

---

## Development Workflows

### Adding a New Feature

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Write tests first** (TDD):
   ```bash
   # Edit tests/unit/my-feature.test.ts
   npm run test:watch
   ```

3. **Implement the feature**:
   - If database changes are needed, update `prisma/schema.prisma`
   - Run `npm run db:push` to apply schema changes
   - Implement component logic in `src/components/` or `src/actions/`

4. **Type-check and lint**:
   ```bash
   npx tsc --noEmit
   npm run lint -- --fix
   ```

5. **Build and test**:
   ```bash
   npm test
   npm run build
   ```

6. **Commit atomically**:
   ```bash
   git add -A
   git commit -m "feat: description of your change"
   ```

### Debugging

- **VS Code Debugger**: Add breakpoints and use the Debug panel (Ctrl+Shift+D)
- **Server Logs**: Watch `npm run dev` terminal output for server-side errors
- **Browser DevTools**: F12 for client-side debugging (React DevTools recommended)
- **Database Queries**: Enable Prisma query logging by adding `log: ["query"]` to `datasource db` in schema

### Database Migrations

When you modify `prisma/schema.prisma`:

```bash
# Sync your local database
npm run db:push

# Or create a versioned migration (for production)
npx prisma migrate dev --name descriptive_migration_name
```

---

## Troubleshooting

### "Cannot find module" or TypeScript errors

```bash
npm run db:generate
npx tsc --noEmit
```

Then restart your dev server and reload the IDE.

### Database connection fails

- Verify `DATABASE_URL` in `.env.local` is correct
- Check that your PostgreSQL instance is running
- Ensure your IP is whitelisted (if using cloud database)
- Test connection: `psql $DATABASE_URL`

### Port 3000 already in use

```bash
# Use a different port
npm run dev -- -p 3001
```

### Build fails

```bash
# Clear Next.js cache
rm -r .next
npm run build
```

---

## Common Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local dev server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run all unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check code style |
| `npm run db:push` | Sync schema to database |
| `npm run db:seed` | Populate sample data |
| `npm run db:generate` | Regenerate Prisma types |

---

## Next Steps

1. Read [`docs/architecture/ARCHITECTURE_BLUEPRINT.md`](architecture/ARCHITECTURE_BLUEPRINT.md) to understand system design
2. Read [`docs/runbooks/OPERATIONAL_RUNBOOK.md`](runbooks/OPERATIONAL_RUNBOOK.md) for day-to-day operations
3. Review [`docs/design-system.md`](design-system.md) for UI guidelines
4. Check out the feature roadmap in [`docs/archives/HANDOFF_AND_NEXT_TASKS.md`](archives/HANDOFF_AND_NEXT_TASKS.md)

---

## Getting Help

- **TypeScript Errors**: Run `npx tsc --noEmit` to get detailed type information
- **Prisma Issues**: See [Prisma Docs](https://www.prisma.io/docs/)
- **Next.js Questions**: See [Next.js Docs](https://nextjs.org/docs)
- **Tailwind Help**: See [Tailwind Docs](https://tailwindcss.com/docs)

---

**Last Updated**: 2026-08-15
