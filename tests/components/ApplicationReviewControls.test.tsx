import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { setupUser } from "./support/render";
import type { AdoptionApplicationRecord } from "@/types/application";

const actions = vi.hoisted(() => ({
  updateApplicationStatus: vi.fn(),
  deleteApplication: vi.fn(),
  scheduleApplicationInterview: vi.fn(),
}));

vi.mock("@/actions/applications", () => actions);

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
  beforeEach(() => {
    actions.updateApplicationStatus.mockReset().mockResolvedValue({ success: true });
    actions.deleteApplication.mockReset().mockResolvedValue({ success: true });
    actions.scheduleApplicationInterview.mockReset().mockResolvedValue({ success: true });
  });

  it("offers a member who may only read (STAFF, Animal Manager) no decision and no delete", async () => {
    board(false, false);

    expect(statusSelect()).toBeNull();
    expect(deleteButton()).toBeNull();

    const dialog = await openDetail();
    expect(within(dialog).queryByRole("button", { name: /Save Decision/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Schedule Meet & Greet/i })).toBeNull();
    // Names whoever the matrix lets review, rather than roles written into the text.
    expect(within(dialog).getByText(/You can read this application/)).toHaveTextContent(
      "needs the Super Admin or Volunteer Coordinator role"
    );
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

  it("offers nobody a reset of sample data the board does not show", () => {
    // It rewrote the browser's copy, which the board never shows now that the page always
    // passes the server's applications, so it changed nothing anyone could see.
    board(true, true);

    expect(screen.queryByRole("button", { name: /Reset Sample Data/i })).toBeNull();
  });

  it("sends a decision on a real application to the server", async () => {
    // The board checked the browser's sample store first, which holds no real application,
    // answered "Application not found" and never asked the server. Fails against that.
    board(true, false);

    await setupUser().selectOptions(statusSelect()!, "UNDER_REVIEW");

    expect(actions.updateApplicationStatus).toHaveBeenCalledWith({ id: APPLICATION.id, status: "UNDER_REVIEW" });
    expect(screen.queryByText(/Application not found/)).toBeNull();
  });
});

/**
 * The review dialog reports what the server did.
 *
 * Once decisions reached the server, two things the dialog did on its own became visible:
 * it said a decision was saved before the server answered, and it followed every meet and
 * greet with a status save of its own, which replaced the meeting's notes, sent a second
 * email and moved decided applications back to Under Review. Each case fails against the
 * dialog before 2026-10-20.
 */
describe("applications review dialog", () => {
  beforeEach(() => {
    actions.updateApplicationStatus.mockReset().mockResolvedValue({ success: true });
    actions.scheduleApplicationInterview.mockReset();
  });

  // The board behind an open dialog is hidden from the accessibility tree.
  const rowStatus = () =>
    screen.getByRole("combobox", { name: /Change status for application/i, hidden: true });

  it("keeps the dialog open with the server's refusal when a decision is refused", async () => {
    const refusal = "Illegal status transition: Cannot change application from 'SUBMITTED' to 'APPROVED'.";
    actions.updateApplicationStatus.mockResolvedValue({ success: false, error: refusal });
    board(true, false);

    const user = setupUser();
    const dialog = await openDetail();
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await user.click(within(dialog).getByRole("button", { name: /Save Decision/i }));

    expect(await within(dialog).findByText(refusal)).toBeInTheDocument();
    expect(within(dialog).queryByText(/saved successfully/i)).toBeNull();
    expect(rowStatus()).toHaveValue("SUBMITTED");
  });

  it("schedules a meet and greet with one write, keeping a decided application's status", async () => {
    actions.scheduleApplicationInterview.mockResolvedValue({
      success: true,
      status: "APPROVED",
      adminReviewNotes: "[Meet & Greet Scheduled: 2026-11-02 at 14:00 (In-Person Visit) - Location: Shelter]",
    });
    render(
      <ApplicationDataTable
        initialApplications={[{ ...APPLICATION, status: "APPROVED" }]}
        canReview={true}
        canDelete={false}
      />
    );

    const user = setupUser();
    const dialog = await openDetail();
    await user.click(within(dialog).getByRole("button", { name: /Schedule Meet & Greet/i }));
    await user.click(within(dialog).getByRole("button", { name: /Confirm Meet & Greet/i }));

    expect(await within(dialog).findByText(/Meet & Greet scheduled/)).toBeInTheDocument();
    expect(actions.scheduleApplicationInterview).toHaveBeenCalledTimes(1);
    expect(actions.updateApplicationStatus).not.toHaveBeenCalled();
    expect(rowStatus()).toHaveValue("APPROVED");
  });

  it("says no email went out when the invitation box was unticked", async () => {
    actions.scheduleApplicationInterview.mockResolvedValue({
      success: true,
      status: "UNDER_REVIEW",
      adminReviewNotes: "[Meet & Greet Scheduled: 2026-11-02 at 14:00 (In-Person Visit) - Location: Shelter]",
    });
    board(true, false);

    const user = setupUser();
    const dialog = await openDetail();
    await user.click(within(dialog).getByRole("button", { name: /Schedule Meet & Greet/i }));
    await user.click(within(dialog).getByLabelText(/Dispatch calendar invitation email/i));
    await user.click(within(dialog).getByRole("button", { name: /Confirm Meet & Greet/i }));

    expect(await within(dialog).findByText("Meet & Greet scheduled. No email was sent.")).toBeInTheDocument();
    expect(actions.scheduleApplicationInterview).toHaveBeenCalledWith(
      expect.objectContaining({ notifyApplicant: false })
    );
  });
});
