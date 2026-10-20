import { hashPassword } from "@/lib/security/crypto";
import { Role, ROLES } from "@/lib/security/rbac";
import { USER_STATUSES, type UserStatus } from "@/lib/security/permissions";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError } from "@/lib/persistenceMode";

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

// Initial pre-seeded demo staff accounts
const INITIAL_STAFF_USERS: Array<Omit<UserRecord, "passwordHash" | "status"> & { initialPassword: string }> = [
  {
    id: "usr-admin-01",
    email: "admin@hopeforstrays.org",
    name: "Dr. Sarah Tan",
    role: ROLES.SUPER_ADMIN,
    initialPassword: "admin123",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "usr-coord-01",
    email: "coordinator@hopeforstrays.org",
    name: "Priya Devi",
    role: ROLES.VOLUNTEER_COORDINATOR,
    initialPassword: "coord123",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "usr-animal-01",
    email: "animals@hopeforstrays.org",
    name: "Ahmad Razak",
    role: ROLES.ANIMAL_MANAGER,
    initialPassword: "animal123",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "usr-editor-01",
    email: "content@hopeforstrays.org",
    name: "Mei Ling",
    role: ROLES.CONTENT_EDITOR,
    initialPassword: "content123",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "usr-staff-01",
    email: "staff@hopeforstrays.org",
    name: "Nurul Aina",
    role: ROLES.STAFF,
    initialPassword: "staff123",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
];

// In-memory fallback user store
const usersStore: Map<string, UserRecord> = new Map();
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * The seeded staff records, hashed once per process.
 *
 * `hashPassword` is scrypt, which is expensive on purpose. The seed passwords
 * are compile-time constants, so re-deriving them is pure waste — and it is
 * waste the test lifecycle pays repeatedly, since `resetUserStore()` runs
 * before every test in the suite. Hashing once and re-cloning the records keeps
 * a full reset effectively free while leaving the hashes byte-identical to what
 * a fresh derivation would produce.
 *
 * Deliberately *not* cleared by `resetUserStore()`: these are derived from
 * constants, so they can never go stale.
 */
let seededStaffPromise: Promise<UserRecord[]> | null = null;

function getSeededStaff(): Promise<UserRecord[]> {
  if (!seededStaffPromise) {
    seededStaffPromise = Promise.all(
      INITIAL_STAFF_USERS.map(async (staff) => ({
        id: staff.id,
        email: staff.email.toLowerCase(),
        name: staff.name,
        passwordHash: await hashPassword(staff.initialPassword),
        role: staff.role,
        // Demo accounts are always active; only a database row can be
        // suspended or awaiting invitation.
        status: USER_STATUSES.ACTIVE,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      }))
    ).catch((error: unknown) => {
      // A failed derivation must not be cached: the next reset derives again.
      seededStaffPromise = null;
      throw error;
    });
  }
  return seededStaffPromise;
}

function ensureInitialized(): Promise<void> {
  if (isInitialized) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      for (const staff of await getSeededStaff()) {
        // Copied per seed so a caller mutating a returned record cannot write
        // back into the cached template.
        usersStore.set(staff.email, { ...staff });
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
