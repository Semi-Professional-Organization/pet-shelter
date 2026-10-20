import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loginAction, registerAction } from "@/actions/auth";
import { acceptInvitation } from "@/actions/members";
import { hashPassword } from "@/lib/security/crypto";
import { getCurrentSession } from "@/lib/security/session";
import { findUserByEmail, type UserRecord } from "@/lib/server/userStore";
import { isPublishedStaffPassword, PUBLISHED_STAFF_PASSWORDS } from "@/lib/security/publishedPasswords";

/**
 * A password this public repository has published for a staff account is not a
 * credential in production — whichever store vouches for the account.
 *
 * Production was seeded on 2026-08-15 with the accounts `prisma/seed.ts` defines, and
 * with no reachable database `userStore` answers from an in-memory copy of the same
 * seed. Both admitted `admin@hopeforstrays.org` / `admin123` as SUPER_ADMIN. See
 * `tasks/decisions/2026-09-16-a-published-password-is-refused-not-the-account.md`.
 */

vi.mock("@/lib/server/userStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/userStore")>();
  // The real lookup by default, so the in-memory seed answers exactly as it does in
  // production with no database; overridden per test to stand in for a Postgres row.
  return { ...actual, findUserByEmail: vi.fn(actual.findUserByEmail) };
});

const ROOT = join(__dirname, "..", "..", "..");
const TEST_INVITE_CODE = "test-staff-invite-code-2026";
const REAL_PASSWORD = "CorrectHorseBattery1";

async function databaseRow(overrides: Partial<UserRecord> & { password: string }): Promise<UserRecord> {
  const { password, ...rest } = overrides;
  return {
    id: "usr-vol-01",
    email: "volunteer@hopeforstrays.org",
    name: "Seeded Volunteer",
    role: "VOLUNTEER" as UserRecord["role"],
    status: "ACTIVE",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    passwordHash: await hashPassword(password),
    ...rest,
  };
}

describe("isPublishedStaffPassword", () => {
  it("covers every password a staff seed in this repository publishes", () => {
    // `src/lib/server/userStore.ts` keeps only the hashes now; which password each of its
    // accounts has is checked against the same list in tests/unit/demoSeedPasswordHashes.test.ts.
    const published = ["prisma/seed.ts", "src/app/admin/login/page.tsx"].flatMap((file) =>
      [...readFileSync(join(ROOT, file), "utf8").matchAll(/\b(?:password|initialPassword|pass):\s*"([^"]+)"/g)].map(
        (match) => match[1]
      )
    );

    // Named, so a seed that publishes a new password fails with the password in the message.
    expect([...new Set(published)].filter((password) => !isPublishedStaffPassword(password))).toEqual([]);
    // At least five seeded passwords across the two files. A scan that matched nothing would
    // pass the line above vacuously.
    expect(new Set(published).size).toBeGreaterThanOrEqual(5);
  });

  it("still covers vol123, which the seed dropped after production had been seeded with it", () => {
    // prisma/seed.ts seeded volunteer@hopeforstrays.org / vol123 from e0884e9 (2026-08-15)
    // until fb61945 (2026-09-02). Deleting it from the seed unpublished nothing.
    expect(isPublishedStaffPassword("vol123")).toBe(true);
  });

  it("matches the copy the lockdown runbook's password-hash command refuses", () => {
    // The runbook's command must run before this module is deployed, so it carries its own
    // list. A password added here and not there would let an operator create a Super Admin
    // that production then refuses at sign-in.
    const runbook = readFileSync(join(ROOT, "docs/runbooks/RUNBOOK_PRODUCTION_STAFF_ACCOUNT_LOCKDOWN.md"), "utf8");
    const literal = runbook.match(/\[((?:"[^"]+",?)+)\]\.includes\(p\)/);

    expect(literal, "the hash command's refusal list was not found").not.toBeNull();
    const copy = [...(literal?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect([...copy].sort()).toEqual([...PUBLISHED_STAFF_PASSWORDS].sort());
  });

  it("does not refuse an ordinary password", () => {
    expect(isPublishedStaffPassword(REAL_PASSWORD)).toBe(false);
    expect(isPublishedStaffPassword("Admin123")).toBe(false);
  });
});

describe("loginAction in production", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    // Back to the real lookup with no queued row: a refused sign-in never consumes a
    // mockResolvedValueOnce, which would otherwise answer the next test instead.
    vi.mocked(findUserByEmail).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses the seeded Super Admin password with no database, where the in-memory seed would admit it", async () => {
    const res = await loginAction({ email: "admin@hopeforstrays.org", password: "admin123" });

    expect(res.success).toBe(false);
    // The ordinary message: the refusal tells a caller nothing the repo does not.
    expect(res.error).toMatch(/Invalid staff email or password/);
    expect(await getCurrentSession()).toBeNull();
  });

  it("refuses a published password carried by a database row, including the retired volunteer account", async () => {
    vi.mocked(findUserByEmail).mockResolvedValueOnce(await databaseRow({ password: "vol123" }));

    const res = await loginAction({ email: "volunteer@hopeforstrays.org", password: "vol123" });

    expect(res.success).toBe(false);
    expect(await getCurrentSession()).toBeNull();
    // Refused before the lookup, so the response cannot depend on whether the account exists.
    expect(vi.mocked(findUserByEmail)).not.toHaveBeenCalled();
  });

  it("still admits a password that was never published", async () => {
    vi.mocked(findUserByEmail).mockResolvedValueOnce(
      await databaseRow({
        id: "usr-real-01",
        email: "director@hopeforstrays.org",
        role: "SUPER_ADMIN" as UserRecord["role"],
        password: REAL_PASSWORD,
      })
    );

    const res = await loginAction({ email: "director@hopeforstrays.org", password: REAL_PASSWORD });

    expect(res.success).toBe(true);
  });
});

describe("a published password cannot be set, in any environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is refused at self-registration", async () => {
    vi.stubEnv("STAFF_INVITE_SECRET", TEST_INVITE_CODE);

    const res = await registerAction({
      name: "New Staff Member",
      email: "new.staff@test.com",
      password: "staff123",
      staffInviteCode: TEST_INVITE_CODE,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/published/i);
    expect(await getCurrentSession()).toBeNull();
  });

  it("is refused when an invitation is redeemed", async () => {
    const res = await acceptInvitation({
      email: "invitee@hopeforstrays.org",
      token: "any-token",
      password: "admin123",
      confirmPassword: "admin123",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/published/i);
  });
});
