import { test, expect } from "@playwright/test";
import { DonatePage } from "../pages/DonatePage";
import { AdoptionPage } from "../pages/AdoptionPage";

/**
 * Golden path 2 — sponsoring a rescue, through to the pledge acknowledgement.
 *
 * The receipt is not a nicety: as a registered Malaysian NGO the shelter issues
 * donors a Subsection 44(6) tax-exempt document, and a donor who does not get
 * one cannot claim the deduction. Which is exactly why it must not be issued
 * here. Until 2026-09-22 this path ended on an official `HFS-DON-*` e-receipt
 * the moment the form was submitted, before anyone had seen a bank statement;
 * this spec used to assert that, and so pinned the defect. The receipt is now
 * drawn when a coordinator confirms the transfer, and what this walks is the
 * chain up to that boundary — the deep link a pet profile emits, the tier
 * choice, the pledge, and an acknowledgement that is plainly not a receipt.
 */
test.describe("rescue sponsorship", () => {
  test("carries an animal from its profile into the donation form", async ({ page }) => {
    const adoption = new AdoptionPage(page);
    await adoption.gotoPet("pet-001");
    await adoption.tab(/support/i).click();

    await adoption.sponsorLink("Bella").click();

    // The handoff `PetDetailView` builds and `DonationWidget` consumes.
    await expect(page).toHaveURL(/\/donate\?.*sponsorPetId=pet-001/);
    await expect(page.getByText(/Rescue Companion & Updates/).first()).toContainText("Bella");
  });

  test("prices each sponsorship tier", async ({ page }) => {
    const donate = new DonatePage(page);
    await donate.goto();

    await expect(donate.selectedAmount()).toHaveText(/RM 50\.00/);

    await donate.chooseTier(/Spay \/ Neuter Surgery Sponsorship/);
    await expect(donate.selectedAmount()).toHaveText(/RM 120\.00/);
  });

  test("switches between one-time and monthly giving", async ({ page }) => {
    const donate = new DonatePage(page);
    await donate.goto();

    await donate.chooseFrequency("monthly");

    await expect(donate.selectedAmount()).toHaveText(/\/ mo/);
  });

  test("dedicates a pledge to a specific animal", async ({ page }) => {
    const donate = new DonatePage(page);
    await donate.goto();

    // Monthly first: the companion card that names the dedicated animal is only
    // rendered for monthly giving or the kibble tier, so on the default
    // one-time/vaccination pairing there is nothing on screen to assert against.
    await donate.chooseFrequency("monthly");
    await donate.dedicateTo("Bella");

    await expect(page.getByText(/Rescue Companion & Updates/).first()).toContainText("Bella");
  });

  test("records a pledge and issues no receipt before the transfer is confirmed", async ({ page }) => {
    const donate = new DonatePage(page);
    await donate.goto("sponsorPetId=pet-001&tier=kibble");

    await donate.fillDonor({
      name: "E2E Golden Path Donor",
      email: "e2e-donor@example.test",
      phone: "012-345 6789",
      taxIdOrIc: "920512-10-5432",
    });
    await page.getByRole("button", { name: /complete donation pledge/i }).click();

    await expect(page.getByText(/your donation pledge has been recorded/i)).toBeVisible();

    // What the donor leaves with: a claim reference to quote on the transfer,
    // and their own name against it.
    await expect(page.getByText(/HFS-GFT-\d{8}-\d{6}/).first()).toBeVisible();
    await expect(page.getByText(/E2E Golden Path Donor/).first()).toBeVisible();
    await expect(page.getByText(/this is not a receipt/i)).toBeVisible();

    // And what they must not leave with. A supporter who has sent nothing yet
    // holding a numbered Section 44(6) document was the defect.
    await expect(page.getByText(/HFS-DON-/)).toHaveCount(0);
    // Exact text: the badge of the printable dossier that used to render here.
    // The page's FAQ still, correctly, says an e-Receipt is emailed later.
    await expect(page.getByText(/^official e-receipt$/i)).toHaveCount(0);
    await expect(page.getByText(/instantly on-screen/i)).toHaveCount(0);
  });
});
