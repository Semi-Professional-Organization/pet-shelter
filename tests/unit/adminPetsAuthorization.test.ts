import { describe, it, expect, vi } from "vitest";
import { getAdminPets, getPublicPets } from "@/actions/pets";
import { ROLES } from "@/lib/security/permissions";
import { findMemberRow, signInAs } from "../setup/authSession";

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
 * identity `findMemberRow` answers for, so every case reaches the permission
 * check with the role the database holds.
 */
const memberLookup = vi.hoisted(() => ({
  findUnique: vi.fn((args?: { where?: { id?: string } }) => findMemberRow(args)),
}));

// Everything but the member lookup is the real offline client (this tier has no
// `DATABASE_URL`): its P1001 refusals are what the repositories read as an outage,
// so the catalogue reads below reach their fallback the way they do in any run with
// no database. A hand-made double here once left `prisma.pet` undefined, and the
// read reached its fallback only by swallowing a TypeError.
vi.mock("@/lib/server/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/prisma")>();
  const prisma = new Proxy(actual.prisma, {
    get: (target, key) => (key === "user" ? memberLookup : Reflect.get(target, key)),
  });
  return { ...actual, prisma, default: prisma };
});

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

  it("refuses a valid cookie for a member the database does not hold", async () => {
    // The admissions below come from the member re-read, not from the cookie: a
    // session the DAL could only vouch for by trusting its own claims (as its
    // fallback for an unreachable database does) is refused here.
    await signInAs({ id: "usr-no-such-member", email: "ghost@hopeforstrays.org", name: "Ghost", role: ROLES.ADMIN });

    await expect(getAdminPets()).rejects.toThrow(/Authentication required/i);
  });

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
