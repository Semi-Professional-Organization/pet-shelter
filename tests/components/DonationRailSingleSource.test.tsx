import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/actions/donations", () => ({ submitDonationPledgeAction: vi.fn() }));
vi.mock("@/actions/pets", () => ({
  getPublicPets: vi.fn().mockResolvedValue([]),
}));

// A shelter that has uploaded all three codes. Left to itself the QR panel would
// render a DuitNow / Touch 'n Go / Bank Transfer switcher for this config.
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
import { setMockLocation } from "../setup/nextMocks";
import { renderWithLanguage, makePet } from "./support/render";

/**
 * One place to say how you paid.
 *
 * The QR panel's channel switcher is a second selector the submitted payload
 * cannot see. An earlier fix tried to keep the two in step by moving the rail
 * question whenever a tab was clicked; a review showed that could not hold — the
 * sync was one-way and click-only, so a form reset or a channel removed by an
 * admin left them disagreeing, browsing a tab overwrote an explicit answer, and a
 * Touch 'n Go payment had no value to be recorded as anyway.
 *
 * So `/donate` does what the sponsorship modal already did: it gives the panel no
 * other channels, and the question is the single source of truth.
 */
describe("the donate form has one rail selector", () => {
  beforeEach(() => {
    setMockLocation("/donate", "");
    renderWithLanguage(
      <DonationWidget initialPets={[makePet({ id: "pet-001", name: "Bella" })]} />
    );
  });

  it("renders no channel switcher, even with every QR code configured", () => {
    expect(screen.queryByRole("tab", { name: /touch 'n go/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /bank transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("still asks the question, with both rails the payload can record", () => {
    const rail = within(screen.getByRole("group", { name: /how are you paying/i }));

    expect(rail.getByRole("radio", { name: /duitnow qr/i })).toBeChecked();
    expect(rail.getByRole("radio", { name: /direct bank transfer/i })).not.toBeChecked();
  });
});
