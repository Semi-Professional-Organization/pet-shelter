import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithLanguage, setupUser } from "./support/render";

vi.mock("@/actions/sponsors", () => ({
  registerSponsorAction: vi.fn(),
  sponsorLoginAction: vi.fn(),
}));

import { UpgradeNudge } from "@/components/features/sponsors/UpgradeNudge";
import { SponsorAuthForm } from "@/components/features/sponsors/SponsorAuthForm";

/**
 * Two things the sponsor portal offered that the person it offered them to could not use.
 *
 * A sponsor's standing is derived from pet sponsorships alone (`getSponsorContext`), and
 * claiming a portal accepts only a pet sponsorship's receipt. But "Become a Silver sponsor"
 * led to the general-gift form, which can never raise a standing, and "Donated but have no
 * account yet? Claim your portal" invited every donor, though a general gift's receipt is
 * always refused. Each case fails against the copy and link before 2026-10-19.
 */
describe("sponsor portal offers", () => {
  it("sends 'Become a sponsor' to the rescues, where a sponsorship starts", () => {
    renderWithLanguage(<UpgradeNudge requiredTier="SILVER" currentTier="BRONZE" />);

    expect(screen.getByRole("link", { name: /Become a Silver sponsor/i })).toHaveAttribute("href", "/pets");
  });

  it("offers the portal claim to people who sponsored a rescue, not to every donor", async () => {
    renderWithLanguage(<SponsorAuthForm />);

    expect(screen.getByText(/Sponsored a rescue but have no account yet\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Donated but have no account yet/)).toBeNull();

    await setupUser().click(screen.getByRole("button", { name: /Claim your portal/i }));

    expect(screen.getByText(/receipt number from that sponsorship's e-Receipt/)).toBeInTheDocument();
  });
});
