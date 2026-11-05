import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { BankTransferDetails } from "@/components/features/donations/BankTransferDetails";
import { SHELTER_WHATSAPP_DISPLAY, SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import { renderWithLanguage, setupUser } from "./support/render";

/**
 * The one place a bank account is printed (#252). Until the shelter confirms an account it shows
 * WhatsApp instead; the confirmed state is rendered through the `account` prop, since the real
 * constant is still `null`.
 */
describe("BankTransferDetails", () => {
  it("sends the donor to WhatsApp, with no number, holder or copy button, while no account is confirmed", () => {
    renderWithLanguage(<BankTransferDetails />);

    expect(screen.getByText("Contact us on WhatsApp for transfer details.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: `WhatsApp: ${SHELTER_WHATSAPP_DISPLAY}` });
    expect(link.getAttribute("href")).toMatch(new RegExp(`^${SHELTER_WHATSAPP_URL}\\?text=`));
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.queryByText(/account holder/i)).toBeNull();
  });

  it("says so in Malay", () => {
    renderWithLanguage(<BankTransferDetails />, { language: "ms" });

    expect(
      screen.getByText("Hubungi kami di WhatsApp untuk butiran pindahan."),
    ).toBeInTheDocument();
  });

  it("prints a confirmed account and copies its digits without spaces", async () => {
    const user = setupUser();
    renderWithLanguage(
      <BankTransferDetails
        account={{
          bankName: "Example Bank Berhad",
          accountNumber: "1111 2222 3333",
          accountHolder: "Hope for Strays",
        }}
      />,
    );

    expect(screen.getByText("1111 2222 3333")).toBeInTheDocument();
    expect(screen.getByText("Hope for Strays")).toBeInTheDocument();
    expect(screen.getByText("Example Bank Berhad")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy bank account/i }));
    expect(await navigator.clipboard.readText()).toBe("111122223333");
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });
});
