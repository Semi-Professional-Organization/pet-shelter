import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from "vitest";
import initialPets from "@/data/pets.json";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";
import {
  SPONSORSHIP_ANIMAL_NOT_FOUND_MESSAGE,
  SPONSORSHIP_RECORDING_FAILURE_MESSAGE,
} from "@/lib/domain/contributionFailure";

/**
 * Tier 3a — during a database outage, `src/data/pets.json` may be shown but never written
 * against or billed (#90, #97, #91).
 *
 * `findServerPetByIdAsync` answers from the mirror when its query throws outside strict mode,
 * which is every deployed environment. For a profile that is a stale page for the length of an
 * outage. For the adoption form and sponsorship checkout it was an application acknowledged with
 * a reference code that no database held, and a pledge recorded against a demo animal. Those two
 * now read with `findPetForWriteAsync`, which throws instead, and the application insert no
 * longer reports success when the database refused it.
 *
 * Most cases run in **non-strict** mode with `DATABASE_URL` set — the production shape, and the
 * only one where the fallback runs at all; strict mode rethrows before any fallback and would
 * pass against the broken code. Every id is `pet-001`, a real fixture row that is Available and
 * unarchived there, so the mirror really can answer for it: an id absent from `pets.json` would
 * be refused by the broken code as well, for the wrong reason.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

/** Stubbed at the ledger for the reason `petMissingRowIsAnAnswer.test.ts` gives. */
vi.mock("@/lib/server/sponsorshipLedger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/sponsorshipLedger")>();
  return {
    ...actual,
    recordSponsorshipPledge: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      id: "itest-pledge",
      pledgeRef: "SP-ITEST-0001",
      status: "PENDING_PAYMENT",
      createdAt: new Date(0).toISOString(),
    })),
  };
});

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendSponsorshipWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    sendStaffApplicationAlert: vi.fn().mockResolvedValue(undefined),
  };
});

const FIXTURE_ID = "pet-001";
const FIXTURE_NAME = "Bella";

let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(double);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// The console spies below silence expected noise; restoring them keeps a later failure's
// diagnostics visible. Spies only: the module mocks above are not affected.
afterEach(() => {
  vi.restoreAllMocks();
});

/** Production's shape: a database is configured, and nothing rethrows. */
function inProductionMode() {
  vi.stubEnv("STRICT_PERSISTENCE", "false");
  vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
}

function givenDatabaseDown() {
  double.pet.findUnique.mockRejectedValue(new Error("connection refused"));
}

function application(petId = FIXTURE_ID) {
  return {
    petId,
    petName: FIXTURE_NAME,
    applicantName: "Ahmad Razak",
    email: "ahmad.razak@example.com",
    phone: "012-3456789",
    identification: "880101-14-5678",
    address: "No. 24, Jalan SS 2/10, Petaling Jaya",
    housingType: "landed_terrace" as const,
    hasFencedYard: "yes" as const,
    landlordApproval: "owner_occupied" as const,
    currentPets: "none" as const,
    householdExperience: "experienced" as const,
    vetClinic: "Klinik Haiwan SS2",
    dailyAloneHours: "4_to_8" as const,
  };
}

function sponsorship(email: string) {
  return {
    petId: FIXTURE_ID,
    petName: FIXTURE_NAME,
    sponsorName: "Integration Sponsor",
    sponsorEmail: email,
    amountMYR: 50,
  };
}

it("uses an id the bundled fixture really holds, unarchived", () => {
  const fixture = (initialPets as Array<{ id: string; name: string; isArchived?: boolean }>).find(
    (p) => p.id === FIXTURE_ID
  );
  expect(fixture?.name).toBe(FIXTURE_NAME);
  expect(fixture?.isArchived ?? false).toBe(false);
});

describe("the write-path reader does not answer from the mirror", () => {
  it("throws when the database is configured and cannot answer", async () => {
    inProductionMode();
    givenDatabaseDown();
    const { findPetForWriteAsync, PetStoreUnavailableError } = await import("@/lib/server/petRepository");

    await expect(findPetForWriteAsync(FIXTURE_ID)).rejects.toBeInstanceOf(PetStoreUnavailableError);
  });

  it("rethrows the query's own error under strict persistence, as every reader does", async () => {
    // Still no mirror; but a broken query in the strict tier must surface as itself, not as an
    // outage the callers would turn into polite refusal copy.
    double.pet.findUnique.mockRejectedValue(new Error('relation "pets" does not exist'));
    const { findPetForWriteAsync } = await import("@/lib/server/petRepository");

    await expect(findPetForWriteAsync(FIXTURE_ID)).rejects.toThrow(/relation "pets"/);
  });

  it("reads the pets row alone and leaves the mirror untouched", async () => {
    // The callers need the scalar columns only. Without the joins, a fault in the history
    // tables cannot refuse an adoption or a pledge, and an anonymous POST cannot reorder the
    // mirror `markCachedPetAdopted` searches.
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: "Persisted Bella" }));
    const { findPetForWriteAsync, getServerPets } = await import("@/lib/server/petRepository");
    const mirrorBefore = getServerPets();

    expect(await findPetForWriteAsync(FIXTURE_ID)).toMatchObject({ id: FIXTURE_ID, name: "Persisted Bella" });
    expect(double.pet.findUnique).toHaveBeenCalledWith({ where: { id: FIXTURE_ID } });
    expect(getServerPets()).toBe(mirrorBefore);
  });

  it("answers from the mirror when no database is configured, where it is the whole store", async () => {
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "");
    const { findPetForWriteAsync } = await import("@/lib/server/petRepository");

    expect(await findPetForWriteAsync(FIXTURE_ID)).toMatchObject({ id: FIXTURE_ID, name: FIXTURE_NAME });
    expect(double.pet.findUnique).not.toHaveBeenCalled();
  });
});

describe("a profile may show the fixture during an outage (#90, display half)", () => {
  it("still serves the demo animal on the public profile", async () => {
    // The decision this file pins has two halves, and this is the permissive one: a page can
    // be stale for the length of an outage. If this ever changes, change it deliberately.
    inProductionMode();
    givenDatabaseDown();
    const { getPetById } = await import("@/actions/pets");

    expect(await getPetById(FIXTURE_ID)).toMatchObject({ id: FIXTURE_ID, name: FIXTURE_NAME });
  });
});

describe("sponsorship checkout refuses during an outage (#90, billing half)", () => {
  it("records no pledge and says nothing was recorded", async () => {
    inProductionMode();
    givenDatabaseDown();
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorship("sponsor.outage@example.test"));

    expect(result).toEqual({ success: false, error: SPONSORSHIP_RECORDING_FAILURE_MESSAGE });
    expect(ledger.recordSponsorshipPledge).not.toHaveBeenCalled();
  });
});

describe("sponsorship checkout refuses an archived animal (#91)", () => {
  it("records no pledge for a row the shelter has archived", async () => {
    // Strict mode: the database answers, and what it says is that the animal is taken down.
    // The fixture says unarchived, so only a check on the row read can refuse this.
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: "Persisted Bella", isArchived: true }));
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorship("sponsor.archived@example.test"));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Persisted Bella is no longer available for sponsorship/);
    expect(ledger.recordSponsorshipPledge).not.toHaveBeenCalled();
  });

  it("says the animal was not found, not that a pledge is unconfirmed, for a missing row", async () => {
    double.pet.findUnique.mockResolvedValue(null);
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction(sponsorship("sponsor.gone@example.test"));

    expect(result).toEqual({ success: false, error: SPONSORSHIP_ANIMAL_NOT_FOUND_MESSAGE });
    expect(ledger.recordSponsorshipPledge).not.toHaveBeenCalled();
  });
});

describe("an adoption application is never acknowledged without a database row (#97)", () => {
  it("refuses when the animal cannot be read", async () => {
    inProductionMode();
    givenDatabaseDown();
    const { submitApplication } = await import("@/actions/applications");

    const result = await submitApplication(application());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/adoption records are unavailable/i);
    expect(result.data).toBeUndefined();
    expect(double.adoptionApplication.create).not.toHaveBeenCalled();
  });

  it("refuses when the insert fails, and keeps the record out of the mirror", async () => {
    // The animal reads fine; the write is what fails. P2003 is the code #97 names, and
    // `handlePersistenceError` swallows it outside strict mode.
    inProductionMode();
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: FIXTURE_NAME }));
    double.adoptionApplication.create.mockRejectedValue(
      Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { submitApplication } = await import("@/actions/applications");
    const { getServerApplications } = await import("@/lib/server/applicationRepository");
    const before = getServerApplications().length;

    const result = await submitApplication(application());

    expect(result.success).toBe(false);
    // Not "nothing was submitted": a commit followed by a lost connection lands here too.
    expect(result.error).toMatch(/could not confirm that your application was saved/i);
    expect(result.error).not.toMatch(/nothing was submitted/i);
    expect(double.adoptionApplication.create).toHaveBeenCalled();
    expect(getServerApplications()).toHaveLength(before);
    // The side effects that would hand out a reference code anyway.
    const email = await import("@/lib/email");
    expect(email.sendApplicationConfirmationEmail).not.toHaveBeenCalled();
    expect(email.sendStaffApplicationAlert).not.toHaveBeenCalled();
  });

  it("still accepts and writes the application when the database is healthy", async () => {
    // Positive control: without it, a submission failing for any unrelated reason would read
    // as the two refusals above working.
    inProductionMode();
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: FIXTURE_NAME }));
    const { submitApplication } = await import("@/actions/applications");

    const result = await submitApplication(application());

    expect(result.success).toBe(true);
    expect(result.data?.referenceCode).toBeTruthy();
    expect(double.adoptionApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ petId: FIXTURE_ID }) })
    );
  });
});
