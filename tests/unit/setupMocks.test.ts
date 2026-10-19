import { describe, it, expect, afterEach, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect, notFound } from "next/navigation";

import {
  getRevalidatedPaths,
  getRevalidatedTags,
  getRevalidatedTagCalls,
  getLastRedirect,
  mockCookieStore,
  MockNavigationError,
} from "../setup/nextMocks";

import {
  getServerPets,
  getServerPetsAsync,
  insertServerPet,
} from "@/lib/server/petRepository";
import { resetRegisteredState } from "@/lib/stateResets";
import { findUserByEmail, createUser, listUsers } from "@/lib/server/userStore";
import {
  recordAuditLog,
  getAuditLogs,
  getAuditLogsAsync,
  flushAuditLogWrites,
} from "@/lib/domain/auditLog";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { withIdempotency } from "@/lib/security/idempotency";
import { ROLES } from "@/lib/security/rbac";
import type { Pet } from "@/types/pet";
import petsFixture from "@/data/pets.json";

/**
 * Verification suite for the Task 01 test infrastructure.
 *
 * Everything here asserts a property of the *harness itself* rather than of the
 * product: that the Next.js doubles accept the call shapes real code uses, that
 * the global `beforeEach` genuinely isolates one test from the next, and that
 * `STRICT_PERSISTENCE=true` converts a swallowed database failure into a throw.
 * A regression in any of those would not fail any other suite — it would make
 * them quietly less trustworthy.
 */

/**
 * A Prisma stand-in whose every operation rejects.
 *
 * Strict persistence is only observable when the database *fails*, and a real
 * offline client fails for environment-dependent reasons (refused vs. timed out
 * vs. authentication) at environment-dependent speed. A guaranteed rejection
 * makes the assertion about the store's error handling and nothing else.
 */
const PRISMA_FAILURE = new Error("simulated database failure");

vi.mock("@/lib/server/prisma", () => {
  const reject = () => Promise.reject(PRISMA_FAILURE);
  const delegate = () => ({
    findMany: reject,
    findUnique: reject,
    findFirst: reject,
    create: reject,
    update: reject,
    updateMany: reject,
    delete: reject,
    deleteMany: reject,
  });

  const prisma = {
    pet: delegate(),
    petUpdate: delegate(),
    medicalTimelineEvent: delegate(),
    adoptionApplication: delegate(),
    user: delegate(),
    auditLog: delegate(),
    $transaction: reject,
    $disconnect: () => Promise.resolve(),
  };

  return { prisma, default: prisma };
});

const actor = {
  id: "usr-admin-01",
  email: "admin@hopeforstrays.org",
  name: "Dr. Sarah Tan",
  role: ROLES.ADMIN,
  expiresAt: Date.now() + 86_400_000,
};

/** A fixture-shaped pet carrying a caller-supplied id, safe to insert. */
function makePet(id: string): Pet {
  const template = structuredClone(petsFixture as Pet[])[0];
  return { ...template, id, name: `Probe ${id}` };
}

/** Turns strict mode on for the current test only. */
function enableStrictPersistence(): void {
  vi.stubEnv("STRICT_PERSISTENCE", "true");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
describe("next/headers cookie mock", () => {
  it("accepts the multi-argument set(name, value, options) overload", async () => {
    const store = await cookies();
    store.set("hope_shelter_session", "signed.payload", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86_400,
    });

    // `cookies()` is typed as returning Next's `RequestCookie`, which exposes
    // only name and value. Options are read back through the harness's own
    // accessor, which is the same jar with the fuller type.
    const cookie = store.get("hope_shelter_session");
    expect(cookie?.value).toBe("signed.payload");
    expect(cookie?.name).toBe("hope_shelter_session");

    const stored = mockCookieStore.get("hope_shelter_session");
    expect(stored?.httpOnly).toBe(true);
    expect(stored?.sameSite).toBe("lax");
  });

  it("accepts the single-object set({ name, value, ...options }) overload", async () => {
    const store = await cookies();
    store.set({
      name: "hope_shelter_session",
      value: "object.form",
      httpOnly: true,
      path: "/",
    });

    const cookie = store.get("hope_shelter_session");
    expect(cookie?.value).toBe("object.form");
    expect(mockCookieStore.get("hope_shelter_session")?.path).toBe("/");
  });

  it("stores both overloads identically", async () => {
    const store = await cookies();

    store.set("tuple", "v", { path: "/", httpOnly: true });
    store.set({ name: "object", value: "v", path: "/", httpOnly: true });

    const tuple = { ...mockCookieStore.get("tuple"), name: undefined };
    const object = { ...mockCookieStore.get("object"), name: undefined };
    expect(tuple).toEqual(object);
  });

  it("supports get, getAll, and has", async () => {
    const store = await cookies();
    store.set("a", "1");
    store.set("b", "2");

    expect(store.has("a")).toBe(true);
    expect(store.has("missing")).toBe(false);
    expect(store.get("missing")).toBeUndefined();
    expect(store.getAll().map((c) => c.name).sort()).toEqual(["a", "b"]);
    expect(store.getAll("a")).toEqual([{ name: "a", value: "1" }]);
  });

  it("deletes by name and by object", async () => {
    const store = await cookies();

    store.set("by-name", "x");
    store.delete("by-name");
    expect(store.has("by-name")).toBe(false);

    store.set("by-object", "x");
    store.delete({ name: "by-object", path: "/" });
    expect(store.has("by-object")).toBe(false);
  });

  it("treats a maxAge of 0 as expiry rather than a write", async () => {
    // How the logout path clears a session. A mock that stored it would let a
    // logout test pass while leaving the session live.
    const store = await cookies();
    store.set("hope_shelter_session", "live");
    store.set("hope_shelter_session", "", { maxAge: 0 });

    expect(store.has("hope_shelter_session")).toBe(false);
  });

  it("returns a promise, matching the Next 15+ async signature", () => {
    expect(cookies()).toBeInstanceOf(Promise);
    expect(headers()).toBeInstanceOf(Promise);
  });

  it("starts each test with an empty jar", async () => {
    // Pairs with every test above, all of which wrote cookies.
    const store = await cookies();
    expect(store.getAll()).toEqual([]);
  });
});

// ===========================================================================
describe("next/cache mock", () => {
  it("records revalidatePath calls with their path and type", () => {
    revalidatePath("/pets");
    revalidatePath("/admin/pets", "layout");

    expect(getRevalidatedPaths()).toEqual([
      { path: "/pets", type: undefined },
      { path: "/admin/pets", type: "layout" },
    ]);
  });

  it("records revalidateTag calls with their cacheLife profile", () => {
    // Next 16 made the cacheLife profile a required second argument.
    revalidateTag("pets", "max");
    expect(getRevalidatedTags()).toEqual(["pets"]);
    expect(getRevalidatedTagCalls()).toEqual([{ tag: "pets", profile: "max" }]);
  });

  it("clears recorded revalidations between tests", () => {
    expect(getRevalidatedPaths()).toEqual([]);
    expect(getRevalidatedTags()).toEqual([]);
  });
});

// ===========================================================================
describe("next/navigation mock", () => {
  it("throws NEXT_REDIRECT and records the target", () => {
    // The real redirect() throws, so code after it is unreachable. A recording
    // mock that returned normally would let a test walk a branch Next never runs.
    expect(() => redirect("/admin/login")).toThrow(MockNavigationError);
    expect(getLastRedirect()).toBe("/admin/login");
  });

  it("throws NEXT_NOT_FOUND", () => {
    expect(() => notFound()).toThrow(/NEXT_NOT_FOUND/);
  });

  it("clears the recorded redirect between tests", () => {
    expect(getLastRedirect()).toBeNull();
  });
});

// ===========================================================================
describe("hermetic runtime", () => {
  it("runs server code in UTC, as on Vercel, whatever zone the machine is in", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    expect(new Date("2026-10-20T00:30:00Z").getHours()).toBe(0);
  });
});

describe("hermetic state isolation", () => {
  const FIXTURE_COUNT = (petsFixture as Pet[]).length;

  it("A: inserts a pet that must not survive into the next test", async () => {
    await insertServerPet(makePet("pet-leak-probe"), actor);
    expect(getServerPets().some((p) => p.id === "pet-leak-probe")).toBe(true);
  });

  it("B: does not see the pet inserted by the previous test", () => {
    // The whole point of the global beforeEach. Without it this suite would
    // pass or fail depending on file execution order.
    expect(getServerPets().some((p) => p.id === "pet-leak-probe")).toBe(false);
    expect(getServerPets()).toHaveLength(FIXTURE_COUNT);
  });

  it("the registered resets restore an inserted pet away", async () => {
    await insertServerPet(makePet("pet-reset-probe"), actor);
    expect(getServerPets()).toHaveLength(FIXTURE_COUNT + 1);

    await resetRegisteredState();

    expect(getServerPets()).toHaveLength(FIXTURE_COUNT);
    expect(getServerPets().some((p) => p.id === "pet-reset-probe")).toBe(false);
  });

  it("the registered resets restore a record mutated in place", async () => {
    // Guards the `structuredClone` seeding. Under the previous shallow spread
    // the store shared element identity with the imported JSON module, so this
    // assignment corrupted the fixture for the rest of the process and no
    // reset could undo it.
    const original = getServerPets()[0].name;
    getServerPets()[0].name = "MUTATED IN PLACE";

    await resetRegisteredState();

    expect(getServerPets()[0].name).toBe(original);
    expect((petsFixture as Pet[])[0].name).toBe(original);
  });

  it("clears the rate limiter between tests", () => {
    // Exhaust the login budget; the next test proves it did not carry over.
    for (let i = 0; i < 5; i++) checkRateLimit("setup-probe", 5, 60_000);
    expect(checkRateLimit("setup-probe", 5, 60_000).success).toBe(false);
  });

  it("starts with a fresh rate limiter", () => {
    expect(checkRateLimit("setup-probe", 5, 60_000).success).toBe(true);
  });

  it("caches an idempotent response within a test", async () => {
    const op = vi.fn(async () => "first");
    expect(await withIdempotency("setup-probe", op)).toBe("first");
    expect(await withIdempotency("setup-probe", op)).toBe("first");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("starts with an empty idempotency cache", async () => {
    const op = vi.fn(async () => "second");
    expect(await withIdempotency("setup-probe", op)).toBe("second");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("clears the audit trail between tests", () => {
    expect(getAuditLogs()).toEqual([]);
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "PROBE",
      entity: "Pet",
      entityId: "pet-001",
    });
    expect(getAuditLogs()).toHaveLength(1);
  });

  it("starts with an empty audit trail", () => {
    expect(getAuditLogs()).toEqual([]);
  });
});

// ===========================================================================
describe("STRICT_PERSISTENCE off (default): graceful in-memory fallback", () => {
  it("serves pets from the fixtures when the query fails", async () => {
    await expect(getServerPetsAsync()).resolves.toEqual(getServerPets());
  });

  it("keeps a pet insert working against the memory store", async () => {
    await expect(insertServerPet(makePet("pet-lenient"), actor)).resolves.toBeUndefined();
    expect(getServerPets().some((p) => p.id === "pet-lenient")).toBe(true);
  });

  it("falls back to the seeded staff accounts", async () => {
    const admin = await findUserByEmail("admin@hopeforstrays.org");
    expect(admin?.role).toBe(ROLES.SUPER_ADMIN);
    // One demo account per canonical role: Super Admin, Volunteer Coordinator,
    // Animal Manager, Content Editor, Staff.
    expect(await listUsers()).toHaveLength(5);
  });

  it("keeps a user create working against the memory store", async () => {
    const created = await createUser({
      name: "Lenient Probe",
      email: "lenient@hopeforstrays.org",
      passwordHash: "hash",
      role: ROLES.STAFF,
    });
    expect(created.email).toBe("lenient@hopeforstrays.org");
    expect(await findUserByEmail("lenient@hopeforstrays.org")).not.toBeNull();
  });

  it("serves the audit trail from memory and drains writes without throwing", async () => {
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "PROBE",
      entity: "Pet",
      entityId: "pet-001",
    });

    await expect(getAuditLogsAsync()).resolves.toHaveLength(1);
    await expect(flushAuditLogWrites()).resolves.toBeUndefined();
  });
});

// ===========================================================================
describe("STRICT_PERSISTENCE on: database failures surface", () => {
  describe("server store", () => {
    it("throws on a failed pet query instead of serving fixtures", async () => {
      enableStrictPersistence();
      await expect(getServerPetsAsync()).rejects.toThrow(PRISMA_FAILURE);
    });

    it("throws on a failed pet insert", async () => {
      enableStrictPersistence();
      await expect(insertServerPet(makePet("pet-strict"), actor)).rejects.toThrow(PRISMA_FAILURE);
    });

    it("skips the audit log when the write it describes never landed", async () => {
      enableStrictPersistence();
      await expect(insertServerPet(makePet("pet-strict"), actor)).rejects.toThrow();

      // The throw happens before `recordAuditLog`, so the trail cannot claim a
      // creation that failed.
      expect(getAuditLogs()).toEqual([]);
    });
  });

  describe("userStore", () => {
    it("throws on a failed lookup by email", async () => {
      enableStrictPersistence();
      await expect(findUserByEmail("admin@hopeforstrays.org")).rejects.toThrow(PRISMA_FAILURE);
    });

    it("throws on a failed user list query", async () => {
      enableStrictPersistence();
      await expect(listUsers()).rejects.toThrow(PRISMA_FAILURE);
    });

    it("throws on a failed create without leaving a phantom user in memory", async () => {
      enableStrictPersistence();

      await expect(
        createUser({
          name: "Strict Probe",
          email: "strict@hopeforstrays.org",
          passwordHash: "hash",
          role: ROLES.STAFF,
        })
      ).rejects.toThrow(PRISMA_FAILURE);

      // The user must not linger as if the write had succeeded — checked with
      // strict mode off so the lookup itself can fall back to memory.
      vi.unstubAllEnvs();
      expect(await findUserByEmail("strict@hopeforstrays.org")).toBeNull();
    });
  });

  describe("auditLog", () => {
    it("throws on a failed audit query", async () => {
      enableStrictPersistence();
      await expect(getAuditLogsAsync()).rejects.toThrow(PRISMA_FAILURE);
    });

    it("surfaces a failed fire-and-forget write through flushAuditLogWrites", async () => {
      enableStrictPersistence();

      // recordAuditLog is synchronous and cannot itself throw for a write that
      // has not been attempted yet; flushing is the assertion point.
      expect(() =>
        recordAuditLog({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: "PROBE",
          entity: "Pet",
          entityId: "pet-001",
        })
      ).not.toThrow();

      await expect(flushAuditLogWrites()).rejects.toThrow(PRISMA_FAILURE);
    });

    it("still records the entry in memory when the database write fails", async () => {
      enableStrictPersistence();
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "PROBE",
        entity: "Pet",
        entityId: "pet-001",
      });

      expect(getAuditLogs()).toHaveLength(1);
      await expect(flushAuditLogWrites()).rejects.toThrow();
    });
  });

  it("reads the flag per call, so it can be toggled mid-suite", async () => {
    await expect(getServerPetsAsync()).resolves.toBeInstanceOf(Array);
    enableStrictPersistence();
    await expect(getServerPetsAsync()).rejects.toThrow(PRISMA_FAILURE);
  });
});
