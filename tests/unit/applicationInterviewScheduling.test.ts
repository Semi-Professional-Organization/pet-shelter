import { describe, it, expect, vi, beforeEach } from "vitest";
import { signInAs } from "../setup/authSession";
import { ROLES } from "@/lib/security/permissions";
import type { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";

vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(),
}));
vi.mock("@/lib/server/applicationRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/applicationRepository")>();
  return { ...actual, atomicUpdateApplicationStatus: vi.fn(actual.atomicUpdateApplicationStatus) };
});
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendInterviewInvitationEmail: vi.fn(async () => undefined),
}));

import { scheduleApplicationInterview } from "@/actions/applications";
import {
  atomicUpdateApplicationStatus,
  findServerApplicationById,
  insertServerApplication,
} from "@/lib/server/applicationRepository";
import { sendInterviewInvitationEmail } from "@/lib/email";

/**
 * Scheduling a meet and greet is one write, and says what it wrote.
 *
 * The review dialog followed every schedule with a status save of its own, so the board
 * would show the change: that replaced the meeting's notes, sent a second email and moved
 * decided applications back to Under Review. The action now answers with the status and
 * notes it wrote, which the board shows instead. It also used to ignore a write the
 * repository refused and send the invitation anyway. Every case fails against the action
 * before 2026-10-20, which answered only `{ success: true }`.
 */
const MEETING = {
  interviewDate: "2026-11-02",
  interviewTime: "14:00",
  meetingType: "in_person" as const,
  location: "Hope for Strays Shelter, Petaling Jaya",
  coordinatorNotes: "Bring the resident dog.",
  notifyApplicant: true,
};

function application(id: string, status: ApplicationStatus): AdoptionApplicationRecord {
  return {
    id,
    petId: "pet-001",
    petName: "Barnaby",
    applicantName: "Sarah Tan",
    email: "sarah.tan@example.com",
    phone: "012-345 6789",
    address: "No. 14, Jalan SS 2/60, Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    status,
    adminReviewNotes: "Home check passed.",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  } as AdoptionApplicationRecord;
}

describe("scheduleApplicationInterview", () => {
  beforeEach(async () => {
    await signInAs(ROLES.VOLUNTEER_COORDINATOR);
    const { findMemberAuthStateById } = await import("@/lib/server/memberStore");
    vi.mocked(findMemberAuthStateById).mockResolvedValue({
      role: ROLES.VOLUNTEER_COORDINATOR,
      status: "ACTIVE",
      name: "Test Member",
      email: "member@hopeforstrays.org",
    });
    vi.mocked(sendInterviewInvitationEmail).mockClear();
  });

  it("moves a submitted application to Under Review and answers with what it wrote", async () => {
    await insertServerApplication(application("app-meet-1", "SUBMITTED"));

    const result = await scheduleApplicationInterview({ applicationId: "app-meet-1", ...MEETING });

    const stored = findServerApplicationById("app-meet-1");
    expect(stored?.status).toBe("UNDER_REVIEW");
    expect(result).toEqual({
      success: true,
      status: "UNDER_REVIEW",
      adminReviewNotes: stored?.adminReviewNotes,
    });
    expect(stored?.adminReviewNotes).toContain("Location: Hope for Strays Shelter, Petaling Jaya");
  });

  it("keeps a decided application's status", async () => {
    await insertServerApplication(application("app-meet-2", "APPROVED"));

    const result = await scheduleApplicationInterview({ applicationId: "app-meet-2", ...MEETING });

    expect(result).toMatchObject({ success: true, status: "APPROVED" });
    expect(findServerApplicationById("app-meet-2")?.status).toBe("APPROVED");
  });

  it("stops at a write the repository refused, before the invitation goes out", async () => {
    await insertServerApplication(application("app-meet-3", "SUBMITTED"));
    const refusal = "Application was modified concurrently; reload and retry";
    vi.mocked(atomicUpdateApplicationStatus).mockResolvedValueOnce({ success: false, error: refusal });

    const result = await scheduleApplicationInterview({ applicationId: "app-meet-3", ...MEETING });

    expect(result).toEqual({ success: false, error: refusal });
    expect(sendInterviewInvitationEmail).not.toHaveBeenCalled();
  });
});
