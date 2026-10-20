import {
  setSessionCookie,
  clearSessionCookie,
  SessionUser,
} from "@/lib/security/session";
import { ROLES, type Role } from "@/lib/security/rbac";

/** Re-exported so a suite needs one import for the whole sign-in ceremony. */
export type { Role };

/**
 * Signing a test in, in one line.
 *
 * Admin mutations refuse every unauthenticated caller in every environment --
 * `getAdminActorOrThrow()` in `src/actions/pets.ts` used to make an exception for
 * any build that was not production, and no longer does
 * (`docs/archives/tasks/URGENT_NONPRODUCTION_ADMIN_BYPASS.md`). So a suite that drives one
 * has to hold a real session.
 *
 * Three files had each grown their own copy of that ceremony before this module
 * existed. Centralising it is not tidiness: the alternative to a one-liner that
 * works is an author who reaches for `vi.mock("@/lib/security/adminSession")` and
 * relocates the authentication hole into the test suite.
 *
 * Nothing here is a stub. `signInAs` goes through the real `setSessionCookie()`,
 * so a test authenticates exactly as the login action does -- a signed, expiring
 * cookie that `verifyAdminSession()` then validates for real. A test that forgets
 * to call it is refused by the same code path a browser would be.
 *
 * ## Call it from the suite's own `beforeEach`
 *
 * The harness in `nextMocks.ts` clears the cookie jar before every test, and
 * setup-file hooks run ahead of a test file's own, so signing in at module or
 * `describe` scope is wiped before the test body runs.
 *
 * ## It is inert under a local `next/headers` mock
 *
 * A file that declares its own `vi.mock("next/headers", ...)` replaces the
 * harness for that file, and these cookies land in a jar nothing reads. Delete
 * the local mock and use the harness — that is what the two suites migrated
 * alongside this module did.
 */

/** A session identity before it is sealed; `expiresAt` is set by the real seal. */
export type TestIdentity = Omit<SessionUser, "expiresAt">;

/** The administrator an admin-mutation suite acts as unless it needs another. */
export const TEST_ADMIN: TestIdentity = {
  id: "usr-admin-01",
  email: "admin@hopeforstrays.org",
  name: "Dr. Sarah Tan",
  role: ROLES.ADMIN,
};

/**
 * `TEST_ADMIN` as a complete `SessionUser`, for repository calls that take an
 * `actor` argument directly (`insertServerPet(pet, actor)`) rather than reading a
 * cookie. Same identity as the signed-in one on purpose, so a suite that seeds
 * fixtures and then mutates through the actions produces one coherent audit trail.
 */
export const TEST_ADMIN_ACTOR: SessionUser = {
  ...TEST_ADMIN,
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
};

/** A conventional identity per role, for tests that only care which role acted. */
export function identityForRole(role: Role): TestIdentity {
  return {
    id: `usr-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@hopeforstrays.org`,
    name: `Test ${role}`,
    role,
  };
}

/**
 * A `users` row as a Prisma double returns it.
 *
 * Carries more than `findMemberAuthStateById` selects on purpose. A double
 * answering `user.findUnique` answers it for *every* caller, and the other two
 * readers of that row — `memberStore.toMemberRecord` and `userStore.findUserById`
 * — dereference `createdAt`/`updatedAt` and read `passwordHash`. A row with only
 * the four authorization columns turns those into a `TypeError` on `undefined`
 * instead of the safe `null` they used to get.
 */
export interface TestMemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE";
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The `users` row a Prisma double should return for a signed-in test identity.
 *
 * Lives beside `identityForRole` because it is that function read backwards,
 * and a mirror kept in another file is a mirror that drifts.
 *
 * Needed because `getVerifiedSession` re-reads the member on every guarded
 * call. A double that answered this lookup with `null` used to work anyway —
 * the DAL fell through to the cookie's own claims — but that fall-through let
 * a member deleted from a reachable database keep every capability their cookie
 * asserted, and closing it (`src/lib/security/dal.ts`) means a doubled Prisma
 * now has to answer for the member the suite signed in as.
 *
 * Resolves exactly the identities this module mints — the `identityForRole`
 * ids and `TEST_ADMIN` — and returns null for anything else. That is not a gap:
 * an id no test signs in as is a member who does not exist, and must stay
 * unauthenticated. The seeded `userStore` fixtures `usr-coord-01`,
 * `usr-animal-01` and `usr-editor-01` are deliberately among the nulls; they
 * are database fixtures rather than test identities, and an earlier version's
 * claim that a numeric suffix always resolved to a role was wrong for three of
 * the five.
 *
 * The row is built *from* the identity rather than re-derived, so the name and
 * email cannot drift from what the suite signed in as. `readVerifiedSession`
 * now overwrites the session's name and email with this row's, so a synthesised
 * `Test ADMIN` here would silently rename `TEST_ADMIN` ("Dr. Sarah Tan") in
 * every audit row and rendered header a suite asserts on.
 */
export function memberRowForId(id: string | undefined): TestMemberRow | null {
  if (!id?.startsWith("usr-")) return null;

  if (id === TEST_ADMIN.id) return memberRowFor(TEST_ADMIN);

  // `identityForRole` mints `usr-<role lowercased>`.
  const role = id.slice("usr-".length).toUpperCase();
  if (!Object.values(ROLES).includes(role as Role)) return null;

  return memberRowFor(identityForRole(role as Role));
}

/**
 * A `prisma.user.findUnique` double for the member re-read `getVerifiedSession`
 * makes on every guarded call: it answers with `memberRowForId`. The one place
 * that knows the lookup's shape, so a change to it is made once for every suite
 * that signs in, not in each suite's own double.
 */
export async function findMemberRow(args?: { where?: { id?: string } }): Promise<TestMemberRow | null> {
  return memberRowForId(args?.where?.id);
}

/** The stored row for an identity, mirroring it field for field. */
function memberRowFor(identity: TestIdentity): TestMemberRow {
  return {
    id: identity.id,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    status: "ACTIVE",
    // Never verified against: these suites authenticate by sealing a cookie,
    // not by presenting a password. Present so the row's other readers do not
    // dereference undefined.
    passwordHash: "scrypt:test-fixture-hash",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

/**
 * Seals a real session cookie for `who` and returns the sealed user, including
 * the `expiresAt` the seal computed.
 */
export async function signInAs(who: Role | TestIdentity): Promise<SessionUser> {
  const user = typeof who === "string" ? identityForRole(who) : who;
  return setSessionCookie(user);
}

/** Signs in as `TEST_ADMIN`. The one line an admin-mutation suite needs. */
export async function signInAsAdmin(): Promise<SessionUser> {
  return signInAs(TEST_ADMIN);
}

/** Clears the session cookie, for a test that asserts an unauthenticated refusal. */
export async function signOut(): Promise<void> {
  return clearSessionCookie();
}
