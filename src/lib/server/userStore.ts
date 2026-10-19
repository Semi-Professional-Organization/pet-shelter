import { Role, ROLES } from "@/lib/security/rbac";
import { USER_STATUSES, type UserStatus } from "@/lib/security/permissions";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError } from "@/lib/persistenceMode";
import { registerStateReset } from "@/lib/stateResets";

interface DbUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  /**
   * Account lifecycle state. Carried here so the authentication path can reject
   * a suspended or not-yet-activated member in the same query that fetches the
   * password hash, instead of making a second round-trip to memberStore.
   * In-memory demo accounts are always ACTIVE.
   */
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Initial pre-seeded demo staff accounts.
 *
 * Each `passwordHash` is `hashPassword(initialPassword)`, derived once and
 * written down. scrypt is slow on purpose and these passwords are constants, so
 * deriving them at runtime bought nothing — and the cost landed in every test
 * file, whose first reset hashed all five. The passwords are published demo
 * credentials, so the hashes reveal nothing new.
 * `tests/unit/demoSeedPasswordHashes.test.ts` fails if a password and its hash
 * ever disagree.
 */
export const INITIAL_STAFF_USERS: Array<Omit<UserRecord, "status"> & { initialPassword: string }> = [
  {
    id: "usr-admin-01",
    email: "admin@hopeforstrays.org",
    name: "Dr. Sarah Tan",
    role: ROLES.SUPER_ADMIN,
    initialPassword: "admin123",
    passwordHash:
      "91b3ad750575b1795c5ba360c349afac:04a5997160b1a6edc9f9b6f04f379b7676670a685a545bda0e6211fd800f04d442d759a7ec172826ecae6f2f2a8e07e2815a061109b7226d4a2d444689c0ce56",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "usr-coord-01",
    email: "coordinator@hopeforstrays.org",
    name: "Priya Devi",
    role: ROLES.VOLUNTEER_COORDINATOR,
    initialPassword: "coord123",
    passwordHash:
      "797b92cb058c6a23cff13c567a886e63:d5fedf6158f81e40f9941b5d10817f2c67730afbb93ec17669e06481a03c494267914c0b0a84e44788f499a8a5249b6d9bb04d3b57168a58e91a9ba4f0ce8930",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "usr-animal-01",
    email: "animals@hopeforstrays.org",
    name: "Ahmad Razak",
    role: ROLES.ANIMAL_MANAGER,
    initialPassword: "animal123",
    passwordHash:
      "b4fd1b7efba5519cdccb7e6f3a5e048e:04ad4c94d7817ef0a4bb9416ff68200bbad64517f307800c2f5cff21ebe5a57deaf2274f513e24d5c10487692debdcfab8663abde94c89852355de067ee8df5f",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "usr-editor-01",
    email: "content@hopeforstrays.org",
    name: "Mei Ling",
    role: ROLES.CONTENT_EDITOR,
    initialPassword: "content123",
    passwordHash:
      "5c770a0256e4bc8e151d4d549b35e856:7b150159130e73fb33dce700e10029f6315580983db106c59811f815b11438ef431d371f6badd1d3f0822caed08ed965dd7a54de9ba263503e471c8fe85be8f0",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "usr-staff-01",
    email: "staff@hopeforstrays.org",
    name: "Nurul Aina",
    role: ROLES.STAFF,
    initialPassword: "staff123",
    passwordHash:
      "9d4b455ee9bc94087c448f7d61b1925e:ce0d57b9302ff00f64eb709adbceaea731f0f1ea76ed225b84b7be263e209c39d26b11e3e62423de1e341545d57b9e78851040590dc970cd2658020cd4950f21",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
];

// In-memory fallback user store
const usersStore: Map<string, UserRecord> = new Map();
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/** The seeded staff records, as the in-memory store holds them. */
function seededStaff(): UserRecord[] {
  return INITIAL_STAFF_USERS.map((staff) => ({
    id: staff.id,
    email: staff.email.toLowerCase(),
    name: staff.name,
    passwordHash: staff.passwordHash,
    role: staff.role,
    // Demo accounts are always active; only a database row can be
    // suspended or awaiting invitation.
    status: USER_STATUSES.ACTIVE,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  }));
}

function ensureInitialized(): Promise<void> {
  if (isInitialized) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      // A fresh record per seed, so a caller mutating a returned record cannot
      // write back into the next reset.
      for (const staff of seededStaff()) {
        usersStore.set(staff.email, staff);
      }
      isInitialized = true;
    })();
  }
  return initPromise;
}

/**
 * Finds a user by email (case-insensitive) from Prisma with memory fallback.
 */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();
  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: normalized },
    });
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        passwordHash: dbUser.passwordHash,
        role: dbUser.role as Role,
        status: (dbUser.status as UserStatus) ?? USER_STATUSES.ACTIVE,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };
    }
  } catch (err) {
    handlePersistenceError("Prisma user lookup by email", err, "read");
  }

  await ensureInitialized();
  return usersStore.get(normalized) || null;
}

/**
 * Finds a user by unique ID.
 */
export async function findUserById(id: string): Promise<UserRecord | null> {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
    });
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        passwordHash: dbUser.passwordHash,
        role: dbUser.role as Role,
        status: (dbUser.status as UserStatus) ?? USER_STATUSES.ACTIVE,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };
    }
  } catch (err) {
    handlePersistenceError("Prisma user lookup by id", err, "read");
  }

  await ensureInitialized();
  for (const user of usersStore.values()) {
    if (user.id === id) return user;
  }
  return null;
}

/**
 * Creates and registers a new user in Prisma and memory store.
 */
export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}): Promise<UserRecord> {
  const normalizedEmail = data.email.trim().toLowerCase();
  await ensureInitialized();

  if (usersStore.has(normalizedEmail)) {
    throw new Error(`A user with email '${normalizedEmail}' already exists.`);
  }

  const now = new Date().toISOString();
  let createdUser: UserRecord = {
    id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    email: normalizedEmail,
    name: data.name.trim(),
    passwordHash: data.passwordHash,
    role: data.role,
    status: USER_STATUSES.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const dbCreated = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        role: data.role,
      },
    });
    createdUser = {
      id: dbCreated.id,
      email: dbCreated.email,
      name: dbCreated.name,
      passwordHash: dbCreated.passwordHash,
      role: dbCreated.role as Role,
      status: (dbCreated.status as UserStatus) ?? USER_STATUSES.ACTIVE,
      createdAt: dbCreated.createdAt.toISOString(),
      updatedAt: dbCreated.updatedAt.toISOString(),
    };
  } catch (err) {
    // Deliberately ahead of the `usersStore.set` below: under strict persistence
    // this rethrows, and a user that failed to reach the database must not be
    // left behind in memory pretending the write succeeded.
    handlePersistenceError("Prisma user creation", err, "write");
  }

  usersStore.set(normalizedEmail, createdUser);
  return createdUser;
}

/**
 * Returns a list of all registered users (excluding sensitive password hashes).
 */
export async function listUsers(): Promise<Omit<UserRecord, "passwordHash">[]> {
  try {
    const dbUsers = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    if (dbUsers && dbUsers.length > 0) {
      return (dbUsers as unknown as DbUserRecord[]).map((u: DbUserRecord) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as Role,
        status: (u.status as UserStatus) ?? USER_STATUSES.ACTIVE,
        createdAt: typeof u.createdAt === "string" ? u.createdAt : new Date(u.createdAt).toISOString(),
        updatedAt: typeof u.updatedAt === "string" ? u.updatedAt : new Date(u.updatedAt).toISOString(),
      }));
    }
  } catch (err) {
    handlePersistenceError("Prisma user list query", err, "read");
  }

  await ensureInitialized();
  return Array.from(usersStore.values()).map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
}

/**
 * Resets the in-memory store back to initial seed state (primarily for automated testing).
 */
export async function resetUserStore(): Promise<void> {
  usersStore.clear();
  isInitialized = false;
  initPromise = null;
  await ensureInitialized();
}

registerStateReset("userStore", resetUserStore);
