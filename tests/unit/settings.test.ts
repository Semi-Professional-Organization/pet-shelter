import { describe, it, expect, vi, beforeEach } from "vitest";
import { shelterSettingsSchema } from "@/lib/validations/settings";
import {
  updateShelterSettings,
  sendTestEmailAction,
} from "@/actions/settings";
// Not the removed server action: server-side reads go through the repository,
// which is a plain function rather than an HTTP endpoint.
import { getServerSettingsAsync } from "@/lib/server/settingsRepository";
import { getAuditLogs } from "@/lib/domain/auditLog";

// Mock session to simulate authenticated admin user
vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn().mockResolvedValue({
    id: "admin-test-01",
    email: "admin@hopeforstrays.org",
    role: "ADMIN",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Shelter Settings & Live Test Email Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Validation Schema (shelterSettingsSchema)", () => {
    it("should accept valid settings payload with default email & storage config", () => {
      const valid = shelterSettingsSchema.safeParse({
        shelterName: "Hope for Strays PJ",
        email: "contact@hopeforstrays.org",
        phone: "03-7876 5432",
        address: "No. 18, Jalan SS 2/72, Petaling Jaya",
        operatingHours: "Tue-Sun 10am-5pm",
        adoptionFeeDog: "Free",
        adoptionFeeCat: "Free",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.storageProvider).toBe("local");
        expect(valid.data.emailFrom).toContain("onboarding@resend.dev");
      }
    });

    it("should reject invalid email formats", () => {
      const invalid = shelterSettingsSchema.safeParse({
        shelterName: "Hope",
        email: "not-an-email",
        phone: "03-7876 5432",
        address: "No. 18, Jalan SS 2/72, Petaling Jaya",
        operatingHours: "Tue-Sun 10am-5pm",
        adoptionFeeDog: "Free",
        adoptionFeeCat: "Free",
      });

      expect(invalid.success).toBe(false);
    });
  });

  describe("Server Actions: updateShelterSettings", () => {
    it("should update settings and log audit entry", async () => {
      const result = await updateShelterSettings({
        shelterName: "Hope for Strays Sanctuary",
        email: "info@hopeforstrays.org",
        phone: "03-7876 9999",
        address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor",
        operatingHours: "Tue - Sun: 10am - 5pm",
        adoptionFeeDog: "Free",
        adoptionFeeCat: "Free",
        storageProvider: "local",
      });

      expect(result.success).toBe(true);
      expect(result.data?.shelterName).toBe("Hope for Strays Sanctuary");

      const current = await getServerSettingsAsync();
      expect(current.shelterName).toBe("Hope for Strays Sanctuary");

      const logs = getAuditLogs(10);
      const settingsLog = logs.find((l) => l.action === "SETTINGS_UPDATED");
      expect(settingsLog).toBeDefined();
    });
  });

  describe("Server Actions: sendTestEmailAction", () => {
    it("should reject when recipient email is empty or invalid", async () => {
      const result = await sendTestEmailAction({
        recipientEmail: "invalid-email",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("valid recipient email");
    });

    it("should dispatch test email in simulation mode when API key is unset", async () => {
      // The action sends with `RESEND_API_KEY || settings.resendApiKey`, so an empty string is
      // unset. The settings half starts empty: the harness resets the settings before each test.
      vi.stubEnv("RESEND_API_KEY", "");

      const result = await sendTestEmailAction({
        recipientEmail: "test-adopter@example.com",
        customSubject: "Custom Test Subject",
      });

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.messageId).toContain("sim-test-");

      const logs = getAuditLogs(10);
      const testEmailLog = logs.find((l) => l.action === "TEST_EMAIL_SENT" && l.details?.recipient === "test-adopter@example.com");
      expect(testEmailLog).toBeDefined();
    });
  });
});
