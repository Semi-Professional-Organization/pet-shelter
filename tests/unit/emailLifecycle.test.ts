import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendApplicationStatusUpdateEmail,
  sendInterviewInvitationEmail,
} from "@/lib/email";
import { AdoptionApplicationRecord } from "@/types/application";
import { getAuditLogs } from "@/lib/domain/auditLog";

describe("Transactional Email Lifecycle & Meet & Greet Scheduling", () => {
  const sampleApp: AdoptionApplicationRecord = {
    id: "app-lifecycle-101",
    petId: "pet-001",
    petName: "Bella",
    applicantName: "Ahmad Faizal",
    email: "ahmad.faizal@example.com",
    phone: "019-8765432",
    address: "15 Jalan Tempua 3, Bandar Puchong Jaya",
    housingType: "semi_d_bungalow",
    hasFencedYard: "yes",
    currentPets: "dogs",
    householdExperience: "experienced",
    applicantNotes: "We have a large fenced garden.",
    status: "SUBMITTED",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Simulation mode, which every test but the failure one asserts on or needs to succeed
    // without a network. The mailer tests the key for truthiness, so an empty string is unset.
    vi.stubEnv("RESEND_API_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches APPROVED status update email and logs immutable audit trail", async () => {
    const result = await sendApplicationStatusUpdateEmail(
      sampleApp,
      "APPROVED",
      "Passed yard inspection. Ready for pickup Saturday!"
    );

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.messageId).toContain("sim-");

    const logs = getAuditLogs(10);
    const emailLog = logs.find((l) => l.action === "EMAIL_SENT" && l.entityId === sampleApp.id);
    expect(emailLog).toBeDefined();
    expect(emailLog?.details?.template).toBe("STATUS_UPDATE_APPROVED");
    expect(emailLog?.details?.recipient).toBe(sampleApp.email);
  });

  it("dispatches UNDER_REVIEW status update email and logs audit trail", async () => {
    const result = await sendApplicationStatusUpdateEmail(
      sampleApp,
      "UNDER_REVIEW",
      "Reviewing landlord permission letter."
    );

    expect(result.success).toBe(true);

    const logs = getAuditLogs(10);
    const emailLog = logs.find((l) => l.action === "EMAIL_SENT" && l.details?.template === "STATUS_UPDATE_UNDER_REVIEW");
    expect(emailLog).toBeDefined();
  });

  it("dispatches REJECTED status update email politely with coordinator notes", async () => {
    const result = await sendApplicationStatusUpdateEmail(
      sampleApp,
      "REJECTED",
      "Bella requires a home with no other dogs due to prey drive."
    );

    expect(result.success).toBe(true);

    const logs = getAuditLogs(10);
    const emailLog = logs.find((l) => l.action === "EMAIL_SENT" && l.details?.template === "STATUS_UPDATE_REJECTED");
    expect(emailLog).toBeDefined();
  });

  it("dispatches Meet & Greet interview invitation email with full session schedule", async () => {
    const result = await sendInterviewInvitationEmail(sampleApp, {
      interviewDate: "2026-08-20",
      interviewTime: "15:30",
      meetingType: "in_person",
      location: "Hope for Strays Shelter, Petaling Jaya",
      coordinatorNotes: "Please bring your current dog for socialization testing.",
      coordinatorName: "Sarah Lim",
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);

    const logs = getAuditLogs(10);
    const emailLog = logs.find((l) => l.action === "EMAIL_SENT" && l.details?.template === "INTERVIEW_INVITATION");
    expect(emailLog).toBeDefined();
    expect(emailLog?.details?.recipient).toBe(sampleApp.email);
  });

  it("logs EMAIL_FAILED in audit trail when network or API fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "test_key_fail");
    // A fresh Response for every call, because a body can be read only once.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("Invalid API key", { status: 401 })
    );

    const result = await sendApplicationStatusUpdateEmail(sampleApp, "APPROVED");
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");

    const logs = getAuditLogs(10);
    const failLog = logs.find((l) => l.action === "EMAIL_FAILED" && l.entityId === sampleApp.id);
    expect(failLog).toBeDefined();
    expect(failLog?.details?.error).toContain("401");
  });
});
