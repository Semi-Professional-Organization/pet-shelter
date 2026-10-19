import { describe, it, expect, vi } from "vitest";

/**
 * The global `beforeEach` in `tests/setup/nextMocks.ts` resets the sponsor repository before
 * every test in the suite. While that reset re-derived the seed passwords, each test paid for
 * three scrypt derivations, which was most of the unit job's time on CI. The passwords are
 * constants, so the hashes are derived once per process, as `userStore.ts` already does for the
 * staff seeds.
 *
 * Spied rather than timed: a timing assertion would pass or fail with the machine's load.
 */
vi.mock("@/lib/security/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/crypto")>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});

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
});
