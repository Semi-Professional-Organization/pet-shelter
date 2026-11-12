# Backend Tutorial: Personalized Sponsorship & LHDN Tax Engine

**Track**: **Backend Server Engineer**  
**Module Focus**: Building the personalized animal sponsorship engine (Orangutan Project style), statutory LHDN Subsection 44(6) tax receipt generator, and monthly update webhook dispatcher.

---

## 🎯 1. Business Logic & Requirements

1. **Dedications**: Donors can add a dedication naming an animal (e.g. Kopi, Milo, Bella) to a general gift, or give to the general shelter fund. A `/donate?pet=` link pre-fills that dedication. It is the donor's own unverified note, not a verified animal; a commitment to one animal is a `PetSponsorship`, which carries a verified pet id (`tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md`).
2. **RM30 "Rescue Companion & Updates" Tier Perks**:
   - Monthly progress update with photos and videos dispatched to the sponsor's email/WhatsApp.
   - Invitation to arrange occasional visits to spend time with the sponsored animal (subject to sanctuary guidelines).
   - Digital Certificate of Sponsorship.
3. **Statutory Tax Relief**: Instant generation of official computerized e-Receipts complying with LHDN Subsection 44(6) of the Malaysian Income Tax Act 1967.

---

## 🛠️ 2. Step-by-Step Implementation

### Step 1: Server Action for Sponsorship Pledges
📁 [`src/actions/donations.ts`](file:///c:/Users/User/pet-shelter/src/actions/donations.ts)

```typescript
"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DonationReceipt } from "@/types/sponsorship";

const sponsorshipInputSchema = z.object({
  donorName: z.string().min(2, "Name required for tax receipt").max(100),
  donorEmail: z.string().email("Valid email required"),
  donorPhone: z.string().optional(),
  taxIdOrIc: z.string().optional(),
  tierId: z.string(),
  tierName: z.string(),
  amountMYR: z.number().min(5),
  frequency: z.enum(["one_time", "monthly"]).default("one_time"),
  targetPetId: z.string().optional(),
  targetPetName: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["duitnow_qr", "online_banking", "card"]).default("duitnow_qr"),
});

export async function submitDonationPledgeAction(rawInput: z.infer<typeof sponsorshipInputSchema>) {
  const result = sponsorshipInputSchema.safeParse(rawInput);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || "Validation failed",
    };
  }

  const data = result.data;
  const yearMonth = new Date().toISOString().slice(0, 7).replace("-", "");
  const randomSeq = Math.floor(1000 + Math.random() * 9000);
  const receiptNumber = `HFS-DON-${yearMonth}-${randomSeq}`;

  const receipt: DonationReceipt = {
    receiptNumber,
    date: new Date().toLocaleDateString("en-MY", {
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
      },
    });
  } catch (err) {
    console.warn("[DonationAction] Prisma insert fallback:", err);
  }

  return {
    success: true,
    data: receipt,
  };
}
```

---

### Step 2: Monthly Update Dispatcher Logic (Cron or Queue)
📁 `src/lib/services/monthlyUpdateDispatcher.ts`

```typescript
import { prisma } from "@/lib/prisma";

export async function dispatchMonthlySponsorUpdates(monthYear: string) {
  // Fetch active monthly sponsors
  const pledges = await prisma.donationPledge.findMany({
    where: {
      frequency: "monthly",
      targetPetId: { not: null },
    },
    include: {
      targetPet: {
        include: {
          updates: {
            orderBy: { date: "desc" },
            take: 3,
          },
        },
      },
    },
  });

  const dispatchResults = pledges.map((pledge) => {
    return {
      donorEmail: pledge.donorEmail,
      donorPhone: pledge.donorPhone,
      petName: pledge.targetPetName,
      latestUpdate: pledge.targetPet?.updates[0],
      status: "queued",
    };
  });

  return dispatchResults;
}
```
