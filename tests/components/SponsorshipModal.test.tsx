import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));
vi.mock("@/actions/sponsorships", () => ({
  createPetSponsorshipAction: vi.fn(),
}));

import { submitDonationPledgeAction } from "@/actions/donations";
import { STORAGE_RECEIPTS_KEY } from "@/lib/client/sponsorshipStore";
import { createPetSponsorshipAction } from "@/actions/sponsorships";
import { SponsorshipModal } from "@/components/features/pets/SponsorshipModal";
import { makePet, renderWithLanguage, setupUser } from "./support/render";

/** What the client receipt store holds, as its own storage key has it. */
function storedReceipts(): unknown[] {
  return JSON.parse(localStorage.getItem(STORAGE_RECEIPTS_KEY) ?? "[]");
}

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
// No account is confirmed yet (#252), so the bank rail's instructions are the WhatsApp fallback:
// before the pledge, a note to record it first; after, the WhatsApp link with the reference.
const BANK_BEFORE_PLEDGE = /record your pledge first/i;
const BANK_INSTRUCTIONS = "Contact us on WhatsApp for transfer details.";
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

async function expectSafeTransferFailure(recordKind: "pledge" | "gift") {
  const message = await screen.findByText(
    new RegExp(
      recordKind === "pledge"
        ? "could not confirm that a pledge was recorded"
        : "could not confirm that your gift was recorded",
      "i",
    ),
  );
  // The shelter issues no receipts (#239), so the failure must not imply one was due.
  expect(message).not.toHaveTextContent(/receipt/i);

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

      await expectSafeTransferFailure("gift");
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
      }),
    );
    expect(mockedCreateSponsorship.mock.calls[0][0]).not.toHaveProperty("taxIdOrIc");
    expect(mockedSubmitDonation).not.toHaveBeenCalled();
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

  it("quotes the gift reference in the WhatsApp request on a bank-transfer gift", async () => {
    mockedSubmitDonation.mockResolvedValue({
      success: true,
      data: { ...donationPledge, paymentMethod: "online_banking" as const },
    });
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    const user = await fillRequiredDonorDetails();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));
    await user.click(submissionButton());

    expect(await screen.findByText("HFS-GFT-20260914-004242")).toBeInTheDocument();
    const whatsApp = screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href") ?? "";
    expect(decodeURIComponent(whatsApp)).toContain("pledge HFS-GFT-20260914-004242");
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
      }),
    );
    expect(mockedSubmitDonation.mock.calls[0][0]).not.toHaveProperty("taxIdOrIc");
    expect(mockedSubmitDonation.mock.calls[0][0]).not.toHaveProperty("wantsTaxReceipt");
    expect(mockedCreateSponsorship).not.toHaveBeenCalled();
    // The client receipt store holds receipts. A claim reference is not one, and
    // writing it there would rebuild the confusion this boundary removed. The modal
    // does not use the store today; this keeps it that way. It reads the store's own
    // storage key, so it fails whether the modal saves through `useSponsorshipStore`
    // or writes the key itself, and checks entries, because merely mounting the store
    // writes an empty list there.
    expect(storedReceipts()).toEqual([]);
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
    expect(storedReceipts()).toEqual([]);
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

  // The shelter is not a registered society and cannot issue a tax receipt (owner,
  // 2026-11-05; #239), so neither checkout path offers relief or asks for an NRIC.
  it.each([
    ["a target pet", makePet({ id: "pet-bella", name: "Bella" })],
    ["a general gift", undefined],
  ])("offers no relief opt-in and no identifier field for %s", (_label, pet) => {
    renderWithLanguage(
      <SponsorshipModal open onOpenChange={vi.fn()} targetPet={pet} />,
    );

    expect(screen.queryByRole("checkbox", { name: /tax/i })).toBeNull();
    expect(screen.queryByLabelText(/NRIC|passport|SSM|Malaysian IC/i)).toBeNull();
    expect(screen.queryByText(/Section 44\(6\)|tax-exemption/i)).toBeNull();
  });

  it("renders actionable instructions for only the selected general-donation rail", async () => {
    renderWithLanguage(<SponsorshipModal open onOpenChange={vi.fn()} />);

    expect(screen.getByText(QR_INSTRUCTIONS)).toBeInTheDocument();
    expect(screen.queryByText(BANK_BEFORE_PLEDGE)).not.toBeInTheDocument();

    const user = setupUser();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));

    expect(screen.queryByText(QR_INSTRUCTIONS)).not.toBeInTheDocument();
    expect(screen.getByText(BANK_BEFORE_PLEDGE)).toBeInTheDocument();
    // No WhatsApp request before there is a reference to quote in it.
    expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull();
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
    expect(screen.queryByText(BANK_INSTRUCTIONS)).not.toBeInTheDocument();

    const user = setupUser();
    await user.click(screen.getByRole("radio", { name: /bank transfer/i }));
    // No bank panel at all before the reference exists, and the hint says when it will appear.
    expect(screen.queryByText(BANK_BEFORE_PLEDGE)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull();
    expect(
      screen.getByText("How to transfer appears once your pledge is recorded."),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(submissionButton());

    const pledgeRef = await screen.findByText("HFS-PLG-20260914-ABCD");
    const bankAccount = screen.getByText(BANK_INSTRUCTIONS);
    expect(screen.queryByText(QR_INSTRUCTIONS)).not.toBeInTheDocument();
    expectBefore(pledgeRef, bankAccount);
    // The WhatsApp request carries the reference, so the coordinator can match the chat to it.
    const whatsApp = screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href") ?? "";
    expect(decodeURIComponent(whatsApp)).toContain("pledge HFS-PLG-20260914-ABCD");
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
