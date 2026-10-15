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
 * at all. Submitting the form records a pending pledge, and the Section 44(6)
 * receipt is issued from the coordinator's queue once the transfer is matched. So
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
    /could not confirm that a receipt was issued/i,
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
 * The form displayed the tax identifier as required and the schema accepted its
 * absence, so a donor could be handed a receipt that announces itself as
 * tax-deductible while carrying nothing to deduct against.
 *
 * The checkbox is what reconciles the two. It gates the *identifier*, never the
 * gift: every gift is recorded, because the ledger is the shelter's record of
 * money received rather than of claims made. Since 2026-09-22 the identifier is
 * snapshotted onto the pending pledge and copied onto the receipt at
 * reconciliation, so what it gates here is what the eventual receipt can claim.
 */
describe("Section 44(6) relief is opt-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSubmit.mockResolvedValue({ success: false, error: "stubbed" });
  });

  it("still lets a donor give with only a name and an email", async () => {
    renderWidget();
    await submitAGift();

    // The regression this guards: defaulting the box to ticked would make the IC
    // field required and block every donor who could complete this form before.
    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({
      wantsTaxReceipt: false,
      taxIdOrIc: undefined,
    });
  });

  it("leaves the identifier field disabled until relief is asked for", async () => {
    renderWidget();
    expect(screen.getByLabelText(/Malaysian IC/i)).toBeDisabled();

    const user = setupUser();
    await user.click(
      screen.getByRole("checkbox", { name: /tax-exemption receipt/i }),
    );

    expect(screen.getByLabelText(/Malaysian IC/i)).toBeEnabled();
  });

  it("blocks the submission when relief is claimed with no identifier", async () => {
    renderWidget();
    const user = setupUser();

    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /tax-exemption receipt/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /complete donation pledge/i }),
    );

    // The required attribute stops it here; `donationPledgeSchema.superRefine` stops
    // it server-side for anything that bypasses the browser. Both exist on purpose.
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("sends the identifier once relief is claimed and it is supplied", async () => {
    renderWidget();
    const user = setupUser();

    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /tax-exemption receipt/i }),
    );
    await user.type(screen.getByLabelText(/Malaysian IC/i), "920512-10-5432");
    await user.click(
      screen.getByRole("button", { name: /complete donation pledge/i }),
    );

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({
      wantsTaxReceipt: true,
      taxIdOrIc: "920512-10-5432",
    });
  });

  it("claims no tax relief on the acknowledgement, whatever the donor ticked", async () => {
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

    // A document that announces itself as deductible while carrying nothing to
    // deduct against is the original defect. The pledge screen cannot have it: it
    // says outright that it is not a receipt, and prints no exemption reference.
    expect(await screen.findByText("HFS-GFT-20260922-000008")).toBeInTheDocument();
    expect(
      screen.getByText(/cannot be filed for a tax deduction/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tax-exempt e-Receipt/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/LHDN\.01\/35\/42\/51\/179-6\.4912/),
    ).not.toBeInTheDocument();
  });

  it("clears the opt-in when the donor starts another gift", async () => {
    mockedSubmit.mockResolvedValue({
      success: true,
      data: {
        pledgeRef: "HFS-GFT-20260922-000009",
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
    const user = setupUser();

    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /tax-exemption receipt/i }),
    );
    await user.type(screen.getByLabelText(/Malaysian IC/i), "920512-10-5432");
    await user.click(
      screen.getByRole("button", { name: /complete donation pledge/i }),
    );

    await screen.findByText("HFS-GFT-20260922-000009");
    await user.click(screen.getByRole("button", { name: /another donation/i }));

    // handleReset cleared taxIdOrIc but not the box, so the field came back required
    // and empty — blocking the next submission on something the donor never re-chose.
    expect(
      screen.getByRole("checkbox", { name: /tax-exemption receipt/i }),
    ).not.toBeChecked();
    expect(screen.getByLabelText(/Malaysian IC/i)).toBeDisabled();
  });

  it("drops an identifier the donor typed and then withdrew", async () => {
    renderWidget();
    const user = setupUser();

    await user.type(screen.getByLabelText(/donor full name/i), "Aisyah Rahman");
    await user.type(
      screen.getByLabelText(/email address/i),
      "aisyah@example.com",
    );
    const box = screen.getByRole("checkbox", {
      name: /tax-exemption receipt/i,
    });

    await user.click(box);
    await user.type(screen.getByLabelText(/Malaysian IC/i), "920512-10-5432");
    await user.click(box); // changed their mind

    await user.click(
      screen.getByRole("button", { name: /complete donation pledge/i }),
    );

    // A tax number the donor withdrew is not ours to keep, so it must not ride along
    // in the payload merely because the input still holds the text.
    expect(mockedSubmit).toHaveBeenCalledTimes(1);
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({
      wantsTaxReceipt: false,
      taxIdOrIc: undefined,
    });
  });
});

/**
 * The form publishes two ways to pay — a DuitNow QR and the shelter's Maybank
 * account — and until 2026-10-13 recorded `duitnow_qr` for both. The value is
 * copied onto the Section 44(6) receipt and shown to the coordinator as the rail
 * to match against the bank statement, so a bank-transfer donor's receipt and
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

  it("does not change the donor's answer when they copy the account number", async () => {
    // Copying is not paying. An earlier version flipped the rail on copy, which
    // overwrote an explicit choice with a guess and pointed the coordinator at the
    // wrong line of the statement for anyone who copied the number and then scanned.
    renderWidget();
    // `setupUser` installs its own clipboard on `navigator`, so the copy handler's
    // `navigator.clipboard` branch runs here as it does in a browser.
    const user = setupUser();

    await user.click(screen.getByRole("button", { name: /copy bank account/i }));

    expect(screen.getByRole("radio", { name: /duitnow qr/i })).toBeChecked();
    await submitAGift();
    expect(mockedSubmit.mock.calls[0][0]).toMatchObject({ paymentMethod: "duitnow_qr" });
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
