import {
  PrismaClient,
  PetStatus,
  ApplicationStatus,
  FaqCategory,
  BulletinCategory,
  BulletinTargetPage,
  BulletinMediaType,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import crypto from "node:crypto";
import petsData from "../src/data/pets.json";
import applicationsData from "../src/data/applications.json";
import faqsData from "../src/data/faqs.json";
import bulletinsData from "../src/data/bulletins.json";
import { assertSeedTargetIsLocal, resolveDatabaseUrl } from "./env";
import { resolveDatabaseSsl } from "../src/lib/server/databaseSsl";
import { getSampleLedger } from "../src/lib/domain/transparencySample";

function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  // Resolved through prisma/env.ts rather than read straight from process.env, so
  // the seed and `prisma db push` can never disagree about which database they are
  // talking to. They used to, and the pair still exited 0 while doing it.
  const connectionString = resolveDatabaseUrl();

  // This script is not additive — see the deleteMany calls in the pet loop below.
  // Aimed at a shared database it destroys real history rows, and it runs
  // unattended from an npm script with no confirmation prompt, so the target is
  // checked before a connection is opened.
  assertSeedTargetIsLocal(connectionString);

  // Same policy as the app. Unreachable for a remote host unless ALLOW_REMOTE_SEED is
  // set, but that is exactly the case where an unverified certificate would matter.
  const sslPolicy = resolveDatabaseSsl(connectionString);
  const pool = new Pool({
    connectionString: sslPolicy.connectionString,
    ssl: sslPolicy.ssl,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("🌱 Starting Hope for Strays database seeding...");

  // 1. Seed Staff Users
  const staffUsers = [
    {
      id: "usr-admin-01",
      email: "admin@hopeforstrays.org",
      name: "Dr. Sarah Tan",
      role: "SUPER_ADMIN" as const,
      password: "admin123",
    },
    {
      id: "usr-coord-01",
      email: "coordinator@hopeforstrays.org",
      name: "Priya Devi",
      role: "VOLUNTEER_COORDINATOR" as const,
      password: "coord123",
    },
    {
      id: "usr-animal-01",
      email: "animals@hopeforstrays.org",
      name: "Ahmad Razak",
      role: "ANIMAL_MANAGER" as const,
      password: "animal123",
    },
    {
      id: "usr-editor-01",
      email: "content@hopeforstrays.org",
      name: "Mei Ling",
      role: "CONTENT_EDITOR" as const,
      password: "content123",
    },
    {
      id: "usr-staff-01",
      email: "staff@hopeforstrays.org",
      name: "Nurul Aina",
      role: "STAFF" as const,
      password: "staff123",
    },
  ];

  for (const user of staffUsers) {
    const passwordHash = hashPasswordSync(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        status: "ACTIVE" as const,
        passwordHash,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: "ACTIVE" as const,
        passwordHash,
      },
    });
    console.log(`  ✓ Staff user seeded: ${user.email} (${user.role})`);
  }

  // 2. Seed Shelter Settings
  await prisma.shelterSettings.upsert({
    where: { id: "default-settings" },
    update: {},
    create: {
      id: "default-settings",
      shelterName: "Hope for Strays",
      email: "info@hopeforstrays.org",
      phone: "03-7876 5432",
      address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia",
      operatingHours: "Tuesday – Sunday: 10:00 AM – 5:00 PM",
      announcementBanner: "Adoption Drive this weekend in SS2! Meet our rescued dogs and cats.",
      adoptionFeeDog: "Free",
      adoptionFeeCat: "Free",
    },
  });
  console.log("  ✓ Shelter settings seeded.");

  // 3. Seed 5NF Clinical Categories & Certified Veterinarians
  const procedureCategories = [
    { id: "intake", name: "Intake Assessment", nameMs: "Penilaian Kemasukan", description: "Initial shelter triage and intake physical examination." },
    { id: "diagnostic", name: "Diagnostic & Lab", nameMs: "Diagnostik & Makmal", description: "Blood panel, parasite testing, skin cytology, and imaging." },
    { id: "treatment", name: "Medical Treatment", nameMs: "Rawatan Perubatan", description: "Wound care, antibiotics, IV fluids, and medical stabilization." },
    { id: "vaccination", name: "Core Vaccination", nameMs: "Vaksinasi Asas", description: "Core vaccines (DHPPiL/FVRCP), deworming, and rabies prophylaxis." },
    { id: "surgery", name: "Surgical Procedure", nameMs: "Pembedahan", description: "Spay/neuter sterilization, orthopedics, and soft tissue repair." },
    { id: "clearance", name: "Adoption Medical Clearance", nameMs: "Kebenaran Perubatan Pengangkatan", description: "Final adoption physical clearance and certificate." },
  ];

  for (const cat of procedureCategories) {
    await prisma.medicalProcedureCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, nameMs: cat.nameMs, description: cat.description },
      create: cat,
    });
  }

  const veterinarians = [
    { id: "vet-01", name: "Dr. Sarah Tan", licenseNumber: "MVC-2018-8892", clinicName: "Hope Veterinary Clinic PJ", phone: "03-7956 1234", email: "dr.sarah@hopevet.my" },
    { id: "vet-02", name: "Dr. Ramesh Kumar", licenseNumber: "MVC-2015-4120", clinicName: "Selangor Animal Medical Centre", phone: "03-5632 8765", email: "dr.ramesh@selangorvet.my" },
    { id: "vet-03", name: "Dr. Lim Wei Ling", licenseNumber: "MVC-2020-9931", clinicName: "Damansara Feline & Canine Clinic", phone: "03-7728 5410", email: "dr.lim@damansaravet.my" },
  ];

  for (const vet of veterinarians) {
    await prisma.veterinarian.upsert({
      where: { licenseNumber: vet.licenseNumber },
      update: { name: vet.name, clinicName: vet.clinicName, phone: vet.phone, email: vet.email },
      create: vet,
    });
  }

  const specializations = [
    { vetId: "vet-01", categoryId: "intake" },
    { vetId: "vet-01", categoryId: "diagnostic" },
    { vetId: "vet-01", categoryId: "treatment" },
    { vetId: "vet-01", categoryId: "vaccination" },
    { vetId: "vet-01", categoryId: "surgery" },
    { vetId: "vet-01", categoryId: "clearance" },
    { vetId: "vet-02", categoryId: "surgery" },
    { vetId: "vet-02", categoryId: "treatment" },
    { vetId: "vet-02", categoryId: "diagnostic" },
    { vetId: "vet-03", categoryId: "intake" },
    { vetId: "vet-03", categoryId: "vaccination" },
    { vetId: "vet-03", categoryId: "clearance" },
  ];

  for (const spec of specializations) {
    await prisma.vetSpecialization.upsert({
      where: { vetId_categoryId: { vetId: spec.vetId, categoryId: spec.categoryId } },
      update: {},
      create: spec,
    });
  }
  console.log("  ✓ 5NF Clinical procedure categories & veterinarian specializations seeded.");

  // 4. Seed Pets
  for (const pet of petsData) {
    // Rehabilitation details exist only on animals currently under care.
    const rehab = pet as {
      rehabStage?: string;
      rehabStageMs?: string;
      rehabProgressPercent?: number;
    };

    // Nested history is present on only some fixtures, so the JSON's inferred
    // type does not carry these keys on every entry.
    const history = pet as unknown as {
      updates?: {
        id: string;
        date: string;
        title: string;
        titleMs?: string;
        content: string;
        contentMs?: string;
        image?: string;
        category?: string;
      }[];
      medicalTimeline?: {
        id: string;
        date: string;
        title: string;
        titleMs?: string;
        category: string;
        description: string;
        descriptionMs?: string;
        veterinarian?: string;
        verified?: boolean;
        badge?: string;
        badgeMs?: string;
      }[];
    };

    const petUpdates = (history.updates || []).map((u) => ({
      id: u.id,
      date: u.date,
      title: u.title,
      titleMs: u.titleMs ?? null,
      content: u.content,
      contentMs: u.contentMs ?? null,
      image: u.image ?? null,
      category: u.category ?? null,
    }));

    const timelineEvents = (history.medicalTimeline || []).map((e) => {
      // Resolve vetId from registered veterinarians
      let vetId: string | null = "vet-01";
      if (e.veterinarian?.includes("Ramesh")) vetId = "vet-02";
      else if (e.veterinarian?.includes("Lim")) vetId = "vet-03";

      return {
        id: e.id,
        date: e.date,
        title: e.title,
        titleMs: e.titleMs ?? null,
        category: e.category,
        description: e.description,
        descriptionMs: e.descriptionMs ?? null,
        veterinarian: e.veterinarian ?? "Dr. Sarah Tan",
        vetId,
        verified: e.verified ?? false,
        badge: e.badge ?? null,
        badgeMs: e.badgeMs ?? null,
      };
    });

    // History and 5NF join rows keep their fixture ids, so re-seeding clears them
    // before re-creating rather than relying on an upsert per event.
    await prisma.petUpdate.deleteMany({ where: { petId: pet.id } });
    await prisma.medicalTimelineEvent.deleteMany({ where: { petId: pet.id } });
    await prisma.vetPetAssignment.deleteMany({ where: { petId: pet.id } });
    await prisma.petCompatibilityRule.deleteMany({ where: { petId: pet.id } });

    const birthDate = (pet as { birthDate?: string }).birthDate || "2024-01-01";
    const birthDateIsEstimate = (pet as { birthDateIsEstimate?: boolean }).birthDateIsEstimate ?? true;

    const petStatus =
      pet.status === "In Rehabilitation" || pet.status === "Rehabilitation"
        ? PetStatus.In_Rehabilitation
        : pet.status === "Pending"
          ? PetStatus.Pending
          : pet.status === "Adopted"
            ? PetStatus.Adopted
            : PetStatus.Available;

    await prisma.pet.upsert({
      where: { id: pet.id },
      update: {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        birthDate,
        birthDateIsEstimate,
        gender: pet.gender,
        size: pet.size,
        weight: pet.weight,
        status: petStatus,
        adoptionFee: pet.adoptionFee,
        description: pet.description,
        rescueStory: pet.rescueStory,
        image: pet.image,
        galleryImages: pet.galleryImages || [],
        tags: pet.tags || [],
        featured: pet.featured || false,
        intakeDate: pet.intakeDate,
        rehabStage: rehab.rehabStage ?? null,
        rehabStageMs: rehab.rehabStageMs ?? null,
        rehabProgressPercent: rehab.rehabProgressPercent ?? null,
        vaccinated: pet.medical?.vaccinated ?? true,
        microchipped: pet.medical?.microchipped ?? true,
        spayedNeutered: pet.medical?.spayedNeutered ?? true,
        specialNeeds: pet.medical?.specialNeeds || null,
        goodWithDogs: pet.compatibility?.goodWithDogs ?? true,
        goodWithCats: pet.compatibility?.goodWithCats ?? true,
        goodWithKids: pet.compatibility?.goodWithKids ?? true,
        energyLevel: pet.compatibility?.energyLevel || "Moderate",
        isArchived: false,
        deletedAt: null,
        updates: { create: petUpdates },
        medicalTimeline: { create: timelineEvents },
      },
      create: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        birthDate,
        birthDateIsEstimate,
        gender: pet.gender,
        size: pet.size,
        weight: pet.weight,
        status: petStatus,
        adoptionFee: pet.adoptionFee,
        description: pet.description,
        rescueStory: pet.rescueStory,
        image: pet.image,
        galleryImages: pet.galleryImages || [],
        tags: pet.tags || [],
        featured: pet.featured || false,
        intakeDate: pet.intakeDate,
        rehabStage: rehab.rehabStage ?? null,
        rehabStageMs: rehab.rehabStageMs ?? null,
        rehabProgressPercent: rehab.rehabProgressPercent ?? null,
        vaccinated: pet.medical?.vaccinated ?? true,
        microchipped: pet.medical?.microchipped ?? true,
        spayedNeutered: pet.medical?.spayedNeutered ?? true,
        specialNeeds: pet.medical?.specialNeeds || null,
        goodWithDogs: pet.compatibility?.goodWithDogs ?? true,
        goodWithCats: pet.compatibility?.goodWithCats ?? true,
        goodWithKids: pet.compatibility?.goodWithKids ?? true,
        energyLevel: pet.compatibility?.energyLevel || "Moderate",
        isArchived: false,
        deletedAt: null,
        updates: { create: petUpdates },
        medicalTimeline: { create: timelineEvents },
      },
    });

    // 5NF Join: Assign attending veterinarian to pet
    await prisma.vetPetAssignment.upsert({
      where: { vetId_petId: { vetId: "vet-01", petId: pet.id } },
      update: { isPrimary: true },
      create: { vetId: "vet-01", petId: pet.id, isPrimary: true },
    });

    // 5NF Join: Seed lifestyle & housing compatibility matrix rules
    const rules = [
      { housingType: "condo_apartment", cohabitantType: "resident_dogs", isAllowed: pet.compatibility?.goodWithDogs ?? true },
      { housingType: "condo_apartment", cohabitantType: "resident_cats", isAllowed: pet.compatibility?.goodWithCats ?? true },
      { housingType: "condo_apartment", cohabitantType: "toddlers", isAllowed: pet.compatibility?.goodWithKids ?? true },
      { housingType: "landed_fenced_yard", cohabitantType: "resident_dogs", isAllowed: pet.compatibility?.goodWithDogs ?? true },
      { housingType: "landed_fenced_yard", cohabitantType: "resident_cats", isAllowed: pet.compatibility?.goodWithCats ?? true },
      { housingType: "landed_fenced_yard", cohabitantType: "toddlers", isAllowed: pet.compatibility?.goodWithKids ?? true },
    ];

    for (const rule of rules) {
      await prisma.petCompatibilityRule.upsert({
        where: {
          petId_housingType_cohabitantType: {
            petId: pet.id,
            housingType: rule.housingType,
            cohabitantType: rule.cohabitantType,
          },
        },
        update: { isAllowed: rule.isAllowed },
        create: {
          petId: pet.id,
          housingType: rule.housingType,
          cohabitantType: rule.cohabitantType,
          isAllowed: rule.isAllowed,
        },
      });
    }
  }
  console.log(`  ✓ ${petsData.length} shelter pets and 5NF compatibility matrices seeded.`);

  // 4. Seed Applications
  for (const app of applicationsData) {
    const appStatus = app.status as ApplicationStatus;

    await prisma.adoptionApplication.upsert({
      where: { id: app.id },
      update: {
        petId: app.petId,
        petName: app.petName,
        petBreed: app.petBreed || null,
        applicantName: app.applicantName,
        email: app.email,
        phone: app.phone,
        address: app.address,
        housingType: app.housingType,
        hasFencedYard: app.hasFencedYard,
        currentPets: app.currentPets,
        currentPetDetails: app.currentPetDetails || null,
        householdExperience: app.householdExperience,
        applicantNotes: app.applicantNotes || null,
        status: appStatus,
        adminReviewNotes: app.adminReviewNotes || null,
      },
      create: {
        id: app.id,
        petId: app.petId,
        petName: app.petName,
        petBreed: app.petBreed || null,
        applicantName: app.applicantName,
        email: app.email,
        phone: app.phone,
        address: app.address,
        housingType: app.housingType,
        hasFencedYard: app.hasFencedYard,
        currentPets: app.currentPets,
        currentPetDetails: app.currentPetDetails || null,
        householdExperience: app.householdExperience,
        applicantNotes: app.applicantNotes || null,
        status: appStatus,
        adminReviewNotes: app.adminReviewNotes || null,
      },
    });
  }
  console.log(`  ✓ ${applicationsData.length} adoption applications seeded.`);

  // 5. Seed the SAMPLE financial transparency ledger — explicit opt-in only.
  //
  // `assertSeedTargetIsLocal` above already refuses a non-local target, so this
  // is not about protecting production. It is about what the rows MEAN: these are
  // invented figures with realistic invoice references, and seeding them marks
  // them published, which makes /transparency render them as verified shelter
  // spending indistinguishable from real records. A ledger that exists to prove
  // honesty should not be populated with fiction unless someone asks for it.
  const seedSampleLedger = process.env.SEED_SAMPLE_TRANSPARENCY === "true";
  const sampleLedger = getSampleLedger();

  if (seedSampleLedger) {
    console.warn(
      "  ⚠ Seeding the SAMPLE financial ledger. These figures are invented — never present them as real spending."
    );

    for (const expense of sampleLedger.expenses) {
      const data = {
        category: expense.category,
        title: expense.title,
        amountSen: expense.amountSen,
        date: expense.date,
        vendorOrClinic: expense.vendorOrClinic,
        petName: expense.petName,
        receiptRef: expense.receiptRef,
        isPublished: true,
      };
      await prisma.expenseItem.upsert({
        where: { id: expense.id },
        update: data,
        create: { id: expense.id, ...data },
      });
    }
    console.log(`  ✓ ${sampleLedger.expenses.length} expense ledger entries seeded.`);

    for (const report of sampleLedger.reports) {
      const data = {
        year: report.year,
        month: report.month,
        title: report.title,
        fileUrl: report.fileUrl,
        summary: report.summary,
        publishedAt: new Date(report.publishedAt),
        isPublished: true,
      };
      await prisma.financialReport.upsert({
        where: { id: report.id },
        update: data,
        create: { id: report.id, ...data },
      });
    }
    console.log(`  ✓ ${sampleLedger.reports.length} financial reports seeded.`);

    for (const stat of sampleLedger.impactStats) {
      const data = {
        metricValue: stat.metricValue,
        label: stat.label,
        labelMs: stat.labelMs,
        period: stat.period,
        periodMs: stat.periodMs,
        displayOrder: stat.displayOrder,
        isPublished: true,
      };
      await prisma.impactStat.upsert({
        where: { key: stat.key },
        update: data,
        create: { id: stat.id, key: stat.key, ...data },
      });
    }
    console.log(`  ✓ ${sampleLedger.impactStats.length} impact statistics seeded.`);
  } else {
    console.log(
      "  ⏭ Skipped the sample financial ledger. Set SEED_SAMPLE_TRANSPARENCY=true to include it (development demos only)."
    );
  }
  // 5. Seed the public FAQ knowledge base.
  // Upserted by the fixture's stable ids, exactly like the pets above, so
  // re-running refreshes the launch copy without duplicating rows.
  // `isPublished` is set only on create: re-seeding must not silently
  // republish an entry that staff have taken down.
  for (const faq of faqsData) {
    await prisma.faq.upsert({
      where: { id: faq.id },
      update: {
        category: faq.category as FaqCategory,
        question: faq.question,
        answer: faq.answer,
        questionMs: faq.questionMs,
        answerMs: faq.answerMs,
        displayOrder: faq.displayOrder,
      },
      create: {
        id: faq.id,
        category: faq.category as FaqCategory,
        question: faq.question,
        answer: faq.answer,
        questionMs: faq.questionMs,
        answerMs: faq.answerMs,
        displayOrder: faq.displayOrder,
        isPublished: faq.isPublished,
      },
    });
  }
  console.log(`  ✓ ${faqsData.length} FAQ entries seeded.`);

  // 6. Seed the community bulletins.
  // Same contract as the FAQ block above: upserted by the fixture's stable ids
  // so re-running refreshes the launch copy without duplicating rows, and
  // `isPublished` / `isPinned` are set only on create so a re-seed cannot
  // republish or re-pin a notice staff have deliberately taken down.
  //
  // `authorName` comes from the fixture rather than a session because these
  // rows predate any editor. Notices posted through /admin/bulletins take the
  // byline from the acting staff member instead.
  for (const bulletin of bulletinsData) {
    await prisma.bulletin.upsert({
      where: { id: bulletin.id },
      update: {
        category: bulletin.category as BulletinCategory,
        targetPage: bulletin.targetPage as BulletinTargetPage,
        title: bulletin.title,
        content: bulletin.content,
        titleMs: bulletin.titleMs,
        contentMs: bulletin.contentMs,
        mediaType: bulletin.mediaType as BulletinMediaType,
        mediaUrl: bulletin.mediaUrl,
        videoEmbedUrl: bulletin.videoEmbedUrl,
        authorName: bulletin.authorName,
        publishedAt: new Date(`${bulletin.publishedAt}T00:00:00.000Z`),
      },
      create: {
        id: bulletin.id,
        category: bulletin.category as BulletinCategory,
        targetPage: bulletin.targetPage as BulletinTargetPage,
        title: bulletin.title,
        content: bulletin.content,
        titleMs: bulletin.titleMs,
        contentMs: bulletin.contentMs,
        mediaType: bulletin.mediaType as BulletinMediaType,
        mediaUrl: bulletin.mediaUrl,
        videoEmbedUrl: bulletin.videoEmbedUrl,
        isPinned: bulletin.isPinned,
        isPublished: bulletin.isPublished,
        authorName: bulletin.authorName,
        publishedAt: new Date(`${bulletin.publishedAt}T00:00:00.000Z`),
      },
    });
  }
  console.log(`  ✓ ${bulletinsData.length} community bulletins seeded.`);

  // 7. Initial Audit Log
  await prisma.auditLog.create({
    data: {
      action: "DATABASE_SEEDED",
      actorId: "system",
      actorEmail: "system@hopeforstrays.org",
      actorRole: "SYSTEM",
      targetEntity: "System",
      details: "Initial database seed completed successfully.",
      metadata: {
        seededPets: petsData.length,
        seededApplications: applicationsData.length,
        seededStaff: staffUsers.length,
        seededExpenses: seedSampleLedger ? sampleLedger.expenses.length : 0,
        seededReports: seedSampleLedger ? sampleLedger.reports.length : 0,
        seededImpactStats: seedSampleLedger ? sampleLedger.impactStats.length : 0,
        sampleLedgerSeeded: seedSampleLedger,
        seededFaqs: faqsData.length,
        seededBulletins: bulletinsData.length,
      },
    },
  });
  console.log("  ✓ Initial system audit log created.");

  await prisma.$disconnect();
  await pool.end();
  console.log("🎉 Database seeding completed successfully!");
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
