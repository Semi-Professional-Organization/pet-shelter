import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

const { saveDonationReceipt } = vi.hoisted(() => ({
  saveDonationReceipt: vi.fn(),
}));

vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));
vi.mock("@/actions/sponsorships", () => ({
  createPetSponsorshipAction: vi.fn(),
}));
vi.mock("@/lib/client/sponsorshipStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/client/sponsorshipStore")>();

  return {
    ...actual,
    useSponsorshipStore: () => ({
      tiers: actual.SPONSORSHIP_TIERS,
      receipts: [],
      activeReceipt: null,
      setActiveReceipt: vi.fn(),
      saveDonationReceipt,
    }),
  };
});

import { submitDonationPledgeAction } from "@/actions/donations";
import { createPetSponsorshipAction } from "@/actions/sponsorships";
import { SponsorshipModal } from "@/components/features/pets/SponsorshipModal";
import { makePet, renderWithLanguage, setupUser } from "./support/render";

const mockedSubmitDonation = vi.mocked(submitDonationPledgeAction);
const mockedCreateSponsorship = vi.mocked(createPetSponsorshipAction);

const donationPledge = {
  pledgeRef: "HFS-GFT-20260914-004242",
  donorName: "Aisyah Rahman",
  donorEmail: "aisyah@example.com",
  tierId: "vaccine" as const,
  tierName: "Core Vaccination & Deworming",
  amountMYR: 50,
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
  status: "PENDING_PAYMENT",
  reconciliationNotice:
    "Your official receipt is issued once our coordinator matches your transfer.",
};

const sponsorshipPledge = {
  pledgeRef: "HFS-PLG-20260914-ABCD",
  petName: "Bella",
  sponsorName: "Aisyah Rahman",
  sponsorEmail: "aisyah@example.com",
  tierId: "vaccine",
  tierName: "Core Vaccination & Deworming",
  amountMYR: 50,
  frequency: "one_time" as const,
  paymentMethod: "duitnow_qr" as const,
  status: "PENDING_PAYMENT",
  reconciliationNotice:
    "Quote HFS-PLG-20260914-ABCD on your transfer. A receipt follows reconciliation.",
};

const QR_INSTRUCTIONS =
  "Scan with Maybank MAE, CIMB, TNG eWallet, Public Bank, etc.";
const BANK_ACCOUNT_NUMBER = "5140 1234 5678";
const MISLEADING_TRANSFER_FAILURE =
  "We could not record this transfer, so no receipt was issued. Nothing has been charged - please try again.";

async function fillRequiredDonorDetails() {
  const user = setupUser();
  await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
  await user.type(
    screen.getByLabelText(/email address/i),
    "aisyah@example.com",
  );
  return user;
}

function submissionButton() {
  return screen.getByRole("button", {
    // Both lanes record a pledge now: the general-gift button stopped saying
    // "Complete Donation" on 2026-09-22, because completing the form no longer
    // completes anything the shelter can receipt.
    name: /confirm sponsorship|record .*(sponsorship|donation) pledge/i,
  });
}

function expectBefore(earlier: Element, later: Element) {
  expect(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
}

async function expectSafeTransferFailure(recordKind: "pledge" | "receipt") {
  const message = await screen.findByText(
    new RegExp(
      `could not confirm that a ${recordKind} was ${recordKind === "pledge" ? "recorded" : "issued"}`,
      "i",
    ),
  );

  expect(message).not.toHaveTextContent(/nothing has been charged/i);
  expect(message).toHaveTextContent(/contact the shelter/i);
  expect(message).toHaveTextContent(/bank reference/i);
  expect(message).toHaveTextContent(
    /before (?:trying|you try|retrying) again/i,
  );
}

describe("SponsorshipModal checkout contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSubmitDonation.mockResolvedValue({
      success: false,
      error: "unexpected donation path",
    });
    mockedCreateSponsorship.mockResolvedValue({
      success: false,
      error: "stubbed sponsorship",
    });
  });

  it.each(["action result", "thrown network error"] as const)(
    "does not deny a possible external transfer after a target-pet %s",
    async (failureMode) => {
      if (failureMode === "action result") {
        mockedCreateSponsorship.mockResolvedValue({
          success: false,
          error: MISLEADING_TRANSFER_FAILURE,
        });
      } else {
        mockedCreateSponsorship.mockRejectedValue(new Error("network down"));
      }

      const pet = makePet({ id: "pet-bella", name: "Bella" });
      renderWithLanguage(
        <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
      );

      const user = await fillRequiredDonorDetails();
      await user.click(submissionButton());

      await expectSafeTransferFailure("pledge");
      expect(
        screen.queryByText(/nothing has been charged/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/HFS-PLG-/i)).not.toBeInTheDocument();
    },
  );

  it.each(["action result", "thrown network error"] as const)(
    "does not deny a possible external transfer after a general-donation %s",
    async (failureMode) => {
      if (failureMode === "action result") {
        mockedSubmitDonation.mockResolvedValue({
          success: false,
          error: MISLEADING_TRANSFER_FAILURE,
        });
      } else {
        mockedSubmitDonation.mockRejectedValue(new Error("network down"));
      }

      renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

      const user = await fillRequiredDonorDetails();
      await user.click(submissionButton());

      await expectSafeTransferFailure("receipt");
      expect(
        screen.queryByText(/nothing has been charged/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/HFS-DON-/i)).not.toBeInTheDocument();
    },
  );

  it("records a target-pet checkout as a sponsorship pledge, never a donation", async () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.click(submissionButton());

    await waitFor(() =>
      expect(mockedCreateSponsorship).toHaveBeenCalledTimes(1),
    );
    expect(mockedCreateSponsorship).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: "pet-bella",
        petName: "Bella",
        sponsorName: "Aisyah Rahman",
        sponsorEmail: "aisyah@example.com",
        paymentMethod: "duitnow_qr",
        taxIdOrIc: undefined,
      }),
    );
    expect(mockedSubmitDonation).not.toHaveBeenCalled();
  });

  it("drops a withdrawn tax identifier from a target-pet pledge", async () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    const taxOptIn = screen.getByRole("checkbox", {
      name: /tax-exemption receipt|Section 44\(6\)/i,
    });
    const taxIdentifier = screen.getByLabelText(
      /NRIC|passport|SSM|Malaysian IC/i,
    );

    await user.click(taxOptIn);
    await user.type(taxIdentifier, "920512-10-5432");
    await user.click(taxOptIn);
    await user.click(submissionButton());

    await waitFor(() =>
      expect(mockedCreateSponsorship).toHaveBeenCalledTimes(1),
    );
    expect(mockedCreateSponsorship).toHaveBeenCalledWith(
      expect.objectContaining({ taxIdOrIc: undefined }),
    );
  });

  it("sends a target-pet tax identifier after the supporter opts in", async () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.click(
      screen.getByRole("checkbox", {
        name: /tax-exemption receipt|Section 44\(6\)/i,
      }),
    );
    await user.type(
      screen.getByLabelText(/NRIC|passport|SSM|Malaysian IC/i),
      "920512-10-5432",
    );
    await user.click(submissionButton());

    await waitFor(() =>
      expect(mockedCreateSponsorship).toHaveBeenCalledTimes(1),
    );
    expect(mockedCreateSponsorship).toHaveBeenCalledWith(
      expect.objectContaining({ taxIdOrIc: "920512-10-5432" }),
    );
  });

  it("clears a completed pledge and prior supporter PII after close and reopen", async () => {
    mockedCreateSponsorship.mockResolvedValue({
      success: true,
      data: sponsorshipPledge,
    });
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    const onOpenChange = vi.fn();
    const view = renderWithLanguage(
      <SponsorshipModal open onOpenChange={onOpenChange} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.type(screen.getByLabelText(/mobile phone/i), "012-345 6789");
    await user.click(
      screen.getByRole("checkbox", {
        name: /tax-exemption receipt|Section 44\(6\)/i,
      }),
    );
    await user.type(
      screen.getByLabelText(/NRIC|passport|SSM|Malaysian IC/i),
      "920512-10-5432",
    );
    await user.type(
      screen.getByLabelText(/message of encouragement/i),
      "Private donor note",
    );
    await user.click(submissionButton());
    expect(
      await screen.findByText("HFS-PLG-20260914-ABCD"),
    ).toBeInTheDocument();

    view.rerender(
      <SponsorshipModal
        open={false}
        onOpenChange={onOpenChange}
        targetPet={pet}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    view.rerender(
      <SponsorshipModal open onOpenChange={onOpenChange} targetPet={pet} />,
    );

    expect(await screen.findByLabelText(/full name/i)).toHaveValue("");
    expect(screen.getByLabelText(/email address/i)).toHaveValue("");
    expect(screen.getByLabelText(/mobile phone/i)).toHaveValue("");
    expect(
      screen.getByLabelText(/NRIC|passport|SSM|Malaysian IC/i),
    ).toHaveValue("");
    expect(screen.getByLabelText(/message of encouragement/i)).toHaveValue("");
    expect(screen.queryByText("HFS-PLG-20260914-ABCD")).not.toBeInTheDocument();
  });

  it("clears a completed pledge and prior supporter PII when the target pet changes", async () => {
    mockedCreateSponsorship.mockResolvedValue({
      success: true,
      data: sponsorshipPledge,
    });
    const bella = makePet({ id: "pet-bella", name: "Bella" });
    const tiger = makePet({ id: "pet-tiger", name: "Tiger" });
    const onOpenChange = vi.fn();
    const view = renderWithLanguage(
      <SponsorshipModal open onOpenChange={onOpenChange} targetPet={bella} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.type(screen.getByLabelText(/mobile phone/i), "012-345 6789");
    await user.click(submissionButton());
    expect(
      await screen.findByText("HFS-PLG-20260914-ABCD"),
    ).toBeInTheDocument();

    view.rerender(
      <SponsorshipModal open onOpenChange={onOpenChange} targetPet={tiger} />,
    );

    expect(await screen.findByLabelText(/full name/i)).toHaveValue("");
    expect(screen.getByLabelText(/email address/i)).toHaveValue("");
    expect(screen.getByLabelText(/mobile phone/i)).toHaveValue("");
    expect(screen.queryByText("HFS-PLG-20260914-ABCD")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /sponsor tiger's recovery/i }),
    ).toBeInTheDocument();
  });

  it("keeps a checkout without a target pet on the donation pledge path", async () => {
    mockedSubmitDonation.mockResolvedValue({
      success: true,
      data: donationPledge,
    });
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    const user = await fillRequiredDonorDetails();
    await user.click(submissionButton());

    expect(await screen.findByText("HFS-GFT-20260914-004242")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /donation pledge recorded/i,
      }),
    ).toBeInTheDocument();
    expect(mockedSubmitDonation).toHaveBeenCalledTimes(1);
    expect(mockedSubmitDonation).toHaveBeenCalledWith(
      expect.objectContaining({
        donorName: "Aisyah Rahman",
        donorEmail: "aisyah@example.com",
        wantsTaxReceipt: false,
        taxIdOrIc: undefined,
      }),
    );
    expect(mockedCreateSponsorship).not.toHaveBeenCalled();
    // The client receipt store holds receipts. A claim reference is not one, and
    // writing it there would rebuild the confusion this boundary removed.
    expect(saveDonationReceipt).not.toHaveBeenCalled();
  });

  it("blocks RM 5, then sends the exact RM 10 target-pet boundary", async () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const customAmount = screen.getByRole("spinbutton");
    const user = setupUser();
    await user.clear(customAmount);
    await user.type(customAmount, "5");

    expect(customAmount).toHaveAttribute("min", "10");
    expect(screen.getAllByText("RM 10.00").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(submissionButton());

    expect(mockedCreateSponsorship).not.toHaveBeenCalled();
    expect(mockedSubmitDonation).not.toHaveBeenCalled();

    await user.clear(customAmount);
    await user.type(customAmount, "10");
    await user.click(submissionButton());

    await waitFor(() =>
      expect(mockedCreateSponsorship).toHaveBeenCalledTimes(1),
    );
    expect(mockedCreateSponsorship).toHaveBeenCalledWith(
      expect.objectContaining({ amountMYR: 10 }),
    );
  });

  it("preserves RM 5 as a valid custom amount for a general donation", async () => {
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    const customAmount = screen.getByRole("spinbutton");
    const user = setupUser();
    await user.clear(customAmount);
    await user.type(customAmount, "5");
    await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(submissionButton());

    await waitFor(() => expect(mockedSubmitDonation).toHaveBeenCalledTimes(1));
    expect(customAmount).toHaveAttribute("min", "5");
    expect(mockedSubmitDonation).toHaveBeenCalledWith(
      expect.objectContaining({ amountMYR: 5 }),
    );
    expect(mockedCreateSponsorship).not.toHaveBeenCalled();
  });

  it("renders a pledge acknowledgement without inventing an issued receipt", async () => {
    mockedCreateSponsorship.mockResolvedValue({
      success: true,
      data: sponsorshipPledge,
    });
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.click(submissionButton());

    expect(
      await screen.findByText("HFS-PLG-20260914-ABCD"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /sponsorship pledge recorded/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HFS-DON-/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/receipt (?:was|has been) (?:issued|generated)/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/tax-exempt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Section 44\(6\)/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /print|save receipt/i }),
    ).not.toBeInTheDocument();
    expect(saveDonationReceipt).not.toHaveBeenCalled();
  });

  it("does not claim an acknowledgement email was delivered from ledger success alone", async () => {
    mockedCreateSponsorship.mockResolvedValue({
      success: true,
      data: sponsorshipPledge,
    });
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = await fillRequiredDonorDetails();
    await user.click(submissionButton());

    const acknowledgement = await screen.findByRole("status");
    expect(acknowledgement).toHaveTextContent(/sponsorship pledge recorded/i);
    expect(acknowledgement).not.toHaveTextContent(
      /emailed|email (?:was|has been) sent|sent (?:an? )?(?:acknowledgement )?(?:email|to)|delivered/i,
    );
  });

  it("issues no receipt number and claims no relief on a general gift", async () => {
    mockedSubmitDonation.mockResolvedValue({
      success: true,
      data: donationPledge,
    });
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    const user = await fillRequiredDonorDetails();
    await user.click(submissionButton());

    expect(await screen.findByText("HFS-GFT-20260914-004242")).toBeInTheDocument();
    // The boundary this screen now enforces: a supporter who has sent nothing sees
    // no HFS-DON number, no exemption reference, and no claim of relief.
    expect(screen.queryByText(/HFS-DON-\d{6}-\d{4}/)).toBeNull();
    expect(screen.queryByText(/tax-exempt/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("LHDN.01/35/42/51/179-6.4912"),
    ).not.toBeInTheDocument();
  });

  it("sends the tax identifier only after the donor opts in", async () => {
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    const user = await fillRequiredDonorDetails();
    const taxOptIn = screen.getByRole("checkbox", {
      name: /tax-exemption receipt|Section 44\(6\)/i,
    });
    const taxIdentifier = screen.getByLabelText(
      /NRIC|passport|SSM|Malaysian IC/i,
    );

    expect(taxOptIn).not.toBeChecked();
    expect(taxIdentifier).toBeDisabled();

    await user.click(taxOptIn);
    await user.type(taxIdentifier, "920512-10-5432");
    await user.click(submissionButton());

    await waitFor(() => expect(mockedSubmitDonation).toHaveBeenCalledTimes(1));
    expect(mockedSubmitDonation).toHaveBeenCalledWith(
      expect.objectContaining({
        wantsTaxReceipt: true,
        taxIdOrIc: "920512-10-5432",
      }),
    );
  });

  it("connects the tax opt-in to its consequential accessible description", () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: /tax-exemption receipt|Section 44\(6\)/i,
      }),
    ).toHaveAccessibleDescription(
      /requires your NRIC, passport or SSM number.*receipt is issued only after/i,
    );
  });

  it("renders actionable instructions for only the selected general-donation rail", async () => {
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    expect(screen.getByText(QR_INSTRUCTIONS)).toBeInTheDocument();
    expect(screen.queryByText(BANK_ACCOUNT_NUMBER)).not.toBeInTheDocument();

    const user = setupUser();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));

    expect(screen.queryByText(QR_INSTRUCTIONS)).not.toBeInTheDocument();
    expect(screen.getByText(BANK_ACCOUNT_NUMBER)).toBeInTheDocument();
  });

  it("withholds target-pet transfer instructions until the pledge reference exists", async () => {
    mockedCreateSponsorship.mockResolvedValue({
      success: true,
      data: { ...sponsorshipPledge, paymentMethod: "online_banking" },
    });
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    expect(screen.queryByText(QR_INSTRUCTIONS)).not.toBeInTheDocument();
    expect(screen.queryByText(BANK_ACCOUNT_NUMBER)).not.toBeInTheDocument();

    const user = setupUser();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));
    expect(screen.queryByText(BANK_ACCOUNT_NUMBER)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(submissionButton());

    const pledgeRef = await screen.findByText("HFS-PLG-20260914-ABCD");
    const bankAccount = screen.getByText(BANK_ACCOUNT_NUMBER);
    expect(screen.queryByText(QR_INSTRUCTIONS)).not.toBeInTheDocument();
    expectBefore(pledgeRef, bankAccount);
  });

  it("records an explicit bank-transfer choice as online banking", async () => {
    const pet = makePet({ id: "pet-bella", name: "Bella" });
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    const user = setupUser();
    expect(screen.getByRole("radio", { name: /DuitNow QR/i })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));
    await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(submissionButton());

    await waitFor(() =>
      expect(mockedCreateSponsorship).toHaveBeenCalledTimes(1),
    );
    expect(mockedCreateSponsorship).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "online_banking" }),
    );
    expect(mockedSubmitDonation).not.toHaveBeenCalled();
  });
});
