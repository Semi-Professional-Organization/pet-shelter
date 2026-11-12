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

    const user = setupUser();
    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(screen.getByLabelText(/email address/i), "aisyah@example.com");
    await user.click(screen.getByRole("button", { name: /complete donation pledge/i }));

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ targetPetName: "Tuah" });

    await screen.findByText("HFS-GFT-20261111-000001");
    const line = screen.getByText((_content, element) => {
      const text = element?.textContent ?? "";
      return (
        text.includes("Tuah") &&
        !Array.from(element?.children ?? []).some((child) => child.textContent?.includes("Tuah"))
      );
    });
    expect(line).toHaveTextContent(/^🐾 Your dedication: Tuah$/);
    expect(document.body).not.toHaveTextContent(/Dedicated (Pet|Animal)/i);
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

    expect(
      await screen.findByText(/Core Vaccination & Deworming · Donor's note \(dedication\): Tuah/)
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/in honour of/i);
  });
});
