import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));
vi.mock("@/actions/pets", () => ({
  getPublicPets: vi.fn().mockResolvedValue([]),
}));

// A shelter that has uploaded all three codes, so the QR panel renders its
// channel switcher. With only a DuitNow code there is no switcher and nothing to
// keep in step.
vi.mock("@/components/providers/DonationQrProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/providers/DonationQrProvider")>();
  return {
    ...actual,
    useDonationQrConfig: () => ({
      duitNowQrUrl: "/uploads/duitnow.png",
      tngQrUrl: "/uploads/tng.png",
      bankQrUrl: "/uploads/bank.png",
      paymentPayload: "",
      shelterName: "Hope for Strays",
    }),
  };
});

import { DonationWidget } from "@/components/features/donations/DonationWidget";
import { submitDonationPledgeAction } from "@/actions/donations";
import { setMockLocation } from "../setup/nextMocks";
import { renderWithLanguage, setupUser, makePet } from "./support/render";

/**
 * The QR panel's channel switcher is a second place a donor says how they are
 * paying, and the submitted payload could not see it. A donor who switched to the
 * bank's QR, paid, and left the rail question alone was recorded as DuitNow QR —
 * the wrong-rail defect the rail question was added to close, reopened by the
 * panel beside it. The switcher now moves the one control that is submitted.
 */
const mockedSubmit = vi.mocked(submitDonationPledgeAction);

function rail() {
  return within(screen.getByRole("group", { name: /how are you paying/i }));
}

describe("the QR panel's channel and the recorded rail stay in step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
    setMockLocation("/donate", "");
    renderWithLanguage(
      <DonationWidget initialPets={[makePet({ id: "pet-001", name: "Bella" })]} />
    );
  });

  it("records a bank transfer when the donor switches to the bank's QR", async () => {
    const user = setupUser();

    await user.click(screen.getByRole("tab", { name: /bank transfer/i }));

    expect(rail().getByRole("radio", { name: /direct bank transfer/i })).toBeChecked();

    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(screen.getByLabelText(/email address/i), "aisyah@example.com");
    await user.click(screen.getByRole("button", { name: /complete donation pledge/i }));

    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ paymentMethod: "online_banking" });
  });

  it("returns to a QR payment for the Touch 'n Go and DuitNow channels", async () => {
    const user = setupUser();

    await user.click(screen.getByRole("tab", { name: /bank transfer/i }));
    await user.click(screen.getByRole("tab", { name: /touch 'n go/i }));
    expect(rail().getByRole("radio", { name: /duitnow qr/i })).toBeChecked();

    await user.click(screen.getByRole("tab", { name: /bank transfer/i }));
    await user.click(screen.getByRole("tab", { name: /duitnow qr/i }));
    expect(rail().getByRole("radio", { name: /duitnow qr/i })).toBeChecked();
  });

  it("lets the donor's own answer stand after they have picked a channel", async () => {
    const user = setupUser();

    await user.click(screen.getByRole("tab", { name: /bank transfer/i }));
    await user.click(rail().getByRole("radio", { name: /duitnow qr/i }));

    // The question is the authority; the switcher only pre-fills it.
    expect(rail().getByRole("radio", { name: /duitnow qr/i })).toBeChecked();
  });
});
