import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { BankTransferDetails } from "@/components/features/donations/BankTransferDetails";
import { SHELTER_WHATSAPP_DISPLAY, SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import { renderWithLanguage, setupUser } from "./support/render";

/**
 * The one place a bank account is printed (#252). Until the shelter confirms an account it shows
 * WhatsApp instead. Both states are rendered through the `account` prop, so these tests do not
 * change when the real constant is filled in.
 */
describe("BankTransferDetails", () => {
  it("asks for the pledge first, with no WhatsApp link, number, holder or copy button, before a reference exists", () => {
    renderWithLanguage(<BankTransferDetails account={null} />);

    expect(screen.getByText(/^record your pledge first/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/account holder/i)).toBeNull();
  });

  it("also says to choose bank transfer when it sits beside the other payment options", () => {
    renderWithLanguage(<BankTransferDetails account={null} besideOtherRails />);

    expect(screen.getByText(/^choose bank transfer as how you are paying/i)).toBeInTheDocument();
  });

  it("sends the donor to WhatsApp, with no number, holder or copy button, once a reference exists", () => {
    renderWithLanguage(<BankTransferDetails account={null} reference="HFS-GFT-20261106-000002" />);

    expect(screen.getByText("Contact us on WhatsApp for transfer details.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: `WhatsApp: ${SHELTER_WHATSAPP_DISPLAY}` });
    expect(link.getAttribute("href")?.startsWith(`${SHELTER_WHATSAPP_URL}?text=`)).toBe(true);
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/account holder/i)).toBeNull();
  });

  it("quotes the pledge reference in the WhatsApp request once there is one", () => {
    renderWithLanguage(<BankTransferDetails account={null} reference="HFS-PLG-20261106-ABCD" />);

    const href = screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain("pledge HFS-PLG-20261106-ABCD");
  });

  it("says so in Malay", () => {
    renderWithLanguage(
      <BankTransferDetails account={null} reference="HFS-GFT-20261106-000001" />,
      { language: "ms" },
    );

    expect(
      screen.getByText("Hubungi kami di WhatsApp untuk butiran pindahan."),
    ).toBeInTheDocument();
    const href = screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain("ikrar HFS-GFT-20261106-000001");
  });

  it("prints a confirmed account and copies only its digits", async () => {
    const user = setupUser();
    renderWithLanguage(
      <BankTransferDetails
        account={{
          bankName: "Example Bank Berhad",
          accountNumber: "1111-2222 3333",
          accountHolder: "Hope for Strays",
        }}
      />,
    );

    expect(screen.getByText("1111-2222 3333")).toBeInTheDocument();
    expect(screen.getByText("Hope for Strays")).toBeInTheDocument();
    expect(screen.getByText("Example Bank Berhad")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy bank account/i }));
    expect(await navigator.clipboard.readText()).toBe("111122223333");
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("does not say Copied! when the clipboard refuses the write", async () => {
    const user = setupUser();
    renderWithLanguage(
      <BankTransferDetails
        account={{ bankName: "Example Bank", accountNumber: "1111 2222 3333", accountHolder: "X" }}
      />,
    );
    // After setupUser, which installs its own clipboard on navigator.
    const refuse = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    try {
      await user.click(screen.getByRole("button", { name: /copy bank account/i }));
      await Promise.resolve();
      expect(refuse).toHaveBeenCalledWith("111122223333");
      expect(screen.queryByRole("button", { name: /copied/i })).toBeNull();
    } finally {
      refuse.mockRestore();
    }
  });
});
