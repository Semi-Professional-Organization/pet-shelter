# Cross-Team Architecture Contract: Backend & Frontend

**Scope**: Formal technical agreement between the **Backend Server Engineer** and **Frontend UI Engineer** for **Hope For Strays UM** (*Coexistence through TNRM & Education*).

---

## 🤝 1. Domain Entities & TypeScript Definitions

📁 **Single Source of Truth**: [`src/types/pet.ts`](file:///c:/Users/User/pet-shelter/src/types/pet.ts) & [`src/types/sponsorship.ts`](file:///c:/Users/User/pet-shelter/src/types/sponsorship.ts)

```typescript
// Pet Statuses
export type PetStatus = 'Available' | 'Pending' | 'Adopted' | 'In Rehabilitation' | 'Rehabilitation';

export interface PetUpdate {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  titleMs?: string;
  content: string;
  contentMs?: string;
  image?: string;
  category?: 'medical' | 'rehabilitation' | 'milestone' | 'socialization';
}

export interface Pet {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed: string;
  age: string;
  ageCategory: 'puppy_kitten' | 'young' | 'adult' | 'senior';
  gender: 'Male' | 'Female';
  size: 'Small' | 'Medium' | 'Large';
  weight: string;
  tags: string[];
  description: string;
  rescueStory: string;
  image: string;
  galleryImages?: string[];
  status: PetStatus;
  rehabStage?: string;
  rehabStageMs?: string;
  rehabProgressPercent?: number;
  updates?: PetUpdate[];
  medical: {
    vaccinated: boolean;
    microchipped: boolean;
    spayedNeutered: boolean;
    specialNeeds?: string;
  };
  compatibility: {
    goodWithDogs: boolean;
    goodWithCats: boolean;
    goodWithKids: boolean;
    energyLevel: 'Low' | 'Moderate' | 'High';
  };
  intakeDate: string;
  adoptionFee: string;
  featured?: boolean;
  isArchived?: boolean;
}
```

---

## ⚡ 2. Server Action Contracts

### A. `getPublicPetsAction`
- **Caller**: Frontend (`PetGallery.tsx`)
- **Input**:
  ```typescript
  interface PetFilterInput {
    searchQuery?: string;
    species?: 'all' | 'dog' | 'cat' | 'other';
    status?: 'all' | 'Available' | 'In Rehabilitation' | 'Pending';
    ageCategory?: 'all' | 'puppy_kitten' | 'young' | 'adult' | 'senior';
  }
  ```
- **Output**: `Promise<Pet[]>`

---

### B. `submitDonationPledgeAction`
- **Caller**: Frontend (`DonationWidget.tsx` / `SponsorshipModal.tsx`)
- **Input**:
  ```typescript
  interface SponsorshipPledgeInput {
    donorName: string;
    donorEmail: string;
    donorPhone?: string;
    tierId: string;
    tierName: string;
    amountMYR: number;
    frequency: 'one_time' | 'monthly';
    targetPetId?: string;
    targetPetName?: string;
    notes?: string;
    paymentMethod: 'duitnow_qr' | 'online_banking' | 'card';
  }
  ```
- **Output**:
  ```typescript
  type ServerActionResult = {
    success: true;
    data: DonationReceipt;
  } | {
    success: false;
    error: string;
  };
  ```

---

## 🔗 3. URL Navigation & Deep-Link Standards

| Feature | URL Path | Query Parameters | Description |
| :--- | :--- | :--- | :--- |
| **Meet Our Animals** | `/pets` | `?status=In+Rehabilitation` | Filter directly to animals in rehabilitation. |
| **Meet Our Animals** | `/pets` | `?status=Available` | Filter directly to adoptable animals. |
| **Pet Profile** | `/pets/[id]` | None | Displays the 4-part profile for a specific pet. |
| **Sponsor Dedicated Pet** | `/donate` | `?pet=Kopi&tier=kibble` | Pre-populates the target pet and the RM30 tier. |
| **Track Application** | `/applications/track` | `?ref=HFS-202608-XXXX` | Pre-fills the application lookup ID. |
| **Rehab Needs** | `/#rehab-needs` or `/needs` | None | Direct anchor link to shelter needs section. |
| **Our Work** | `/#our-work` | None | Direct anchor link to TNRM, Education, Rehab section. |
| **Get Involved** | `/#get-involved` | `#volunteer`, `#foster`, `#csr` | Direct anchor link to involvement section. |
