import { describe, it, expect, vi } from "vitest";

/**
 * The global `beforeEach` in `tests/setup/nextMocks.ts` resets the user store and the sponsor
 * repository before every test in the suite. Their seed passwords are constants, so each store
 * derives the seed hashes once per process instead of on every reset: re-deriving the three
 * sponsor hashes alone cost each test about a quarter of a second, which was most of the unit
 * job's time on CI.
 *
 * Spied rather than timed: a timing assertion would pass or fail with the machine's load.
 */
vi.mock("@/lib/security/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/crypto")>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});

/**
 * A fresh copy of the modules, so that a store's once-per-process cache starts empty. The mocked
 * `hashPassword` is fresh too, and it is the one the fresh store imports.
 */
async function freshModules() {
  vi.resetModules();
  const { hashPassword } = await import("@/lib/security/crypto");
  return { hashPassword: vi.mocked(hashPassword) };
}

describe("sponsor seed accounts", () => {
  it("derives the seed password hashes once, however many resets follow", async () => {
    const { hashPassword } = await import("@/lib/security/crypto");
    const { resetSponsorRepository } = await import("@/lib/server/sponsorRepository");
    // The global `beforeEach` has already reset the repository once for this test.
    vi.mocked(hashPassword).mockClear();

    await resetSponsorRepository();
    await resetSponsorRepository();

    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("restores a wall preference that a test changed, so no test sees another's edit", async () => {
    const { findSponsorByEmail, resetSponsorRepository, setSponsorWallPreference, SEED_SPONSORS } =
      await import("@/lib/server/sponsorRepository");
    const seed = SEED_SPONSORS[0];
    expect(seed.displayOnWall).toBe(true);

    expect(await setSponsorWallPreference(seed.id, false)).toBe(true);
    expect((await findSponsorByEmail(seed.email))?.displayOnWall).toBe(false);

    // `setSponsorWallPreference` edits the stored record in place, so a cache that handed out
    // its own objects would carry this edit into every later test.
    await resetSponsorRepository();

    expect((await findSponsorByEmail(seed.email))?.displayOnWall).toBe(true);
  });

  it("derives the hashes again after a failed derivation, rather than failing every reset", async () => {
    const { hashPassword } = await freshModules();
    const { findSponsorByEmail, resetSponsorRepository, SEED_SPONSORS } = await import(
      "@/lib/server/sponsorRepository"
    );
    hashPassword.mockRejectedValueOnce(new Error("scrypt failed"));

    await expect(resetSponsorRepository()).rejects.toThrow("scrypt failed");
    // A cache that kept the rejected promise would rethrow it here, and on every reset after.
    await expect(resetSponsorRepository()).resolves.toBeUndefined();

    expect(await findSponsorByEmail(SEED_SPONSORS[0].email)).not.toBeNull();
  });
});

describe("staff seed accounts", () => {
  it("derives the hashes again after a failed derivation, rather than failing every reset", async () => {
    const { hashPassword } = await freshModules();
    const { listUsers, resetUserStore } = await import("@/lib/server/userStore");
    hashPassword.mockRejectedValueOnce(new Error("scrypt failed"));

    await expect(resetUserStore()).rejects.toThrow("scrypt failed");
    await expect(resetUserStore()).resolves.toBeUndefined();

    expect((await listUsers()).length).toBeGreaterThan(0);
  });
});
