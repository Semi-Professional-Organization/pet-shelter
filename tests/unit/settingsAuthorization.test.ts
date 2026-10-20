import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateShelterSettings, sendTestEmailAction } from "@/actions/settings";
import { getAuditLogs } from "@/lib/domain/auditLog";
import { ROLES } from "@/lib/security/permissions";

/**
 * Regression guard for the privilege split found in review.
 *
 * `updateShelterSettings` was `[ROLES.ADMIN]` before the RBAC migration. It was
 * briefly collapsed onto a permission the Volunteer Coordinator holds, which
 * handed that role the ability to rewrite `resendApiKey` and the storage
 * configuration — i.e. to redirect the shelter's outbound email. These tests
 * pin the boundary at the action, not just at the permission matrix.
 */

const currentRole = { value: ROLES.SUPER_ADMIN as string };

vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn(async () => ({
    id: "actor-1",
    email: "actor@hopeforstrays.org",
    name: "Test Actor",
    role: currentRole.value,
    expiresAt: Date.now() + 3_600_000,
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function validSettings(overrides: Record<string, unknown> = {}) {
  return {
    shelterName: "Hope for Strays",
    email: "contact@hopeforstrays.org",
    phone: "03-7876 5432",
    address: "No. 18, Jalan SS 2/72, Petaling Jaya",
    operatingHours: "Tue-Sun 10am-5pm",
    adoptionFeeDog: "Free",
    adoptionFeeCat: "Free",
    ...overrides,
  };
}

describe("Shelter settings authorization boundary", () => {
  beforeEach(() => {
    currentRole.value = ROLES.SUPER_ADMIN;
  });

  describe("updateShelterSettings", () => {
    it("admits a SUPER_ADMIN", async () => {
      const res = await updateShelterSettings(validSettings({ shelterName: "Hope PJ" }));
      expect(res.success).toBe(true);
    });

    it("refuses a VOLUNTEER_COORDINATOR", async () => {
      currentRole.value = ROLES.VOLUNTEER_COORDINATOR;

      const res = await updateShelterSettings(
        validSettings({ resendApiKey: "re_attacker_controlled_key" })
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("MANAGE_SETTINGS");
    });

    it("refuses a legacy COORDINATOR session", async () => {
      currentRole.value = "COORDINATOR";
      const res = await updateShelterSettings(validSettings());
      expect(res.success).toBe(false);
    });

    it.each([ROLES.ANIMAL_MANAGER, ROLES.CONTENT_EDITOR, ROLES.STAFF])(
      "refuses a %s",
      async (role) => {
        currentRole.value = role;
        const res = await updateShelterSettings(validSettings());
        expect(res.success).toBe(false);
      }
    );

    it("keeps the credential out of the audit trail", async () => {
      const res = await updateShelterSettings(
        validSettings({ resendApiKey: "re_live_secret_value_do_not_log" })
      );
      expect(res.success).toBe(true);

      const entry = getAuditLogs(50).find((log) => log.action === "SETTINGS_UPDATED");
      expect(entry).toBeDefined();

      const serialized = JSON.stringify(entry?.details ?? {});
      expect(serialized).not.toContain("re_live_secret_value_do_not_log");
      // The fact that a key is configured is still auditable.
      expect(serialized).toContain("[redacted]");
    });
  });

  describe("sendTestEmailAction", () => {
    // No path here may reach Resend, even through a regressed guard. The action sends with
    // `RESEND_API_KEY || settings.resendApiKey`: an empty string is unset, and the harness resets
    // the settings before each test, so the key saved by the audit-trail test above is gone.
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "");
    });

    it("stays available to a VOLUNTEER_COORDINATOR, as it was pre-migration", async () => {
      currentRole.value = ROLES.VOLUNTEER_COORDINATOR;
      const res = await sendTestEmailAction({ recipientEmail: "coord@hopeforstrays.org" });
      // Simulation mode when RESEND_API_KEY is unset; the point is that the
      // guard let it through rather than returning a permission error.
      expect(res.error ?? "").not.toContain("SEND_SHELTER_EMAIL");
    });

    it("refuses a STAFF member", async () => {
      currentRole.value = ROLES.STAFF;
      const res = await sendTestEmailAction({ recipientEmail: "staff@hopeforstrays.org" });
      expect(res.success).toBe(false);
      expect(res.error).toContain("SEND_SHELTER_EMAIL");
    });
  });
});
