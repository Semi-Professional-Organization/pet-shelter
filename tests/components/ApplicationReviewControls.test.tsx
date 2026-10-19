import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { setupUser } from "./support/render";
import type { AdoptionApplicationRecord } from "@/types/application";

vi.mock("@/actions/applications", () => ({
  updateApplicationStatus: vi.fn().mockResolvedValue({ success: true }),
  deleteApplication: vi.fn().mockResolvedValue({ success: true }),
  scheduleApplicationInterview: vi.fn().mockResolvedValue({ success: true }),
}));

import { ApplicationDataTable } from "@/components/admin/ApplicationDataTable";

/**
 * The applications board offers each member only the controls their actions accept.
 *
 * Reading applications (VIEW_APPLICATIONS), deciding them (REVIEW_APPLICATIONS) and deleting
 * them (DELETE_APPLICATIONS) are three permissions. STAFF and Animal Managers hold only the
 * first and a Volunteer Coordinator lacks the last, but every control rendered for everyone:
 * the status select and "Save Decision" applied on screen and were then rolled back with a
 * refusal, and the delete button removed the row before restoring it. The read-only cases
 * fail against the board before 2026-10-19, which took no such props.
 */
const APPLICATION: AdoptionApplicationRecord = {
  id: "app-test-1",
  petId: "pet-001",
  petName: "Barnaby",
  petBreed: "Kampung Dog",
  applicantName: "Sarah Tan",
  email: "sarah.tan@example.com",
  phone: "012-345 6789",
  address: "No. 14, Jalan SS 2/60, Petaling Jaya",
  housingType: "landed_terrace",
  hasFencedYard: "yes",
  currentPets: "none",
  currentPetDetails: "",
  householdExperience: "experienced",
  applicantNotes: "",
  status: "SUBMITTED",
  adminReviewNotes: "",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
} as AdoptionApplicationRecord;

function board(canReview: boolean, canDelete: boolean) {
  return render(
    <ApplicationDataTable initialApplications={[APPLICATION]} canReview={canReview} canDelete={canDelete} />
  );
}

const statusSelect = () => screen.queryByRole("combobox", { name: /Change status for application/i });
const deleteButton = () => screen.queryByTitle("Archive / Delete application");

async function openDetail() {
  const user = setupUser();
  await user.click(screen.getByRole("button", { name: /View/i }));
  return screen.getByRole("dialog");
}

describe("applications board controls", () => {
  it("offers a member who may only read (STAFF, Animal Manager) no decision and no delete", async () => {
    board(false, false);

    expect(statusSelect()).toBeNull();
    expect(deleteButton()).toBeNull();

    const dialog = await openDetail();
    expect(within(dialog).queryByRole("button", { name: /Save Decision/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Schedule Meet & Greet/i })).toBeNull();
    expect(within(dialog).getByText(/You can read this application/)).toBeInTheDocument();
  });

  it("offers a Volunteer Coordinator decisions but not delete", async () => {
    board(true, false);

    expect(statusSelect()).not.toBeNull();
    expect(deleteButton()).toBeNull();

    const dialog = await openDetail();
    expect(within(dialog).getByRole("button", { name: /Save Decision/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Schedule Meet & Greet/i })).toBeInTheDocument();
  });

  it("offers a Super Admin every control", () => {
    board(true, true);

    expect(statusSelect()).not.toBeNull();
    expect(deleteButton()).not.toBeNull();
  });
});
