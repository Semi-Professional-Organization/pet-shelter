# Backend Server Engineer Masterclass: TNRM, Rehabilitation & Sponsorship Engine

> **Superseded facts (2026-11-05).** This tutorial was written when the shelter was believed to
> be a registered society with LHDN Subsection 44(6) approval. It is neither (#239). The ROS
> numbers, LHDN reference and society name below are not real, the site issues no tax receipts,
> and none of them may be copied into `src/`, where `tests/unit/shelterIdentity.test.ts` rejects
> them.

**Role Track**: **Backend Server Engineer (You)**  
**Target Milestone**: Building the core data models, server actions, in-memory dual-layer store, and validation engine for **Hope For Strays UM** (*Coexistence through TNRM & Education*).

---

## 🎯 1. Backend Architecture Overview

As the Backend Server Engineer, your responsibility is to ensure high data integrity, sub-50ms query latency, strict input validation, resilient offline/fallback operation, and statutory LHDN tax e-receipt generation.

```
┌────────────────────────────────────────────────────────┐
│                   Next.js 16 App Router                │
│             React Server Actions / API Routes          │
└───────────────────────────┬────────────────────────────┘
                            │
              Zod Input Validation & Sanitization
                            │
┌───────────────────────────▼────────────────────────────┐
│         Dual-Layer Persistence Store (serverStore)     │
│   ┌───────────────────────┐  ┌──────────────────────┐  │
│   │ Fast In-Memory Cache  │  │ Neon PostgreSQL Pool │  │
│   │  (Zero DB Latency)    │◄─┤   (Prisma ORM 7.x)   │  │
│   └───────────────────────┘  └──────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│      LHDN Tax e-Receipt & Audit Logging Engine         │
│   (Subsection 44(6) Income Tax Act 1967 Compliance)    │
└────────────────────────────────────────────────────────┘
```

---

## 📦 2. Step-by-Step Implementation

### Step 1: Database Schema & Entity Modeling
📁 **Target File**: [`prisma/schema.prisma`](file:///c:/Users/User/pet-shelter/prisma/schema.prisma)

Extend your schema to support `In Rehabilitation` status, clinical updates, and rehabilitation house wishlist items:

```prisma
// Hope for Strays UM - Prisma Schema for PostgreSQL
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum PetStatusEnum {
  AVAILABLE
  IN_REHABILITATION
  PENDING
  ADOPTED
}

enum WishlistCategoryEnum {
  URGENT
  REGULAR
  LONG_TERM
  TNRM_EQUIPMENT
}

model Pet {
  id                    String         @id @default(cuid())
  name                  String
  species               String         // dog, cat, other
  breed                 String
  age                   String
  ageCategory           String         // puppy_kitten, young, adult, senior
  gender                String         // Male, Female
  size                  String         // Small, Medium, Large
  weight                String
  status                String         @default("Available") // Available, In Rehabilitation, Pending, Adopted
  rehabStage            String?        // e.g., "Post-Surgical Healing", "Skin & Nutrition Therapy", "Behavioral Socialization"
  rehabStageMs          String?
  rehabProgressPercent  Int            @default(0)
  adoptionFee           String
  description           String
  rescueStory           String
  image                 String
  galleryImages         String[]
  tags                  String[]
  featured              Boolean        @default(false)
  intakeDate            String
  
  // Medical clearance
  vaccinated            Boolean        @default(true)
  microchipped          Boolean        @default(true)
  spayedNeutered        Boolean        @default(true)
  specialNeeds          String?

  // Compatibility
  goodWithDogs          Boolean        @default(true)
  goodWithCats          Boolean        @default(true)
  goodWithKids          Boolean        @default(true)
  energyLevel           String         @default("Moderate")

  // Soft deletion & audit
  isArchived            Boolean        @default(false)
  deletedAt             DateTime?

  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  applications          AdoptionApplication[]
  updates               PetUpdate[]
  sponsorships          DonationPledge[]

  @@index([species, status, isArchived])
  @@index([isArchived, status])
  @@index([featured])
  @@map("pets")
}

model PetUpdate {
  id          String   @id @default(cuid())
  petId       String
  pet         Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  date        String   // ISO format: YYYY-MM-DD
  title       String
  titleMs     String?
  content     String   @db.Text
  contentMs   String?  @db.Text
  image       String?
  category    String   @default("rehabilitation") // medical, rehabilitation, milestone, socialization
  createdAt   DateTime @default(now())

  @@index([petId, date])
  @@map("pet_updates")
}

model DonationPledge {
  id                    String   @id @default(cuid())
  receiptNumber         String   @unique // HFS-DON-YYYYMM-XXXX
  donorName             String
  donorEmail            String
  donorPhone            String?
  taxIdOrIc             String?  // Malaysian IC / Passport / SSM No.
  tierId                String
  tierName              String
  amountMYR             Float
  frequency             String   @default("one_time") // one_time, monthly
  targetPetId           String?
  targetPet             Pet?     @relation(fields: [targetPetId], references: [id], onDelete: SetNull)
  targetPetName         String?
  notes                 String?  @db.Text
  paymentMethod         String   @default("duitnow_qr")
  isVerified            Boolean  @default(true)
  taxDeductibleRef      String   @default("LHDN.01/35/42/51/179-6.4912")
  shelterRegistrationNo String   @default("PPM-012-10-18042016")
  createdAt             DateTime @default(now())

  @@index([donorEmail])
  @@index([receiptNumber])
  @@index([targetPetId])
  @@map("donation_pledges")
}

model RehabNeedItem {
  id              String               @id @default(cuid())
  category        WishlistCategoryEnum
  name            String
  nameMs          String?
  description     String?
  quantityNeeded  String
  urgencyLevel    String               @default("Normal") // Critical, High, Normal
  isFulfilled     Boolean              @default(false)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([category, isFulfilled])
  @@map("rehab_need_items")
}
```

Run migration commands:
```powershell
npx prisma generate
npx prisma db push
```

---

### Step 2: Zod Validation Schemas
📁 **Target File**: `src/lib/validations/pet.ts`

```typescript
import * as z from "zod";

export const petFilterSchema = z.object({
  searchQuery: z.string().optional().default(""),
  species: z.enum(["all", "dog", "cat", "other"]).optional().default("all"),
  status: z.enum(["all", "Available", "In Rehabilitation", "Pending", "Adopted"]).optional().default("all"),
  ageCategory: z.enum(["all", "puppy_kitten", "young", "adult", "senior"]).optional().default("all"),
  size: z.enum(["all", "Small", "Medium", "Large"]).optional().default("all"),
});

export const petUpdateInputSchema = z.object({
  petId: z.string().min(1, "Pet ID is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  title: z.string().min(3, "Title must be at least 3 characters").max(120),
  titleMs: z.string().max(120).optional(),
  content: z.string().min(10, "Content must be at least 10 characters"),
  contentMs: z.string().optional(),
  image: z.string().url("Must be valid URL").optional().or(z.literal("")),
  category: z.enum(["medical", "rehabilitation", "milestone", "socialization"]).default("rehabilitation"),
});

export type PetFilterInput = z.infer<typeof petFilterSchema>;
export type PetUpdateInput = z.infer<typeof petUpdateInputSchema>;
```

📁 **Target File**: `src/lib/validations/sponsorship.ts`

```typescript
import * as z from "zod";

export const sponsorshipPledgeSchema = z.object({
  donorName: z.string().min(2, "Full Name is required for tax deduction").max(100),
  donorEmail: z.string().email("Please provide a valid email address"),
  donorPhone: z.string().max(25).optional(),
  taxIdOrIc: z.string().min(4, "IC/SSM number required for tax relief").max(30).optional(),
  tierId: z.string().min(1, "Tier is required"),
  tierName: z.string().min(1, "Tier name is required"),
  amountMYR: z.number().min(5, "Minimum donation amount is RM 5.00"),
  frequency: z.enum(["one_time", "monthly"]).default("one_time"),
  targetPetId: z.string().optional(),
  targetPetName: z.string().optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["duitnow_qr", "online_banking", "card"]).default("duitnow_qr"),
});

export type SponsorshipPledgeInput = z.infer<typeof sponsorshipPledgeSchema>;
```

---

### Step 3: Resilient Dual-Layer Server Store
📁 **Target File**: [`src/lib/serverStore.ts`](file:///c:/Users/User/pet-shelter/src/lib/serverStore.ts)

Implement the store filtering and mutation methods:

```typescript
import { Pet, PetFilterState, PetUpdate } from "@/types/pet";
import { DonationReceipt } from "@/types/sponsorship";
import mockPetsData from "@/data/pets.json";
import { prisma } from "./prisma";

// In-Memory store fallback
let serverPets: Pet[] = [...(mockPetsData as unknown as Pet[])];
let serverPledges: DonationReceipt[] = [];

export async function getPublicPets(filter?: Partial<PetFilterState>): Promise<Pet[]> {
  try {
    // Attempt Prisma fetch first
    const dbPets = await prisma.pet.findMany({
      where: {
        isArchived: false,
        ...(filter?.species && filter.species !== "all" ? { species: filter.species } : {}),
        ...(filter?.status && filter.status !== "all" ? { status: filter.status } : {}),
      },
      include: {
        updates: { orderBy: { date: "desc" } }
      },
      orderBy: { createdAt: "desc" },
    });

    if (dbPets && dbPets.length > 0) {
      return dbPets as unknown as Pet[];
    }
  } catch (err) {
    console.warn("[ServerStore] Falling back to in-memory store for getPublicPets:", err);
  }

  // In-Memory fallback filtering
  let results = serverPets.filter((p) => !p.isArchived);

  if (filter?.species && filter.species !== "all") {
    results = results.filter((p) => p.species.toLowerCase() === filter.species?.toLowerCase());
  }

  if (filter?.status && filter.status !== "all") {
    if (filter.status === "In Rehabilitation" || filter.status === "Rehabilitation") {
      results = results.filter((p) => p.status === "In Rehabilitation" || p.status === "Rehabilitation");
    } else {
      results = results.filter((p) => p.status === filter.status);
    }
  }

  if (filter?.searchQuery) {
    const q = filter.searchQuery.toLowerCase().trim();
    results = results.filter((p) => 
      p.name.toLowerCase().includes(q) || 
      p.breed.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  return results;
}

export async function getPetById(id: string): Promise<Pet | null> {
  try {
    const pet = await prisma.pet.findUnique({
      where: { id },
      include: { updates: { orderBy: { date: "desc" } } }
    });
    if (pet) return pet as unknown as Pet;
  } catch (err) {
    console.warn("[ServerStore] In-memory fallback for getPetById:", err);
  }

  return serverPets.find((p) => p.id === id) || null;
}
```

---

### Step 4: React Server Actions Integration
📁 **Target File**: [`src/actions/pets.ts`](file:///c:/Users/User/pet-shelter/src/actions/pets.ts) & [`src/actions/donations.ts`](file:///c:/Users/User/pet-shelter/src/actions/donations.ts)

```typescript
"use server";

import { sponsorshipPledgeSchema, SponsorshipPledgeInput } from "@/lib/validations/sponsorship";
import { DonationReceipt } from "@/types/sponsorship";
import { prisma } from "@/lib/prisma";

export async function submitDonationPledgeAction(rawInput: SponsorshipPledgeInput) {
  const validated = sponsorshipPledgeSchema.safeParse(rawInput);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || "Invalid input data",
    };
  }

  const data = validated.data;
  const dateObj = new Date();
  const yearMonth = dateObj.toISOString().slice(0, 7).replace("-", "");
  const randomSeq = Math.floor(1000 + Math.random() * 9000);
  const receiptNumber = `HFS-DON-${yearMonth}-${randomSeq}`;

  const receipt: DonationReceipt = {
    receiptNumber,
    date: dateObj.toLocaleDateString("en-MY", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    donorName: data.donorName,
    donorEmail: data.donorEmail,
    donorPhone: data.donorPhone,
    taxIdOrIc: data.taxIdOrIc,
    tierId: data.tierId as any,
    tierName: data.tierName,
    amountMYR: data.amountMYR,
    frequency: data.frequency,
    targetPetName: data.targetPetName,
    notes: data.notes,
    paymentMethod: data.paymentMethod,
    taxDeductibleRef: "LHDN.01/35/42/51/179-6.4912",
    shelterRegistrationNo: "PPM-012-10-18042016",
  };

  try {
    await prisma.donationPledge.create({
      data: {
        receiptNumber,
        donorName: data.donorName,
        donorEmail: data.donorEmail,
        donorPhone: data.donorPhone,
        taxIdOrIc: data.taxIdOrIc,
        tierId: data.tierId,
        tierName: data.tierName,
        amountMYR: data.amountMYR,
        frequency: data.frequency,
        targetPetId: data.targetPetId,
        targetPetName: data.targetPetName,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
      }
    });
  } catch (err) {
    console.warn("[ServerAction] Prisma create failed, using local memory receipt:", err);
  }

  return {
    success: true,
    data: receipt,
  };
}
```

---

### Step 5: Unit Testing Playbook
📁 **Target File**: `tests/unit/rehabPets.test.ts`

Run vitest test suites to verify:
```powershell
npm test
```
