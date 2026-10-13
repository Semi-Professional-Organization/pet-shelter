import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LEGACY_ADMIN_TOKEN_PRINCIPAL,
  verifyAdminSession,
} from "@/lib/security/adminSession";
import { sealSession, SESSION_COOKIE_NAME } from "@/lib/security/session";
import { getAuditLogs } from "@/lib/domain/auditLog";
import {
  getPublicPets,
  getAdminPets,
  createPet,
  updatePet,
  toggleArchivePet,
  deletePet,
  updatePetStatus,
} from "@/actions/pets";
import { submitApplication } from "@/actions/applications";
import { insertServerPet } from "@/lib/server/petRepository";
import { Pet } from "@/types/pet";

// Mock next/headers cookies
const mockCookieMap = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookieMap.get(name),
    set: (name: string, value: string) => {
      mockCookieMap.set(name, { value });
    },
    delete: (name: string) => {
      mockCookieMap.delete(name);
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const ADMIN_SECRET = "test_super_secret_admin_key";

/** A real, signed-in administrator: the identity the legacy token must not resemble. */
const REAL_ADMIN = {
  id: "admin-1",
  email: "admin@hopeforstrays.org",
  name: "Admin User",
  role: "ADMIN" as const,
};

const VOLUNTEER = {
  id: "vol-1",
  email: "vol@hopeforstrays.org",
  name: "Volunteer User",
  role: "VOLUNTEER" as const,
};

function makeTestPet(id: string): Pet {
  return {
    id,
    name: `Doggo_${id}`,
    species: "dog",
    breed: "Golden Mix",
    age: "2 years",
    ageCategory: "young",
    gender: "Male",
    size: "Medium",
    weight: "18 kg",
    status: "Available",
    adoptionFee: "Free",
    description: "A lovely rescue dog for testing soft delete.",
    rescueStory: "Rescued safely.",
    image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1",
    tags: ["Friendly", "Vaccinated"],
    featured: false,
    intakeDate: "2026-01-01",
    isArchived: false,
    deletedAt: null,
    medical: {
      vaccinated: true,
      microchipped: true,
      spayedNeutered: true,
    },
    compatibility: {
      goodWithDogs: true,
      goodWithCats: true,
      goodWithKids: true,
      energyLevel: "Moderate",
    },
  };
}

describe("Security & Route Protection (verifyAdminSession)", () => {
  beforeEach(() => {
    mockCookieMap.clear();
  });

  it("names the sealed ADMIN session as the principal", async () => {
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(REAL_ADMIN) });

    const principal = await verifyAdminSession();
    expect(principal).toMatchObject({
      id: "admin-1",
      email: "admin@hopeforstrays.org",
      role: "ADMIN",
      authMethod: "session",
    });
  });

  it("names the sealed COORDINATOR session as the principal", async () => {
    const token = sealSession({
      id: "coord-1",
      email: "coord@hopeforstrays.org",
      name: "Coord User",
      role: "COORDINATOR",
    });
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: token });

    const principal = await verifyAdminSession();
    expect(principal).toMatchObject({
      id: "coord-1",
      role: "COORDINATOR",
      authMethod: "session",
    });
  });

  it("returns null for unauthorized role like VOLUNTEER unless admin secret is provided", async () => {
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(VOLUNTEER) });

    const principal = await verifyAdminSession();
    expect(principal).toBeNull();
  });

  it("names the legacy token when the admin_session secret cookie matches", async () => {
    process.env.ADMIN_SECRET_KEY = ADMIN_SECRET;
    mockCookieMap.set("admin_session", { value: ADMIN_SECRET });

    const principal = await verifyAdminSession();
    expect(principal).toEqual(LEGACY_ADMIN_TOKEN_PRINCIPAL);
    expect(principal?.authMethod).toBe("legacy-shared-secret");
  });

  it("names the token, not the user, when the secret authorizes a VOLUNTEER request", async () => {
    // The token is what authorized this, so the token is what gets named. The
    // previous implementation read the session a second time and attributed the
    // mutation to the VOLUNTEER, who was never authorized for it.
    process.env.ADMIN_SECRET_KEY = ADMIN_SECRET;
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(VOLUNTEER) });
    mockCookieMap.set("admin_session", { value: ADMIN_SECRET });

    const principal = await verifyAdminSession();
    expect(principal?.id).toBe(LEGACY_ADMIN_TOKEN_PRINCIPAL.id);
    expect(principal?.email).not.toBe(VOLUNTEER.email);
  });

  it("returns null when no session and invalid secret cookie", async () => {
    mockCookieMap.set("admin_session", { value: "wrong_password" });

    const principal = await verifyAdminSession();
    expect(principal).toBeNull();
  });
});

describe("Audit trail distinguishes the legacy token from a real administrator", () => {
  beforeEach(() => {
    mockCookieMap.clear();
    process.env.ADMIN_SECRET_KEY = ADMIN_SECRET;
  });

  /**
   * Archives a fresh pet through the real action and returns the audit row it
   * produced. Whatever authorized the call is whatever the row must name.
   */
  async function archiveAndReadAuditRow() {
    const petId = `audit-pet-${Math.random().toString(36).substring(7)}`;
    // Seeded directly, so the fixture write is not the row under test.
    await insertServerPet(makeTestPet(petId), { ...REAL_ADMIN, expiresAt: Date.now() + 86400000 });

    const result = await toggleArchivePet(petId, true);
    expect(result.success).toBe(true);

    const row = getAuditLogs(200).find(
      (entry) => entry.action === "PET_ARCHIVED" && entry.entityId === petId
    );
    expect(row).toBeDefined();
    return row!;
  }

  function authenticateAsRealAdmin() {
    mockCookieMap.clear();
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(REAL_ADMIN) });
  }

  function authenticateWithSharedSecret() {
    mockCookieMap.clear();
    mockCookieMap.set("admin_session", { value: ADMIN_SECRET });
  }

  it("records the signed-in administrator when a sealed session authorized the archive", async () => {
    authenticateAsRealAdmin();

    const row = await archiveAndReadAuditRow();
    expect(row.actorId).toBe("admin-1");
    expect(row.actorEmail).toBe("admin@hopeforstrays.org");
  });

  it("records an unmistakably non-human identity when only the shared secret authorized it", async () => {
    authenticateWithSharedSecret();

    const row = await archiveAndReadAuditRow();
    expect(row.actorId).toBe(LEGACY_ADMIN_TOKEN_PRINCIPAL.id);
    expect(row.actorEmail).toBe(LEGACY_ADMIN_TOKEN_PRINCIPAL.email);
    // `.invalid` is reserved by RFC 2606, so this can never be a staff mailbox.
    expect(row.actorEmail.endsWith(".invalid")).toBe(true);
  });

  it("writes a different actor for each, though both carry the ADMIN role", async () => {
    // This is the property the change exists for. Before it, both paths wrote
    // admin@hopeforstrays.org and an auditor could not tell which had acted.
    authenticateAsRealAdmin();
    const sessionRow = await archiveAndReadAuditRow();

    authenticateWithSharedSecret();
    const tokenRow = await archiveAndReadAuditRow();

    expect(sessionRow.actorRole).toBe("ADMIN");
    expect(tokenRow.actorRole).toBe("ADMIN");
    expect(tokenRow.actorId).not.toBe(sessionRow.actorId);
    expect(tokenRow.actorEmail).not.toBe(sessionRow.actorEmail);
  });
});

describe("Soft Deletes & Query Filtering", () => {
  const actor = {
    id: "test-admin",
    email: "admin@test.com",
    name: "Test Admin",
    role: "ADMIN" as const,
    expiresAt: Date.now() + 86400000,
  };

  let testPetId: string;

  beforeEach(async () => {
    mockCookieMap.clear();
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(REAL_ADMIN) });

    testPetId = `test-pet-${Math.random().toString(36).substring(7)}`;

    // Insert unique test pet
    await insertServerPet(makeTestPet(testPetId), actor);
  });

  it("includes active pet in getPublicPets", async () => {
    const publicPets = await getPublicPets({ search: testPetId });
    expect(publicPets.some((p) => p.id === testPetId)).toBe(true);
  });

  it("archives pet and excludes it from getPublicPets while keeping in getAdminPets", async () => {
    const archiveResult = await toggleArchivePet(testPetId, true);
    expect(archiveResult.success).toBe(true);

    // Should NOT appear in public pets
    const publicPets = await getPublicPets({ search: testPetId });
    expect(publicPets.some((p) => p.id === testPetId)).toBe(false);

    // SHOULD appear in admin pets with isArchived: true
    const adminPets = await getAdminPets();
    const archivedInAdmin = adminPets.find((p) => p.id === testPetId);
    expect(archivedInAdmin).toBeDefined();
    expect(archivedInAdmin?.isArchived).toBe(true);
    expect(archivedInAdmin?.deletedAt).toBeDefined();
  });

  it("restores archived pet to public catalog", async () => {
    await toggleArchivePet(testPetId, true);
    const restoreResult = await toggleArchivePet(testPetId, false);
    expect(restoreResult.success).toBe(true);

    const publicPets = await getPublicPets({ search: testPetId });
    expect(publicPets.some((p) => p.id === testPetId)).toBe(true);
  });

  it("blocks public adoption application submission on archived pet", async () => {
    await toggleArchivePet(testPetId, true);

    const submitResult = await submitApplication({
      petId: testPetId,
      petName: `Doggo_${testPetId}`,
      applicantName: "Jane Doe",
      email: `applicant_${Date.now()}@example.com`,
      phone: "012-3456789",
      address: "123 Jalan SS2, Petaling Jaya",
      housingType: "landed_terrace",
      hasFencedYard: "yes",
      currentPets: "none",
      householdExperience: "experienced",
      identification: "880101-14-5678",
      landlordApproval: "owner_occupied",
      vetClinic: "Klinik Haiwan SS2",
      dailyAloneHours: "4_to_8",
    });

    expect(submitResult.success).toBe(false);
    expect(submitResult.error).toContain("archived");
  });
});

/**
 * The regression guard for `docs/archives/tasks/URGENT_NONPRODUCTION_ADMIN_BYPASS.md`.
 *
 * `getAdminActorOrThrow()` used to throw only when `NODE_ENV === "production"`
 * and hand every other build an ADMIN principal, so an unauthenticated caller
 * could rewrite the catalogue on any dev, preview or CI instance -- this suite
 * included, since Vitest runs with `NODE_ENV=test`.
 *
 * Making the suites that relied on that bypass authenticate proves the
 * authorized path still works. Only this block proves the unauthorized one is
 * shut, so this is the test that must fail if the escape hatch ever returns.
 *
 * Every case asserts two things, because a refusal that still wrote is not a
 * refusal: the action reports failure, *and* the catalogue is unchanged.
 */
describe("Unauthenticated pet mutations are refused", () => {
  /** Each action funnels the throw through its own catch, so the message is the signal. */
  const REFUSED = /unauthorized/i;

  let existingPetId: string;

  beforeEach(async () => {
    // Nothing authorizes anything in this block: no signed session cookie and no
    // admin_session token. This is precisely the caller the bypass waved through.
    mockCookieMap.clear();

    existingPetId = `unauth-pet-${Math.random().toString(36).substring(7)}`;
    // Seeded through the repository rather than the action, so the fixture write
    // is not itself subject to the gate under test.
    await insertServerPet(makeTestPet(existingPetId), {
      ...REAL_ADMIN,
      expiresAt: Date.now() + 86400000,
    });
  });

  /** A payload that would succeed if -- and only if -- the caller were an admin. */
  function makeCreateForm(name: string) {
    return {
      name,
      species: "dog" as const,
      breed: "Golden Mix",
      birthDate: "2024-01-01",
      birthDateIsEstimate: true,
      gender: "Male" as const,
      size: "Medium" as const,
      weight: "18 kg",
      status: "Available" as const,
      adoptionFee: "Free",
      description: "A valid payload, so authorization is the only thing that can refuse it.",
      rescueStory: "Rescued safely; publishing this record is an administrator's job.",
      image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1",
      tags: ["Friendly"],
      intakeDate: "2026-01-01",
    };
  }

  /**
   * Reads the admin catalogue with a real administrator session.
   *
   * The mutation under test is attempted with no cookie, but the verification
   * read is itself a privileged query now that `getAdminPets()` is
   * authorization-guarded — an anonymous call throws rather than returning an
   * empty list. Signing in only for the read keeps each test's unauthenticated
   * precondition exactly where it belongs: on the mutation.
   */
  async function readAdminPetsAuthorized() {
    mockCookieMap.set(SESSION_COOKIE_NAME, { value: sealSession(REAL_ADMIN) });
    try {
      return await getAdminPets();
    } finally {
      mockCookieMap.delete(SESSION_COOKIE_NAME);
    }
  }

  it("names nobody as the principal when no cookie authorizes the request", async () => {
    await expect(verifyAdminSession()).resolves.toBeNull();
  });

  it("refuses createPet, and inserts no pet", async () => {
    const name = "Unauthenticated Create";

    const result = await createPet(makeCreateForm(name));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(REFUSED);
    expect((await readAdminPetsAuthorized()).some((p) => p.name === name)).toBe(false);
  });

  it("refuses updatePet, and leaves the stored record untouched", async () => {
    const result = await updatePet(existingPetId, makeCreateForm("Renamed By Nobody"));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(REFUSED);
    const stored = (await readAdminPetsAuthorized()).find((p) => p.id === existingPetId);
    expect(stored?.name).toBe(`Doggo_${existingPetId}`);
  });

  it("refuses toggleArchivePet, and the pet stays in the public catalogue", async () => {
    const result = await toggleArchivePet(existingPetId, true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(REFUSED);
    expect((await readAdminPetsAuthorized()).find((p) => p.id === existingPetId)?.isArchived).toBe(false);
    const publicPets = await getPublicPets({ search: existingPetId });
    expect(publicPets.some((p) => p.id === existingPetId)).toBe(true);
  });

  it("refuses deletePet, which delegates to toggleArchivePet and must not inherit a hole", async () => {
    const result = await deletePet(existingPetId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(REFUSED);
    expect((await readAdminPetsAuthorized()).find((p) => p.id === existingPetId)?.isArchived).toBe(false);
  });

  it("refuses updatePetStatus, and the status does not move", async () => {
    const result = await updatePetStatus(existingPetId, "Adopted");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(REFUSED);
    expect((await readAdminPetsAuthorized()).find((p) => p.id === existingPetId)?.status).toBe("Available");
  });

  it("writes no audit row for a refused mutation", async () => {
    // The bypass did not merely permit the write, it recorded one -- an audit
    // trail naming `unauthenticated@dev-bypass.invalid` as the actor. A refusal
    // must leave the log exactly as it found it.
    const rowsBefore = getAuditLogs(500).length;

    await createPet(makeCreateForm("Unauthenticated Audit"));
    await toggleArchivePet(existingPetId, true);
    await updatePetStatus(existingPetId, "Adopted");

    expect(getAuditLogs(500).length).toBe(rowsBefore);
  });
});
