import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loginAction, registerAction, logoutAction, getCurrentUserAction } from "@/actions/auth";
import { findUserByEmail, resetUserStore } from "@/lib/server/userStore";
import { ROLES } from "@/lib/security/rbac";

// The configured invite secret for this suite. Deliberately not "1234" or
// "HOPE2026" so the regression tests below prove those literals are dead.
const TEST_INVITE_CODE = "test-staff-invite-code-2026";

// Mock Next.js next/headers cookies store
const cookieStore = new Map<string, { name: string; value: string; [key: string]: unknown }>();

vi.mock("next/headers", () => {
  return {
    cookies: async () => ({
      get: (name: string) => cookieStore.get(name),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        if (options?.maxAge === 0) {
          cookieStore.delete(name);
        } else {
          cookieStore.set(name, { name, value, ...options });
        }
      },
      delete: (name: string) => cookieStore.delete(name),
    }),
  };
});

describe("Authentication Server Actions (Native Register & Login)", () => {
  beforeEach(async () => {
    cookieStore.clear();
    vi.stubEnv("STAFF_INVITE_SECRET", TEST_INVITE_CODE);
    await resetUserStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("loginAction", () => {
    it("should successfully log in with valid demo credentials and set session cookie", async () => {
      const response = await loginAction({
        email: "admin@hopeforstrays.org",
        password: "admin123",
      });

      expect(response.success).toBe(true);
      expect(response.user).toBeDefined();
      expect(response.user?.email).toBe("admin@hopeforstrays.org");
      expect(response.user?.role).toBe(ROLES.SUPER_ADMIN);

      // Verify cookie was set
      const sessionCookie = cookieStore.get("hope_shelter_session");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toMatch(/\./); // base64.signature
    });

    it("should log a coordinator in with their own password hash", async () => {
      const response = await loginAction({
        email: "coordinator@hopeforstrays.org",
        password: "coord123",
      });

      expect(response.success).toBe(true);
      expect(response.user?.role).toBe(ROLES.VOLUNTEER_COORDINATOR);
    });

    it("must NOT accept the removed universal master password for an existing user", async () => {
      // Regression: loginAction previously OR-ed `password === "1234"` into the
      // scrypt check, so that PIN authenticated as any user, including ADMIN.
      const response = await loginAction({
        email: "coordinator@hopeforstrays.org",
        password: "1234",
      });

      expect(response.success).toBe(false);
      expect(response.user).toBeUndefined();
      expect(response.error).toMatch(/Invalid staff email or password/i);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("must NOT accept the removed master password for the ADMIN account", async () => {
      const response = await loginAction({
        email: "admin@hopeforstrays.org",
        password: "1234",
      });

      expect(response.success).toBe(false);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("should reject login with wrong password", async () => {
      const response = await loginAction({
        email: "staff@hopeforstrays.org",
        password: "wrong-password-999",
      });

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Invalid staff email or password/i);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("should reject login for non-existent email", async () => {
      const response = await loginAction({
        email: "nobody@unknown.com",
        password: "somepassword",
      });

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/Invalid staff email or password/i);
    });

    it("should enforce rate limiting on repeated failed login attempts", async () => {
      const email = "bruteforce@target.com";

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await loginAction({ email, password: `wrong-${i}` });
      }

      // 6th attempt should be blocked by rate limiter
      const blockedRes = await loginAction({ email, password: "attempt-6" });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toMatch(/Too many login attempts/i);
      expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("registerAction", () => {
    it("should register a new staff member with a valid invite code and set session cookie", async () => {
      const regResponse = await registerAction({
        name: "Nurul Huda",
        email: "nurul@hopeforstrays.org",
        password: "SecureShelterPass2026!",
        role: ROLES.STAFF,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(regResponse.success).toBe(true);
      expect(regResponse.user).toBeDefined();
      expect(regResponse.user?.name).toBe("Nurul Huda");
      expect(regResponse.user?.email).toBe("nurul@hopeforstrays.org");
      expect(regResponse.user?.role).toBe(ROLES.STAFF);

      // Verify cookie was set
      const sessionCookie = cookieStore.get("hope_shelter_session");
      expect(sessionCookie).toBeDefined();

      // Verify user can now log in with the new password
      const loginRes = await loginAction({
        email: "nurul@hopeforstrays.org",
        password: "SecureShelterPass2026!",
      });
      expect(loginRes.success).toBe(true);
      expect(loginRes.user?.name).toBe("Nurul Huda");
    });

    it("should reject registration with password shorter than 8 characters", async () => {
      const res = await registerAction({
        name: "Short Pass User",
        email: "short@hopeforstrays.org",
        password: "short",
        role: ROLES.STAFF,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/at least 8 characters/i);
    });

    it("should reject registration with invalid email format", async () => {
      const res = await registerAction({
        name: "Invalid Email User",
        email: "invalid-email-address",
        password: "ValidPassword123!",
        role: ROLES.STAFF,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/valid email/i);
    });

    it("should reject registration with duplicate email", async () => {
      const res = await registerAction({
        name: "Imposter Admin",
        email: "admin@hopeforstrays.org",
        password: "SomePassword123!",
        role: ROLES.STAFF,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already exists/i);
    });

    // Self-service registration no longer accepts a requested role at all.
    // Elevated access is granted exclusively by inviteMember(), so the shared
    // invite PIN that previously minted ADMIN accounts is gone.
    it("should downgrade a requested SUPER_ADMIN role to STAFF", async () => {
      // A valid invite code is now required for every registration, so this
      // supplies one: the property under test is that holding one still does
      // not let the caller choose their own role.
      const res = await registerAction({
        name: "Privilege Escalation Attacker",
        email: "attacker@test.com",
        password: "ValidPassword123!",
        role: ROLES.SUPER_ADMIN,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(res.success).toBe(true);
      expect(res.user?.role).toBe(ROLES.STAFF);
      expect(res.user?.role).not.toBe(ROLES.SUPER_ADMIN);
    });

    it("should ignore a staff invite code and still assign STAFF", async () => {
      const res = await registerAction({
        name: "New Shelter Coordinator",
        email: "new.coordinator@hopeforstrays.org",
        password: "ValidCoordinatorPassword123!",
        role: ROLES.COORDINATOR,
        staffInviteCode: TEST_INVITE_CODE,
      });

      expect(res.success).toBe(true);
      expect(res.user?.role).toBe(ROLES.STAFF);
    });

    it("must reject the hardcoded HOPE2026 invite literal when a real secret is configured", async () => {
      const res = await registerAction({
        name: "Legacy Literal Attacker",
        email: "hope2026@test.com",
        password: "ValidPassword123!",
        role: ROLES.ADMIN,
        staffInviteCode: "HOPE2026",
      });

      expect(res.success).toBe(false);
      expect(res.user).toBeUndefined();
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("must reject the hardcoded demo PIN invite literal when a real secret is configured", async () => {
      const res = await registerAction({
        name: "Demo PIN Attacker",
        email: "pin1234@test.com",
        password: "ValidPassword123!",
        role: ROLES.COORDINATOR,
        staffInviteCode: "1234",
      });

      expect(res.success).toBe(false);
      expect(res.user).toBeUndefined();
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("must require an invite code for the default STAFF role, which reads applicant PII", async () => {
      const res = await registerAction({
        name: "Anonymous Staff Signup",
        email: "anon.staff@test.com",
        password: "ValidPassword123!",
        // No role supplied: defaults to STAFF, which grants getApplications().
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invite code is required/i);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("must require an invite code for the VOLUNTEER role", async () => {
      const res = await registerAction({
        name: "Anonymous Volunteer",
        email: "anon.volunteer@test.com",
        password: "ValidPassword123!",
        role: ROLES.VOLUNTEER,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invite code is required/i);
    });

    it("must not publish any credential in the invite failure message", async () => {
      const res = await registerAction({
        name: "Message Leak Probe",
        email: "leak.probe@test.com",
        password: "ValidPassword123!",
        role: ROLES.ADMIN,
        staffInviteCode: "wrong-code",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).not.toContain("1234");
      expect(res.error).not.toContain("HOPE2026");
      expect(res.error).not.toContain(TEST_INVITE_CODE);
      expect(res.error).not.toMatch(/for demo/i);
    });

    it("must fail closed, not open, when STAFF_INVITE_SECRET is unset in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STAFF_INVITE_SECRET", undefined);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      // Disabled, not thrown: the boot no longer stops for this secret, so the
      // action itself is where a bad one must refuse, and say so.
      const res = await registerAction({
        name: "Misconfigured Deploy",
        email: "misconfigured@test.com",
        password: "ValidPassword123!",
        role: ROLES.STAFF,
        staffInviteCode: "any-guess",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Staff registration is unavailable/);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
      error.mockRestore();
    });

    // The site now boots with a published invite secret, so the action is the
    // only guard: submitting that same published code must create nothing.
    it("creates no account in production when the invite secret is published and matched", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STAFF_INVITE_SECRET", "HOPE2026");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await registerAction({
        name: "Published Code",
        email: "published-code@test.com",
        password: "ValidPassword123!",
        role: ROLES.STAFF,
        staffInviteCode: "HOPE2026",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Staff registration is unavailable/);
      expect(await findUserByEmail("published-code@test.com")).toBeFalsy();
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
      // Logged per request with the reason, never the value.
      const logged = error.mock.calls.flat().join(" ");
      expect(logged).toMatch(/Staff registration refused: STAFF_INVITE_SECRET is set to a value this repository publishes/);
      expect(logged).not.toMatch(/hope2026/i);
      error.mockRestore();
    });

    it("should honour a rotated STAFF_INVITE_SECRET at call time", async () => {
      vi.stubEnv("STAFF_INVITE_SECRET", "rotated-invite-secret-2026");

      const stale = await registerAction({
        name: "Stale Code Holder",
        email: "stale.code@test.com",
        password: "ValidPassword123!",
        role: ROLES.STAFF,
        staffInviteCode: TEST_INVITE_CODE,
      });
      expect(stale.success).toBe(false);

      const fresh = await registerAction({
        name: "Fresh Code Holder",
        email: "fresh.code@test.com",
        password: "ValidPassword123!",
        role: ROLES.STAFF,
        staffInviteCode: "rotated-invite-secret-2026",
      });
      expect(fresh.success).toBe(true);
    });
  });

  describe("logoutAction & getCurrentUserAction", () => {
    it("should clear session cookie on logout", async () => {
      // First login
      await loginAction({
        email: "admin@hopeforstrays.org",
        password: "admin123",
      });
      expect(cookieStore.get("hope_shelter_session")).toBeDefined();

      // Logout
      const logoutRes = await logoutAction();
      expect(logoutRes.success).toBe(true);
      expect(cookieStore.get("hope_shelter_session")).toBeUndefined();
    });

    it("should return the current session user when authenticated", async () => {
      await loginAction({
        email: "staff@hopeforstrays.org",
        password: "staff123",
      });

      const userRes = await getCurrentUserAction();
      expect(userRes.user).not.toBeNull();
      expect(userRes.user?.email).toBe("staff@hopeforstrays.org");
    });
  });
});
