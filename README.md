# Hope for Strays (Petaling Jaya, Selangor) — Rescue & Adoption Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2-green?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7.9.1-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

HFS website serves as a platform as well as a repository of past news for first-time and returning visitors to interact with. This is able to be abstracted for all kinds of news like videos, blogs, bulletins, pictures etc. This project is meant to be as generic and universal as possible in order to reach the most amount of pets, their owners and volunteers/sponsors.

---

## 🏗️ Architecture & Technology Stack

- **Framework**: [Next.js 16.3.1](https://nextjs.org/) (Turbopack, App Router, React Server Actions) & [React 19.2.8](https://react.dev/).
- **Language**: TypeScript 5 (Strict Mode, 0 `any` escapes).
- **Database & ORM**: PostgreSQL with [Prisma 7.9.1](https://www.prisma.io/) (`@prisma/adapter-pg`, connection pooling) & dual-layer in-memory fallback for offline/development resilience.
- **Styling & UI**: Tailwind CSS v4, Lucide React, and `@base-ui/react` primitives adhering to [`docs/design-system.md`](docs/design-system.md).
- **Testing**: Vitest across four projects (`unit`, `components`, `integration`, `integration-db`) plus Playwright end-to-end specs. Note that `npm test` runs the unit project alone; see [`package.json`](package.json) for the others.
- **Documentation**: Centralized runbooks, architecture blueprints, and tutorials located in [`docs/`](docs/).
- **Legal & Compliance**:
  - **Not a registered society**: the shelter holds no ROS registration and no LHDN Subsection 44(6) approval, so the site issues no tax receipts and makes no tax-deductibility claim (#239).
  - **PDPA 2010**: Malaysian Personal Data Protection Act compliance.

---

## 📚 Documentation & Runbooks

Comprehensive guides are organized in the [`docs/`](docs/) directory and synchronized with the **Obsidian Knowledge Hub** (`Areas/Pet Shelter/`):

- 📋 **[Sprint Plan & Task Division](docs/tasks/SPRINT_PLAN_BACKEND_AND_FRONTEND.md)**: 16-task sprint plan divided between Backend Server and Frontend UI engineers.
- 🤝 **[Cross-Team Architecture Contract](docs/architecture/ARCHITECTURE_CONTRACT_BACKEND_FRONTEND.md)**: TypeScript data contracts, Server Action signatures, and deep-link standards.
- 🚀 **[Setup & Installation Guide](docs/setup.md)**: Local prerequisites, Postgres/Neon configuration, and environment setup.
- 🎨 **[Design System & UI Tokens](docs/design-system.md)**: UI philosophy, Tailwind tokens, color variables, and accessible patterns.
- 🏗️ **[System Architecture Blueprint](docs/architecture/ARCHITECTURE_BLUEPRINT.md)**: High-level architectural topology and server-action contracts.
- 🗄️ **[Database & ORM Guide](docs/architecture/GUIDE_PRISMA_AND_NEON_ARCHITECTURE.md)**: Prisma, Neon serverless branching, and in-memory dual-layer storage pattern.
- 📘 **[TNRM & Sponsorship Operations Runbook](docs/runbooks/RUNBOOK_TNRM_AND_SPONSORSHIP_OPERATIONS.md)**: Campus TNRM tracking, Rehabilitation House updates, and sponsor dispatches.
- 📘 **[Operational Runbook](docs/runbooks/OPERATIONAL_RUNBOOK.md)**: Operations, incident management, rate-limiting, and RBAC administration.
- 💳 **[Donations & Sponsorship Payments](docs/runbooks/RUNBOOK_DONATIONS_AND_SPONSORSHIP_PAYMENTS.md)**: DuitNow QR, payment reconciliation, acknowledgements and the donations CSV export.
- 🎓 **[Developer Tutorials & Modules](docs/tutorials/)**: Step-by-step masterclasses for Backend, Frontend, and Full-Stack development.

---

## ✨ Key Platform Features

### 1. 🌐 Seamless Bilingual Localization (Bahasa Malaysia & English)
- **Zero-Dependency i18n**: Type-safe dictionary system (`src/lib/i18n/translations.ts`) with 100% key parity across `nav`, `common`, `hero`, `home`, `pets`, `petDetail`, `medicalTimeline`, `adoptionForm`, `tracking`, `donations`, `bulletins`, and `footer`.
- **Tactile Language Toggle**: Accessible `[ EN | BM ]` toggle in the desktop header navbar, mobile drawer sheet, and footer.
- **State Persistence**: Synchronized via `localStorage` and `SameSite=Lax` cookies with zero hydration flickering.

### 2. 🩺 Rescue Intake & Clinical Medical Timeline
- **Chronological Milestones**: Verified clinical timeline records (Rescue Intake, Diagnostics, Treatments, Core Vaccinations, Spay/Neuter Surgeries, ISO Microchip Clearance).
- **Dynamic Synthetic Generator**: Deterministically synthesizes clinical timelines for dynamic pets created via the admin portal.
- **Interactive Component**: Category filtering (*All, Intake, Diagnostics, Treatments, Vaccinations, Surgery, Clearance*), verified vet credentials, and bilingual translation. Embedded in `/pets/[id]` and quick-view modals.

### 3. 🔍 Faceted Pet Catalog & Compatibility Quiz
- **Faceted Search**: Instant client & server filtering by Species, Age Category, Size, and Status with sub-millisecond search across traits and descriptions.
- **Interactive Matcher (`PetMatchQuiz.tsx`)**: 4-question weighted algorithm recommending optimal companions based on housing, yard safety, and energy levels.

### 4. 📄 100% Free Adoption Application & Live Tracker
- **Zod-Validated Form (`AdoptionForm.tsx`)**: Comprehensive applicant vetting (housing compound, fenced yards, resident pets, experience).
- **Public Self-Service Tracker (`/applications/track`)**: Real-time 4-step progress stepper (*Received, Review, Meet & Greet, Approved*), video meeting links, Google Maps shelter directions, and adoption-day checklists.

### 5. 💳 Malaysian Giving Rail & LHDN Tax e-Receipts
- **Donation Portal (`/donate` & `DonationWidget.tsx`)**: Direct DuitNow QR standard (PayNet Malaysia) and Maybank instant bank transfer.
- **Automated e-Receipt Dossier**: Computes official tax receipts with statutory LHDN exemption numbers and instant printing.
- **1-Click LHDN & ROS CSV Export Engine**: Automated CSV download for Malaysian tax filing and NGO audits in the Admin Portal.
- **Public Transparency Ledger (`/transparency`)**: "Where Your Money Goes" — a verified expense ledger with per-category allocation shares *computed from the ledger rather than hand-written*, headline impact counters, a chronological purchase feed carrying clinic/supplier invoice references, and downloadable ROS/AGM audited statements. Editable at `/admin/transparency` by `ADMIN` and `COORDINATOR`.

### 6. 🔐 Admin Management & Role-Based Access Control (RBAC)
- **Role Permissions**: `ADMIN`, `COORDINATOR`, `STAFF`, and `VOLUNTEER` (the four values in `prisma/schema.prisma`) with scrypt-hashed credentials, brute-force rate limiting, and signed-session protection.
- **Admin Management**: Full CRUD for animals, soft-delete archiving, application review status workflows, and audit logging.

---

## 📂 Project Structure

```plaintext
pet-shelter/
├── docs/                         # Centralized documentation, blueprints, runbooks, tutorials
├── prisma/                       # Prisma schema, migrations, and database seed
├── public/                       # Favicons, icons, and static assets
├── src/
│   ├── actions/                  # Next.js Server Actions (auth, pets, applications, donations)
│   ├── app/                      # Next.js App Router pages and layouts
│   ├── components/               # React components (layout, feature modules, shadcn ui)
│   ├── data/                     # Seeded fallback data fixtures
│   ├── hooks/                    # Controller and logic React hooks
│   ├── lib/                      # Core business logic, db client, security, stores, services
│   └── types/                    # TypeScript interfaces & types
├── tests/                        # Vitest projects: unit, components, integration, integration-db
├── .github/                      # GitHub workflows and CONTRIBUTING.md
├── AGENTS.md                     # Next.js agent rules & configuration
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript compiler configuration
└── package.json                  # Project dependencies and scripts
```

---

## 🧪 Quality Gates & Verification

```bash
# 1. Run all unit & integration test suites
npm test -- --run

# 2. Strict Mode TypeScript check
npx tsc --noEmit

# 3. ESLint code quality check
npm run lint

# 4. Production Turbopack build
npm run build
```

---

## 🚀 Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application. For local area network (LAN) mobile testing, access via `http://<your-lan-ip>:3000`.
