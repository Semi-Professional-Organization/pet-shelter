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

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => requestHeaders.current,
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

  it("keeps saying 'unavailable' however many times an outage is hit, and recovers at once", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkSharedRateLimit } = await subject();

    prismaDouble.$queryRaw.mockRejectedValue(new Error("connection refused"));
    for (let i = 0; i < 12; i++) {
      expect(await checkSharedRateLimit("outage", 5, 60_000)).toEqual({ success: false, unavailable: true });
    }

    prismaDouble.$queryRaw.mockResolvedValue([{ count: 1, retryAfterSeconds: 60 }]);
    expect((await checkSharedRateLimit("outage", 5, 60_000)).success).toBe(true);
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
    ["the row has no usable count", () => prismaDouble.$queryRaw.mockResolvedValueOnce([{ retryAfterSeconds: 60 }])],
    ["the row's count is null", () => prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: null, retryAfterSeconds: 60 }])],
  ])("refuses, and marks it unavailable, when %s", async (_label, arrange) => {
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkSharedRateLimit } = await subject();
    arrange();

    const result = await checkSharedRateLimit("register:email:victim@example.com", 5, 60_000);

    expect(result).toEqual({ success: false, unavailable: true });
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

describe("registerAction on the shared budgets", () => {
  beforeEach(() => {
    prismaDouble.$queryRaw.mockReset();
    requestHeaders.current = new Headers();
    vi.stubEnv("DATABASE_URL", "postgresql://unit.test/none");
    vi.stubEnv("STAFF_INVITE_SECRET", "test-staff-invite-code-2026");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const attempt = async (email: string) => {
    const { registerAction } = await import("@/actions/auth");
    return registerAction({ name: "Probe", email, password: "ValidPassword123!", staffInviteCode: "wrong-code" });
  };

  it("refuses with 'temporarily unavailable', not 'too many', and starts no countdown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaDouble.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await attempt("outage@test.com");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/temporarily unavailable/i);
    expect(res.error).not.toMatch(/too many/i);
    expect(res.retryAfterSeconds).toBeUndefined();
  });

  it("says 'unavailable' when the shared address budget cannot be read", async () => {
    vi.stubEnv("TRUSTED_PROXY_HEADER", "x-real-ip");
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.8" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaDouble.$queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await attempt("address-outage@test.com");

    expect(res.error).toMatch(/temporarily unavailable/i);
    expect(res.retryAfterSeconds).toBeUndefined();
    // Refused at the address budget: the email budget is never read.
    expect(prismaDouble.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("spends both budgets in the shared table before checking the invite code", async () => {
    vi.stubEnv("TRUSTED_PROXY_HEADER", "x-real-ip");
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.9" });
    prismaDouble.$queryRaw.mockResolvedValue([{ count: 1, retryAfterSeconds: 60 }]);
    const { rateLimitKeyDigest } = await subject();

    const res = await attempt("both-budgets@test.com");

    expect(res.error).toMatch(/valid staff invite code is required/);
    expect(prismaDouble.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      rateLimitKeyDigest("register:ip:203.0.113.9"),
      rateLimitKeyDigest("register:email:both-budgets@test.com"),
    ]);
  });

  it("spends the address budget in the shared table, digested", async () => {
    vi.stubEnv("TRUSTED_PROXY_HEADER", "x-real-ip");
    requestHeaders.current = new Headers({ "x-real-ip": "203.0.113.7" });
    // The address budget's row says it is spent; the email budget is never read.
    prismaDouble.$queryRaw.mockResolvedValueOnce([{ count: 11, retryAfterSeconds: 37 }]);

    const res = await attempt("fresh-address@test.com");

    expect(res.error).toMatch(/Too many registration attempts/);
    expect(res.retryAfterSeconds).toBe(37);
    expect(prismaDouble.$queryRaw).toHaveBeenCalledTimes(1);
    const { rateLimitKeyDigest } = await subject();
    const sent = prismaDouble.$queryRaw.mock.calls[0].slice(1);
    expect(sent[0]).toBe(rateLimitKeyDigest("register:ip:203.0.113.7"));
    expect(sent.join(" ")).not.toContain("203.0.113.7");
  });
});
