# Operational Runbook & Engineering Guide

**Hope for Strays — Animal Shelter & Adoption Platform**  
*Location: No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia*

---

## 📖 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Prerequisites & Environment Setup](#2-prerequisites--environment-setup)
3. [Database Management & Seeding](#3-database-management--seeding)
4. [Authentication & Staff Access (RBAC)](#4-authentication--staff-access-rbac)
5. [Transactional Emails & Notifications](#5-transactional-emails--notifications)
6. [Testing, Linting & CI Verification](#6-testing-linting--ci-verification)
7. [Deployment & Production Builds](#7-deployment--production-builds)
8. [Troubleshooting & Incident Runbooks](#8-troubleshooting--incident-runbooks)

---

## 1. System Overview & Architecture

Hope for Strays is built on Next.js 16 (App Router + Turbopack) with a resilient, multi-tiered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App Router                       │
│  Public Views (/, /pets, /pets/[id])  │ Admin (/admin/*)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Server Actions Layer                     │
│  src/actions/{pets, applications, auth, audit, settings}.ts │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐ ┌─────────────▼───────────────┐
│     Security & Domain       │ │   Resilient Storage Engine  │
│  - HMAC-SHA256 Sessions     │ │   - PostgreSQL (Prisma 7)   │
│  - Declarative RBAC Guards  │ │   - Memory Cache Fallback   │
│  - Finite State Machine     │ │   - Resend Email Dispatch   │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 2. Prerequisites & Environment Setup

### System Prerequisites
* **Node.js**: `v20.x` or `v22.x` (LTS recommended)
* **Package Manager**: `npm` (`v10+`)
* **Docker & Docker Compose**: (Optional, for local PostgreSQL container)

### Environment Configuration
Copy the sample environment file to `.env`:
```bash
cp .env.example .env
```

Key environment variables:
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgrespassword@localhost:5432/pet_shelter?schema=public` |
| `SESSION_SECRET` | HMAC-SHA256 key for sealing cookies (32+ chars) | `dev-only-insecure-session-secret-change-me-before-deploy` *(the development default; production refuses to boot on it)* |
| `STAFF_INVITE_SECRET` | Secret PIN for staff invite onboarding (16+ chars recommended; shorter boots with a warning) | `dev-only-insecure-staff-invite-code-change-me` *(the development default; production refuses to boot on it)* |
| `RESEND_API_KEY` | Resend API key for transactional emails | `re_123456789...` *(optional; simulated if omitted)* |
| `SHELTER_NOTIFICATION_EMAIL` | Destination for incoming staff alerts | `applications@hopeforstrays.org` |
| `PRISMA_LOG` | Enable verbose Prisma query logging | `false` |

---

## 3. Database Management & Seeding

### Step 1: Start PostgreSQL (Docker)
Start the isolated PostgreSQL 16 container:
```bash
docker-compose up -d postgres
```
Verify the container status:
```bash
docker-compose ps
```

### Step 2: Push Schema to Database
Sync the Prisma schema directly to PostgreSQL without migration lock contention:
```bash
npm run db:push
# or
npx prisma db push
```

### Step 3: Seed Initial Data
Populate the database with pre-configured staff accounts, rescue animal listings, historical applications, and shelter settings:
```bash
npm run db:seed
# or
npx prisma db seed
```

### Step 4: Inspect Database via Prisma Studio
Launch the visual database management GUI:
```bash
npx prisma studio
```
*Accessible at `http://localhost:5555`*

---

## 4. Authentication & Staff Access (RBAC)

### Role Hierarchy

Five canonical roles, declared in `prisma/schema.prisma` and mapped to permissions by
`ROLE_PERMISSIONS` in `src/lib/security/permissions.ts`:

1. **SUPER_ADMIN**: Unrestricted access, including staff management and shelter settings.
2. **ANIMAL_MANAGER**: Pet profiles, gallery photos, QR codes.
3. **CONTENT_EDITOR**: FAQs, transparency data, bulletins.
4. **VOLUNTEER_COORDINATOR**: Volunteer applications and settings.
5. **STAFF**: Standard read-only operational access.

`ADMIN`, `COORDINATOR` and `VOLUNTEER` are **deprecated aliases**, kept only so existing rows and
live session cookies stay readable. `normalizeRole()` folds them onto `SUPER_ADMIN`,
`VOLUNTEER_COORDINATOR` and `STAFF` — so granting `ADMIN` grants Super Admin, and granting
`COORDINATOR` grants settings access. Never assign one.

### Pre-Seeded Staff Accounts

`prisma/seed.ts` creates one account per canonical role: `admin@`, `coordinator@`, `animals@`,
`content@` and `staff@hopeforstrays.org`.

**Credentials are deliberately not reproduced here.** Read them from `prisma/seed.ts`, which is the
only copy — a table in this file is a second copy, and the last one drifted until it named accounts
that do not exist.

There is no quick PIN. The universal `1234` fallback was removed outright rather than gated
(`src/actions/auth.ts`), and `tests/unit/auth.test.ts` fails if it ever returns. Any document still
offering one is describing a door that is not there.

---

## 5. Transactional Emails & Notifications

When a public user submits an adoption questionnaire:
1. **Adopter Receipt**: An email is sent to `app.email` with application reference ID, summary, and PJ shelter contact details.
2. **Staff Alert**: An email is sent to `applications@hopeforstrays.org` detailing applicant housing, pets, and notes.

### Development / Offline Simulation
If `RESEND_API_KEY` is not defined in `.env`, the email service automatically operates in **simulation mode**:
* Zero crashes or blocked threads.
* Simulation logs output to terminal: `[Email Simulation] To: ... | Subject: "..."`.
* Safe non-blocking execution via `Promise.allSettled`.

---

## 6. Testing, Linting & CI Verification

### Run Unit & Integration Tests (Vitest)
```bash
npm test
```
*Executes all 11 test suites (89 unit tests) covering state machines, auth cryptography, database adapters, rate limiters, and email dispatch.*

### Run Test Coverage
```bash
npm run test:coverage
```

### TypeScript Type-Checking
```bash
npx tsc --noEmit
```

### ESLint Check
```bash
npm run lint
```

### Validate Prisma Schema
```bash
npx prisma validate
```

---

## 7. Deployment & Production Builds

### Development Server
```bash
npm run dev
```
*Server listening on `http://localhost:3000`*

### Production Build
```bash
npm run build
npm start
```
*Builds all static SSG and dynamic routes using Next.js Turbopack compiler.*

---

## 8. Troubleshooting & Incident Runbooks

### Dedicated Specialized Guides & Runbooks
- 🏗️ [Architecture Guide: Prisma ORM & Neon Serverless PostgreSQL](file:///c:/Users/User/pet-shelter/documents/GUIDE_PRISMA_AND_NEON_ARCHITECTURE.md)
- 📘 [Prisma Production Database Setup & Fallback Recovery Runbook](file:///c:/Users/User/pet-shelter/documents/RUNBOOK_PRISMA_DATABASE_SETUP.md)
- 🖼️ [Production Media & Pet Image Upload Configuration Runbook](file:///c:/Users/User/pet-shelter/documents/RUNBOOK_PRODUCTION_MEDIA_STORAGE.md)

### Incident: Database Connection Failure / Offline Mode
* **Symptom**: PostgreSQL container is down or `DATABASE_URL` is unreachable.
* **Behavior**: The storage engine (`src/lib/server/petRepository.ts`, `src/lib/server/applicationRepository.ts`) logs diagnostic warnings and transparently falls back to in-memory caching.
* **Resolution**:
  1. Check container health: `docker-compose ps`
  2. Restart PostgreSQL: `docker-compose restart postgres`
  3. Verify connection string in `.env`
  4. Run `npm run db:push` to ensure schema alignment.

### Incident: Rate Limit Lockout on Public Submissions
* **Symptom**: User receives `429: Submission rate limit exceeded`.
* **Behavior**: Sliding window rate limiter allows up to 10 submissions per 10 minutes per IP/email.
* **Resolution**: Rate limits auto-expire after 600 seconds. For testing, restart the dev server or use a unique email address.

### Incident: Prisma Schema Validation Warning
* **Symptom**: `onDelete: SetNull` warning during schema validation.
* **Resolution**: Ensure all `onDelete: SetNull` relation fields are marked optional (`petId String?`). Run `npx prisma validate` to confirm zero warnings.

