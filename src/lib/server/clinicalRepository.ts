import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError } from "@/lib/persistenceMode";
import { registerStateReset } from "@/lib/stateResets";

export interface VeterinarianRecord {
  id: string;
  name: string;
  licenseNumber: string;
  clinicName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface MedicalCategoryRecord {
  id: string;
  name: string;
  nameMs?: string | null;
  description?: string | null;
}

export interface VetSpecializationRecord {
  vetId: string;
  categoryId: string;
  certifiedAt: Date;
}

export interface VetPetAssignmentRecord {
  vetId: string;
  petId: string;
  assignedAt: Date;
  isPrimary: boolean;
}

// In-memory fixtures for hermetic test/offline execution
const IN_MEMORY_VETS: VeterinarianRecord[] = [
  {
    id: "vet-01",
    name: "Dr. Sarah Tan",
    licenseNumber: "MVC-2018-8892",
    clinicName: "Hope Veterinary Clinic PJ",
    phone: "03-7956 1234",
    email: "dr.sarah@hopevet.my",
  },
  {
    id: "vet-02",
    name: "Dr. Ramesh Kumar",
    licenseNumber: "MVC-2015-4120",
    clinicName: "Selangor Animal Medical Centre",
    phone: "03-5632 8765",
    email: "dr.ramesh@selangorvet.my",
  },
  {
    id: "vet-03",
    name: "Dr. Lim Wei Ling",
    licenseNumber: "MVC-2020-9931",
    clinicName: "Damansara Feline & Canine Clinic",
    phone: "03-7728 5410",
    email: "dr.lim@damansaravet.my",
  },
];

const IN_MEMORY_CATEGORIES: MedicalCategoryRecord[] = [
  { id: "intake", name: "Intake Assessment", nameMs: "Penilaian Kemasukan" },
  { id: "diagnostic", name: "Diagnostic & Lab", nameMs: "Diagnostik & Makmal" },
  { id: "treatment", name: "Medical Treatment", nameMs: "Rawatan Perubatan" },
  { id: "vaccination", name: "Core Vaccination", nameMs: "Vaksinasi Asas" },
  { id: "surgery", name: "Surgical Procedure", nameMs: "Pembedahan" },
  { id: "clearance", name: "Adoption Medical Clearance", nameMs: "Kebenaran Perubatan Pengangkatan" },
];

const inMemorySpecializations: VetSpecializationRecord[] = [
  // Dr. Sarah Tan (All specializations)
  { vetId: "vet-01", categoryId: "intake", certifiedAt: new Date("2018-06-01") },
  { vetId: "vet-01", categoryId: "diagnostic", certifiedAt: new Date("2018-06-01") },
  { vetId: "vet-01", categoryId: "treatment", certifiedAt: new Date("2018-06-01") },
  { vetId: "vet-01", categoryId: "vaccination", certifiedAt: new Date("2018-06-01") },
  { vetId: "vet-01", categoryId: "surgery", certifiedAt: new Date("2019-01-15") },
  { vetId: "vet-01", categoryId: "clearance", certifiedAt: new Date("2018-06-01") },
  // Dr. Ramesh Kumar (Surgeon & Diagnostics)
  { vetId: "vet-02", categoryId: "surgery", certifiedAt: new Date("2015-08-10") },
  { vetId: "vet-02", categoryId: "treatment", certifiedAt: new Date("2015-08-10") },
  { vetId: "vet-02", categoryId: "diagnostic", certifiedAt: new Date("2015-08-10") },
  // Dr. Lim Wei Ling (Preventative & Intake)
  { vetId: "vet-03", categoryId: "intake", certifiedAt: new Date("2020-03-20") },
  { vetId: "vet-03", categoryId: "vaccination", certifiedAt: new Date("2020-03-20") },
  { vetId: "vet-03", categoryId: "clearance", certifiedAt: new Date("2020-03-20") },
];

let inMemoryAssignments: VetPetAssignmentRecord[] = [];

/**
 * 5NF Join Dependency Verification Result
 */
export interface Clinical5NFVerification {
  isValid: boolean;
  hasSpecialization: boolean;
  hasAssignment: boolean;
  reason?: string;
}

/**
 * Validates the 5NF Join Dependency constraint:
 * ⋈({vetId, categoryId}, {categoryId, petId}, {vetId, petId})
 *
 * Ensures that:
 * 1. The veterinarian is certified for the procedure category (Vet x Category)
 * 2. The veterinarian is formally assigned to the pet (Vet x Pet)
 */
export async function verifyClinical5NF(
  vetId: string,
  categoryId: string,
  petId: string
): Promise<Clinical5NFVerification> {
  let hasSpecialization = false;
  let hasAssignment = false;

  try {
    const spec = await prisma.vetSpecialization.findUnique({
      where: {
        vetId_categoryId: {
          vetId,
          categoryId,
        },
      },
    });
    hasSpecialization = !!spec;

    const assignment = await prisma.vetPetAssignment.findUnique({
      where: {
        vetId_petId: {
          vetId,
          petId,
        },
      },
    });
    hasAssignment = !!assignment;
  } catch (err) {
    handlePersistenceError("Prisma 5NF clinical check", err, "read");
    // In-memory fallback evaluation
    hasSpecialization = inMemorySpecializations.some(
      (s) => s.vetId === vetId && s.categoryId === categoryId
    );
    hasAssignment = inMemoryAssignments.some(
      (a) => a.vetId === vetId && a.petId === petId
    );
  }

  if (!hasSpecialization) {
    return {
      isValid: false,
      hasSpecialization: false,
      hasAssignment,
      reason: `Veterinarian ${vetId} is not certified/specialized for procedure category '${categoryId}'.`,
    };
  }

  if (!hasAssignment) {
    return {
      isValid: false,
      hasSpecialization: true,
      hasAssignment: false,
      reason: `Veterinarian ${vetId} is not formally assigned as attending physician for pet '${petId}'.`,
    };
  }

  return {
    isValid: true,
    hasSpecialization: true,
    hasAssignment: true,
  };
}

/**
 * Assigns a veterinarian as attending physician to a pet.
 */
export async function assignVetToPet(
  vetId: string,
  petId: string,
  isPrimary: boolean = true
): Promise<void> {
  const existingIdx = inMemoryAssignments.findIndex(
    (a) => a.vetId === vetId && a.petId === petId
  );
  if (existingIdx >= 0) {
    inMemoryAssignments[existingIdx].isPrimary = isPrimary;
  } else {
    inMemoryAssignments.push({
      vetId,
      petId,
      assignedAt: new Date(),
      isPrimary,
    });
  }

  try {
    await prisma.vetPetAssignment.upsert({
      where: {
        vetId_petId: {
          vetId,
          petId,
        },
      },
      update: { isPrimary },
      create: {
        vetId,
        petId,
        isPrimary,
      },
    });
  } catch (err) {
    handlePersistenceError("Prisma vet assignment", err, "write");
  }
}

/**
 * Retrieves all registered veterinarians.
 */
export async function getVeterinarians(): Promise<VeterinarianRecord[]> {
  try {
    const vets = await prisma.veterinarian.findMany({
      orderBy: { name: "asc" },
    });
    if (vets && vets.length > 0) return vets;
  } catch (err) {
    handlePersistenceError("Prisma getVeterinarians", err, "read");
  }
  return IN_MEMORY_VETS;
}

/**
 * Retrieves all standardized medical procedure categories.
 */
export async function getMedicalProcedureCategories(): Promise<MedicalCategoryRecord[]> {
  try {
    const cats = await prisma.medicalProcedureCategory.findMany({
      orderBy: { id: "asc" },
    });
    if (cats && cats.length > 0) return cats;
  } catch (err) {
    handlePersistenceError("Prisma getMedicalProcedureCategories", err, "read");
  }
  return IN_MEMORY_CATEGORIES;
}

/**
 * Resets in-memory clinical state (for hermetic test execution).
 */
export function resetClinicalStore(): void {
  inMemoryAssignments = [];
}

registerStateReset("clinical", resetClinicalStore);
