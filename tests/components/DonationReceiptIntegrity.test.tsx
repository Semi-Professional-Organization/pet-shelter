import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));
vi.mock("@/actions/pets", () => ({
  getPublicPets: vi.fn().mockResolvedValue([]),
}));

import { DonationWidget } from "@/components/features/donations/DonationWidget";
import { submitDonationPledgeAction } from "@/actions/donations";
import { setMockLocation } from "../setup/nextMocks";
import { renderWithLanguage, setupUser, makePet } from "./support/render";

/**
 * A receipt number is allocated by `issueDonationReceipt` inside the same
 * transaction that writes the `Donation` row — that is what makes the series
 * gapless and what lets the LHDN export reconcile against the ledger.
 *
 * The widget used to answer a failed submission by minting its own
 * `HFS-DON-<month>-<random 4 digits>` in the browser and rendering it on the
 * printable receipt. The donor would then hold a tax document for a gift the
 * shelter has no record of, carrying a number that may already belong to a real
 * receipt. These tests exist so that fallback cannot come back.
 *
 * Since 2026-09-22 the guard is stronger still: this screen has no receipt on it
 * at all. Submitting the form records a pending pledge, and the acknowledgement
 * is issued from the coordinator's queue once the transfer is matched. So
 * `RECEIPT_NUMBER` must not appear here on *any* path, success included.
 */
const RECEIPT_NUMBER = /HFS-DON-\d{6}-\d{4}/;

const mockedSubmit = vi.mocked(submitDonationPledgeAction);

function renderWidget() {
  setMockLocation("/donate", "");
  return renderWithLanguage(
    <DonationWidget
      initialPets={[makePet({ id: "pet-001", name: "Bella" })]}
    />,
  );
}

async function submitAGift() {
  const user = setupUser();
  await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
  await user.type(
    screen.getByLabelText(/email address/i),
    "aisyah@example.com",
  );
  await user.click(
    screen.getByRole("button", { name: /complete donation pledge/i }),
  );
}

async function expectSafeExternalTransferFailure() {
  const message = await screen.findByText(
    /could not confirm that your gift was recorded/i,
  );

  expect(message).not.toHaveTextContent(/nothing has been charged/i);
  expect(message).toHaveTextContent(/contact the shelter/i);
  expect(message).toHaveTextContent(/bank reference/i);
  expect(message).toHaveTextContent(
    /before (?:trying|you try|retrying) again/i,
  );
}

describe("the browser never invents a receipt number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces an unsafe server error with unconfirmed receipt guidance", async () => {
    mockedSubmit.mockResolvedValue({
      success: false,
      error:
        "We could not record your donation just now, so no receipt was issued. Nothing has been charged - please try again in a moment.",
    });

    renderWidget();
    await submitAGift();

    await expectSafeExternalTransferFailure();
    expect(
      screen.queryByText(/nothing has been charged/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(RECEIPT_NUMBER)).toBeNull();
  });

  it("does not claim a receipt outcome when the action throws outright", async () => {
    mockedSubmit.mockRejectedValue(new Error("network down"));

    renderWidget();
    await submitAGift();

    await expectSafeExternalTransferFailure();
    expect(
      screen.queryByText(/nothing has been charged/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(RECEIPT_NUMBER)).toBeNull();
  });

  it("renders the pledge reference the ledger recorded, and no receipt", async () => {
    mockedSubmit.mockResolvedValue({
      success: true,
      data: {
        pledgeRef: "HFS-GFT-20260922-123456",
        donorName: "Aisyah Rahman",
        donorEmail: "aisyah@example.com",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 50,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        status: "PENDING_PAYMENT",
        reconciliationNotice:
          "Your official receipt is issued once our coordinator matches your transfer against the shelter bank statement.",
      },
    });

    renderWidget();
    await submitAGift();

    expect(await screen.findByText("HFS-GFT-20260922-123456")).toBeInTheDocument();
    // The boundary, asserted on the success path: a donor who has sent nothing yet
    // must not be looking at a receipt number.
    expect(screen.queryByText(RECEIPT_NUMBER)).toBeNull();
    expect(screen.getByText(/not a receipt/i)).toBeInTheDocument();
  });
});

/**
 * The shelter is not a registered society and cannot issue a tax receipt (owner,
 * 2026-11-05; #239). Until then this form had a Section 44(6) opt-in and an NRIC
 * field; both are gone, so a gift is a name, an email and an amount.
 */
describe("the form asks for no tax identifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
  });

  it("offers no relief opt-in and no identifier field", () => {
    renderWidget();

    expect(screen.queryByRole("checkbox", { name: /tax/i })).toBeNull();
    expect(screen.queryByLabelText(/\bIC\b|passport|SSM/i)).toBeNull();
    expect(document.body).not.toHaveTextContent(/44\s*\(6\)|tax-exemption/i);
  });

  it("lets a donor give with only a name and an email, sending no tax fields", async () => {
    renderWidget();
    await submitAGift();

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    const payload = mockedSubmit.mock.calls[0][0];
    expect(payload).not.toHaveProperty("taxIdOrIc");
    expect(payload).not.toHaveProperty("wantsTaxReceipt");
  });

  // #50 §2: each label carried its own "*" and the widget rendered a second one.
  it("marks each required donor field once", () => {
    renderWidget();

    for (const id of ["widgetDonorName", "widgetDonorEmail"]) {
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label?.textContent?.match(/\*/g) ?? []).toHaveLength(1);
    }
  });

  it("claims no tax relief on the pledge screen", async () => {
    mockedSubmit.mockResolvedValue({
      success: true,
      data: {
        pledgeRef: "HFS-GFT-20260922-000008",
        donorName: "Aisyah Rahman",
        donorEmail: "aisyah@example.com",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 50,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        status: "PENDING_PAYMENT",
        reconciliationNotice:
          "Your official receipt is issued once our coordinator matches your transfer.",
      },
    });

    renderWidget();
    await submitAGift();

    // The shelter is not a registered society: the screen says outright that it is
    // not a tax receipt, and names no statutory section or exemption reference.
    expect(await screen.findByText("HFS-GFT-20260922-000008")).toBeInTheDocument();
    expect(
      screen.getByText(/cannot be filed for a tax deduction/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tax-exempt e-Receipt/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/44\s*\(6\)/);
    expect(
      screen.queryByText(/LHDN\.01\/35\/42\/51\/179-6\.4912/),
    ).not.toBeInTheDocument();
  });
});

/**
 * The form publishes two ways to pay — a DuitNow QR and a bank transfer —
 * and until 2026-10-13 recorded `duitnow_qr` for both. The value is
 * copied onto the acknowledgement and shown to the coordinator as the rail
 * to match against the bank statement, so a bank-transfer donor's record and
 * queue row both named the wrong one.
 */
describe("the donor says which rail they used", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
  });

  it("records DuitNow QR when the donor changes nothing", async () => {
    renderWidget();
    await submitAGift();

    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ paymentMethod: "duitnow_qr" });
  });

  it("records a bank transfer when the donor selects it", async () => {
    renderWidget();
    const user = setupUser();
    await user.click(screen.getByRole("radio", { name: /direct bank transfer/i }));
    await submitAGift();

    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ paymentMethod: "online_banking" });
  });

  it("offers no account number to copy while the shelter has not confirmed one", () => {
    // Until 2026-11-05 the form printed a made-up Maybank number with a copy button (#252).
    renderWidget();

    expect(screen.queryByRole("button", { name: /copy bank account/i })).toBeNull();
    expect(screen.getByText(/contact us on whatsapp for transfer details/i)).toBeInTheDocument();
  });

  it("offers the choice as one native radio group", () => {
    renderWidget();
    // Scoped to this question: the form has another radio group further up.
    const radios = within(
      screen.getByRole("group", { name: /how are you paying/i }),
    ).getAllByRole("radio");

    // Native inputs sharing a name: the platform supplies the single tab stop and
    // the arrow keys, which a pair of `role="radio"` buttons did not.
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.tagName).toBe("INPUT");
      expect(radio).toHaveAttribute("name", "donationPaymentMethod");
    }
  });

  it("shows which rail is selected, and only one at a time", async () => {
    renderWidget();
    const user = setupUser();
    const qr = screen.getByRole("radio", { name: /duitnow qr/i });
    const bank = screen.getByRole("radio", { name: /direct bank transfer/i });

    expect(qr).toBeChecked();
    expect(bank).not.toBeChecked();

    await user.click(bank);

    expect(bank).toBeChecked();
    expect(qr).not.toBeChecked();
  });
});
