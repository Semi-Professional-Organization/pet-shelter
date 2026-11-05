import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `checkSharedRateLimit` without a server: which path it takes, and that it
 * fails closed (#213). The atomic upsert itself is probed against Postgres in
 * `tests/integration/db/sharedRateLimit.postgres.test.ts`.
 */

const prismaDouble = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaDouble,
  default: prismaDouble,
  disconnectPrisma: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

// Imported inside each test, after the mock, so no real client is built first.
const subject = () => import("@/lib/security/sharedRateLimit");

describe("checkSharedRateLimit", () => {
  beforeEach(() => {
    prismaDouble.$queryRaw.mockReset();
    prismaDouble.$executeRaw.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("counts in memory and never queries when no DATABASE_URL is set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { checkSharedRateLimit } = await subject();

    for (let i = 0; i < 2; i++) expect((await checkSharedRateLimit("memory-path", 2, 60_000)).success).toBe(true);
    expect((await checkSharedRateLimit("memory-path", 2, 60_000)).success).toBe(false);
    expect(prismaDouble.$queryRaw).not.toHaveBeenCalled();
  });

  it("reads the budget from the row the upsert returns", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { checkSharedRateLimit } = await subject();

    prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: 3, retryAfterSeconds: 41 }]);
    expect(await checkSharedRateLimit("k", 5, 60_000)).toEqual({ success: true, remaining: 2, retryAfterSeconds: 0 });

    prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: 6, retryAfterSeconds: 41 }]);
    expect(await checkSharedRateLimit("k", 5, 60_000)).toEqual({ success: false, remaining: 0, retryAfterSeconds: 41 });
    expect(prismaDouble.$executeRaw).not.toHaveBeenCalled();
  });

  it("never sends the raw key to the database", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    const { checkSharedRateLimit } = await subject();
    prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: 1, retryAfterSeconds: 60 }]);

    await checkSharedRateLimit("register:email:victim@example.com", 5, 60_000);

    const values = prismaDouble.$queryRaw.mock.calls[0].slice(1);
    expect(values.join(" ")).not.toContain("victim@example.com");
    expect(values[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["the query rejects", () => prismaDouble.$queryRaw.mockRejectedValueOnce(new Error("relation does not exist"))],
    ["the query returns no row", () => prismaDouble.$queryRaw.mockResolvedValueOnce([])],
  ])("refuses, and marks it unavailable, when %s", async (_label, arrange) => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkSharedRateLimit } = await subject();
    arrange();

    const result = await checkSharedRateLimit("register:email:victim@example.com", 5, 60_000);

    expect(result).toEqual({ success: false, remaining: 0, retryAfterSeconds: 60, unavailable: true });
    // Logged without the key, which carries the email.
    expect(error).toHaveBeenCalledOnce();
    expect(JSON.stringify(error.mock.calls)).not.toContain("victim@example.com");
  });

  it("ignores a failed sweep of expired rows", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { checkSharedRateLimit } = await subject();
    prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: 1, retryAfterSeconds: 60 }]);
    prismaDouble.$executeRaw.mockRejectedValueOnce(new Error("timeout"));

    expect((await checkSharedRateLimit("k", 5, 60_000)).success).toBe(true);
    expect(prismaDouble.$executeRaw).toHaveBeenCalledOnce();
  });
});

describe("registerAction when the shared budget is unreadable", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses with 'temporarily unavailable', not 'too many', and checks no invite code", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    vi.stubEnv("STAFF_INVITE_SECRET", "test-staff-invite-code-2026");
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaDouble.$queryRaw.mockRejectedValue(new Error("connection refused"));
    const { registerAction } = await import("@/actions/auth");

    const res = await registerAction({
      name: "Outage Caller",
      email: "outage@test.com",
      password: "ValidPassword123!",
      staffInviteCode: "test-staff-invite-code-2026",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/temporarily unavailable/i);
    expect(res.error).not.toMatch(/too many/i);
  });
});
