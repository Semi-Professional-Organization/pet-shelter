import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  getPrismaDouble,
  makeDbApplication,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";
import { mockCookieStore } from "../setup/nextMocks";
import { signInAs } from "../setup/authSession";
// Static, not imported inside the first test: `vi.mock` is hoisted above every
// import in this file, so the actions bind to the double either way, and a
// dynamic import only made that first test load the whole action graph against
// its own 5 s timeout.
import { deleteApplication, getApplications, updateApplicationStatus } from "@/actions/applications";
import { getAuditLogs } from "@/lib/domain/auditLog";

/**
 * Tier 3a — RBAC on the Server Action surface, under `STRICT_PERSISTENCE=true`.
 *
 * Tier 2 covers `assertAuthorized` in isolation. What it cannot show is whether
 * each *action* actually consults it, and whether it does so before touching
 * data. That ordering is the security property: a check that runs after the
 * query has already leaked the row it was meant to protect. The read refusals
 * are checked once for the whole action ("never reaches the database for a
 * rejected caller"); each status-change and delete refusal asserts it itself.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

// Status changes dispatch applicant email. Doubled so an authorized case cannot
// fail on an outbound network call it is not testing.
vi.mock("@/lib/email", () => ({
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendStaffApplicationAlert: vi.fn().mockResolvedValue(undefined),
  sendApplicationStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendInterviewInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

let prismaDouble: PrismaDouble;

beforeAll(async () => {
  prismaDouble = await getPrismaDouble();
});

/**
 * Every database method that reads or writes *business* data, for "was any data
 * touched?" assertions.
 *
 * `user` is deliberately excluded. Resolving the caller is itself a database
 * read now: `getVerifiedSession()` re-reads the member's live role and status so
 * a suspension or demotion takes effect on the next request instead of whenever
 * the 24-hour cookie expires. That lookup cannot be skipped for a caller the
 * cookie appears to reject, because the database is exactly what would tell us
 * they had since been promoted.
 *
 * The property these assertions defend is unchanged and is the one that matters:
 * a refused caller must not reach applications, pets, or the audit log.
 */
function databaseCalls(): number {
  return [
    prismaDouble.pet,
    prismaDouble.adoptionApplication,
    prismaDouble.auditLog,
  ]
    .flatMap((model) => Object.values(model))
    .reduce((total, spy) => total + spy.mock.calls.length, 0);
}

beforeEach(() => {
  resetPrismaDouble(prismaDouble);
  // The global harness clears the jar too; restated here because every test in
  // this file depends on starting signed out.
  mockCookieStore.clear();
});

/**
 * An application the database holds and the fixture mirror does not.
 *
 * The id is the point. The mirror is seeded from `src/data/applications.json`,
 * and `atomicUpdateApplicationStatus` and `deleteServerApplication` both consult
 * it before the database, so with a fixture id such as `app-001` either action
 * could succeed without the database ever answering for the row. This one exists
 * only in the double: an admitted caller succeeds only by reading and writing
 * through it.
 */
const SUBMITTED_APPLICATION = makeDbApplication({ id: "itest-app-submitted", status: "SUBMITTED" });

/** Arranges the database to hold `SUBMITTED_APPLICATION`, as every single-row read sees it. */
function givenPersistedApplication() {
  prismaDouble.adoptionApplication.findUnique.mockImplementation(
    async (args?: { where?: { id?: string } }) =>
      args?.where?.id === SUBMITTED_APPLICATION.id ? SUBMITTED_APPLICATION : null
  );
  // The status change's conditional write, `where: { id, status: <as read> }`,
  // finds the one row still in the status it was read in.
  prismaDouble.adoptionApplication.updateMany.mockResolvedValue({ count: 1 });
}

describe("RBAC on the Server Action surface", () => {
  describe("reading applications (ADMIN, COORDINATOR, STAFF)", () => {
    it("rejects an anonymous caller", async () => {
      await expect(getApplications()).rejects.toThrow(/sign in/i);
    });

    it("rejects a VOLUNTEER by role", async () => {
      await signInAs("VOLUNTEER");

      await expect(getApplications()).rejects.toThrow(/not authorized/i);
    });

    it("never reaches the database for a rejected caller", async () => {
      await signInAs("VOLUNTEER");

      await expect(getApplications()).rejects.toThrow();

      // Applications carry applicant PII under PDPA 2010. Authorization has to
      // gate the query, not filter its result.
      expect(databaseCalls()).toBe(0);
    });

    it.each(["ADMIN", "COORDINATOR", "STAFF"] as const)("admits a %s", async (role) => {
      await signInAs(role);

      await expect(getApplications()).resolves.toBeInstanceOf(Array);
      expect(prismaDouble.adoptionApplication.findMany).toHaveBeenCalled();
    });
  });

  describe("changing application status (ADMIN, COORDINATOR)", () => {
    // SUBMITTED to UNDER_REVIEW is a legal transition, so only authorization
    // decides between the refusals and the admission below.
    const input = { id: SUBMITTED_APPLICATION.id, status: "UNDER_REVIEW" as const };

    beforeEach(() => {
      givenPersistedApplication();
    });

    it("refuses an anonymous caller without throwing", async () => {
      // This action returns a result object rather than throwing, so a caller
      // that only checked for exceptions would read the refusal as success.
      // The reason is pinned too: `success: false` alone is also what an
      // action that crashed after skipping the check would return.
      await expect(updateApplicationStatus(input)).resolves.toMatchObject({
        success: false,
        error: expect.stringMatching(/sign in/i),
      });
      expect(databaseCalls()).toBe(0);
    });

    it("refuses a STAFF member, who may read but not decide", async () => {
      await signInAs("STAFF");

      const result = await updateApplicationStatus(input);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not authorized/i);
      expect(databaseCalls()).toBe(0);
    });

    it("admits a COORDINATOR", async () => {
      const coordinator = await signInAs("COORDINATOR");

      const result = await updateApplicationStatus(input);

      // Success, not merely "no authorization error". That weaker assertion
      // passed while this action failed on `findUnique is not a function`.
      expect(result).toEqual({ success: true });
      // The write went through the transaction, conditional on the status read.
      expect(prismaDouble.adoptionApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: input.id, status: "SUBMITTED" },
          data: expect.objectContaining({ status: "UNDER_REVIEW" }),
        })
      );
      expect(getAuditLogs(10)).toContainEqual(
        expect.objectContaining({
          action: "APPLICATION_STATUS_UNDER_REVIEW",
          entityId: input.id,
          actorId: coordinator.id,
        })
      );
    });
  });

  describe("deleting an application (ADMIN only)", () => {
    beforeEach(() => {
      givenPersistedApplication();
    });

    it("refuses a COORDINATOR, who may decide but not erase", async () => {
      await signInAs("COORDINATOR");

      const result = await deleteApplication(SUBMITTED_APPLICATION.id);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not authorized/i);
      expect(databaseCalls()).toBe(0);
    });

    it("admits an ADMIN", async () => {
      const admin = await signInAs("ADMIN");

      const result = await deleteApplication(SUBMITTED_APPLICATION.id);

      expect(result).toEqual({ success: true });
      expect(prismaDouble.adoptionApplication.delete).toHaveBeenCalledWith({
        where: { id: SUBMITTED_APPLICATION.id },
      });
      expect(getAuditLogs(10)).toContainEqual(
        expect.objectContaining({
          action: "APPLICATION_DELETED",
          entityId: SUBMITTED_APPLICATION.id,
          actorId: admin.id,
        })
      );
    });
  });

  describe("the session cookie the roles are read from", () => {
    it("round-trips a sealed session", async () => {
      const { sealSession, unsealSession } = await import("@/lib/security/session");

      const restored = unsealSession(
        sealSession({ id: "usr-1", email: "a@b.org", name: "A", role: "ADMIN" })
      );

      expect(restored).toMatchObject({ id: "usr-1", role: "ADMIN" });
    });

    it("refuses a token whose payload was edited", async () => {
      const { sealSession, unsealSession } = await import("@/lib/security/session");
      const [payload, signature] = sealSession({
        id: "usr-1",
        email: "a@b.org",
        name: "A",
        role: "STAFF",
      }).split(".");

      // Re-encoding the payload as an ADMIN while keeping the old signature is
      // the privilege escalation the HMAC exists to stop.
      const forged = Buffer.from(
        JSON.stringify({
          id: "usr-1",
          email: "a@b.org",
          name: "A",
          role: "ADMIN",
          expiresAt: Date.now() + 60_000,
        }),
        "utf8"
      ).toString("base64url");

      expect(unsealSession(`${forged}.${signature}`)).toBeNull();
      expect(unsealSession(`${payload}.${signature}`)).not.toBeNull();
    });

    it("refuses an expired session", async () => {
      const { sealSession, unsealSession } = await import("@/lib/security/session");

      const expired = sealSession({ id: "usr-1", email: "a@b.org", name: "A", role: "ADMIN" }, -1);

      expect(unsealSession(expired)).toBeNull();
    });

    it("treats an unreadable cookie as signed out rather than erroring", async () => {
      const { SESSION_COOKIE_NAME } = await import("@/lib/security/session");
      mockCookieStore.seed(SESSION_COOKIE_NAME, "not-a-sealed-token");

      await expect(getApplications()).rejects.toThrow(/sign in/i);
    });
  });

  describe("rate limiting on the public entry points", () => {
    it("stops a burst of failed logins within the sliding window", async () => {
      const { checkRateLimit } = await import("@/lib/security/rateLimit");

      // Mirrors `loginAction`'s own budget of 5 per minute per email.
      const outcomes = Array.from({ length: 6 }, () =>
        checkRateLimit("login:attacker@example.com", 5, 60_000)
      );

      expect(outcomes.slice(0, 5).every((r) => r.success)).toBe(true);
      expect(outcomes[5].success).toBe(false);
      expect(outcomes[5].retryAfterSeconds).toBeGreaterThan(0);
    });

    it("budgets each identity separately", async () => {
      const { checkRateLimit } = await import("@/lib/security/rateLimit");

      Array.from({ length: 5 }, () => checkRateLimit("login:victim@example.com", 5, 60_000));

      // Otherwise one attacker could lock every other staff member out.
      expect(checkRateLimit("login:someone-else@example.com", 5, 60_000).success).toBe(true);
    });
  });
});
