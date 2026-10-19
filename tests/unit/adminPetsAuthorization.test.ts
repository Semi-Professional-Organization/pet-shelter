import { describe, it, expect, vi } from "vitest";
import { getAdminPets, getPublicPets } from "@/actions/pets";
import { ROLES } from "@/lib/security/permissions";
import { memberRowForId, signInAs } from "../setup/authSession";

/**
 * Regression guard for a real data exposure.
 *
 * `/admin/pets` is a Server Component that calls `getAdminPets()` directly.
 * The admin layout is a client component and shows a loading state until its
 * session effect resolves, but server-component output is serialised into the
 * RSC flight payload regardless — so while this function was unguarded, an
 * anonymous GET of /admin/pets returned 200 with the entire inventory,
 * including archived animals and per-pet application counts.
 */

/**
 * The member lookup `getVerifiedSession` makes on every guarded call — the one
 * database read this path needs answered; with no database configured, the
 * catalogue and the application counts come from the in-memory stores.
 *
 * This file used to mock `getCurrentSession` with a session for `actor-1`, an id
 * no store vouches for, and left Prisma real. The member lookup then failed for
 * want of a database, the DAL's outage fall-back handed back the mocked
 * session's own claims, and that fall-back is the only reason the admissions
 * below passed: against a reachable database with no `actor-1` row, all three
 * were refused as "Authentication required", and the role refusals failed the
 * same way instead of on MANAGE_PETS. `signInAs` seals a real cookie for an
 * identity `memberRowForId` answers for, so every case reaches the permission
 * check with the role the database holds.
 */
const prismaDouble = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(async (args?: { where?: { id?: string } }) => memberRowForId(args?.where?.id)),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaDouble,
  default: prismaDouble,
  disconnectPrisma: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("getAdminPets authorization", () => {
  // Signed out unless a case signs in: the harness empties the cookie jar
  // before every test.
  it("refuses an anonymous caller", async () => {
    await expect(getAdminPets()).rejects.toThrow(/Authentication required/i);
  });

  it.each([ROLES.CONTENT_EDITOR, ROLES.VOLUNTEER_COORDINATOR, ROLES.STAFF])(
    "refuses a %s",
    async (role) => {
      await signInAs(role);
      await expect(getAdminPets()).rejects.toThrow(/MANAGE_PETS/);
    }
  );

  it.each([ROLES.SUPER_ADMIN, ROLES.ANIMAL_MANAGER, ROLES.ADMIN])(
    "admits a %s and returns the admin projection",
    async (role) => {
      await signInAs(role);

      const pets = await getAdminPets();
      expect(Array.isArray(pets)).toBe(true);
      expect(pets.length).toBeGreaterThan(0);
      expect(pets[0]).toHaveProperty("applicationCount");
    }
  );

  it("leaves the public catalog reachable without a session", async () => {
    // getPublicPets is genuinely public and must not have been swept up in the
    // fix; it already filters archived records.
    const pets = await getPublicPets();
    expect(Array.isArray(pets)).toBe(true);
    expect(pets.every((p) => !p.isArchived)).toBe(true);
  });
});
