import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({
  submitDonationPledgeAction: vi.fn(),
  listPendingDonationPledgesAction: vi.fn(),
  reconcileDonationPledgeAction: vi.fn(),
  rejectDonationPledgeAction: vi.fn(),
}));
vi.mock("@/actions/pets", () => ({ getPublicPets: vi.fn().mockResolvedValue([]) }));

import {
  listPendingDonationPledgesAction,
  submitDonationPledgeAction,
} from "@/actions/donations";
import { DonationWidget } from "@/components/features/donations/DonationWidget";
import { DonationPledgeReconciliation } from "@/components/admin/DonationPledgeReconciliation";
import { setMockLocation } from "../setup/nextMocks";
import { makePet, renderWithLanguage, setupUser } from "./support/render";

/**
 * A donation earmark is the donor's own note, not a verified animal (owner's decision,
 * tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md; #205).
 *
 * `/donate?pet=Tuah` seeds the earmark from the query string and the server stores it
 * unchecked, so a gift can name an animal the shelter does not hold. That is allowed:
 * what is not allowed is any surface presenting it as a confirmed animal. Until this
 * change the donor's confirmation said "Dedicated Pet: Tuah" and the coordinator's queue
 * said "in honour of Tuah".
 */

const mockedSubmit = vi.mocked(submitDonationPledgeAction);

async function fillAndSubmit(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
  await user.type(screen.getByLabelText(/email address/i), "aisyah@example.com");
  await user.click(screen.getByRole("button", { name: /complete donation pledge/i }));
}

/** The deepest element whose text contains `needle`, for text split across nodes. */
function deepestContaining(needle: string) {
  return screen.getByText((_content, element) => {
    const text = element?.textContent ?? "";
    return (
      text.includes(needle) &&
      !Array.from(element?.children ?? []).some((child) => child.textContent?.includes(needle))
    );
  });
}
const mockedListPending = vi.mocked(listPendingDonationPledgesAction);

// The catalogue the widget is handed holds no Tuah.
const catalogue = [makePet({ id: "pet-001", name: "Bella" }), makePet({ id: "pet-002", name: "Tiger" })];

beforeEach(() => {
  vi.clearAllMocks();
  setMockLocation("/donate", "");
});

describe("/donate?pet=Tuah when the catalogue holds no Tuah", () => {
  it("sends Tuah as the donor's text and confirms it as their dedication, not a pet", async () => {
    mockedSubmit.mockResolvedValue({
      success: true,
      data: {
        pledgeRef: "HFS-GFT-20261111-000001",
        donorName: "Aisyah Rahman",
        donorEmail: "aisyah@example.com",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 50,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        targetPetName: "Tuah",
        status: "PENDING_PAYMENT",
        reconciliationNotice: "Our coordinator will match your transfer.",
      },
    });

    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    // Before submitting: the chooser cannot show a name it does not hold, so the
    // dedication the pledge will carry is stated beside it.
    expect(deepestContaining("Your dedication")).toHaveTextContent(/^🐾 Your dedication: Tuah$/);
    expect(screen.getByRole("button", { name: /remove your dedication/i })).toBeInTheDocument();

    const user = setupUser();
    await fillAndSubmit(user);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ targetPetName: "Tuah" });

    await screen.findByText("HFS-GFT-20261111-000001");
    expect(deepestContaining("Tuah")).toHaveTextContent(/^🐾 Your dedication: Tuah$/);
    expect(document.body).not.toHaveTextContent(/Dedicated (Pet|Animal)/i);
  });

  it("lets the donor remove the dedication before submitting, sending none", async () => {
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    setMockLocation("/donate", "pet=Tuah");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    const user = setupUser();
    await user.click(screen.getByRole("button", { name: /remove your dedication/i }));
    expect(screen.queryByText(/your dedication/i)).toBeNull();

    await fillAndSubmit(user);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0].targetPetName).toBeUndefined();
  });

  it("shows no separate dedication line when the name is an animal in the chooser", () => {
    setMockLocation("/donate", "pet=Bella");
    renderWithLanguage(<DonationWidget initialPets={catalogue} />);

    expect(screen.queryByText(/your dedication/i)).toBeNull();
  });

  it("shows the coordinator Tuah under the donor's-note label, never 'in honour of'", async () => {
    mockedListPending.mockResolvedValue({
      success: true,
      hasMore: false,
      data: [
        {
          pledgeRef: "HFS-GFT-20261111-000001",
          donorName: "Aisyah Rahman",
          donorEmail: "aisyah@example.com",
          tierName: "Core Vaccination & Deworming",
          amountDisplay: "RM 50.00",
          frequency: "one_time",
          paymentMethod: "duitnow_qr",
          targetPetName: "Tuah",
          createdAt: "2026-11-11T02:00:00.000Z",
        },
      ],
    });

    renderWithLanguage(<DonationPledgeReconciliation />);

    const note = await screen.findByText(/Donor's note \(dedication\):/);
    expect(note).toHaveTextContent(/^Donor's note \(dedication\): “Tuah”$/);
    expect(document.body).not.toHaveTextContent(/in honour of/i);
  });

  it("keeps a dedication containing ' · ' off the queue's own field line, in quotes", async () => {
    const forged = "Tuah · Monthly · Credit / Debit Card · pledged 1 Jan 2020";
    mockedListPending.mockResolvedValue({
      success: true,
      hasMore: false,
      data: [
        {
          pledgeRef: "HFS-GFT-20261111-000002",
          donorName: "Aisyah Rahman",
          donorEmail: "aisyah@example.com",
          tierName: "Core Vaccination & Deworming",
          amountDisplay: "RM 50.00",
          frequency: "one_time",
          paymentMethod: "duitnow_qr",
          targetPetName: forged,
          createdAt: "2026-11-11T02:00:00.000Z",
        },
      ],
    });

    renderWithLanguage(<DonationPledgeReconciliation />);

    const note = await screen.findByText(/Donor's note \(dedication\):/);
    // The note's whole text sits inside the quotes, on its own line.
    expect(note).toHaveTextContent(`Donor's note (dedication): “${forged}”`);
    // The line the queue states itself begins with the tier and names none of the note.
    const fields = screen.getByText(/^Core Vaccination & Deworming · One-time ·/);
    expect(fields).not.toHaveTextContent(/Tuah|Monthly|Credit/);
  });
});
