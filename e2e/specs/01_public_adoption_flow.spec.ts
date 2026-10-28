import { test, expect } from "@playwright/test";
import { AdoptionPage } from "../pages/AdoptionPage";

/**
 * Golden path 1 — a member of the public adopts.
 *
 * Browse the catalogue, open an animal, apply, and be told the application
 * landed. This is the journey the shelter exists to serve; nothing here is
 * mocked, so a break anywhere between the route and the Server Action fails.
 */
test.describe("public adoption", () => {
  test("browses and filters the catalogue", async ({ page }) => {
    const adoption = new AdoptionPage(page);
    await adoption.gotoCatalogue();

    await expect(page.getByRole("heading", { level: 1, name: /meet our animals/i })).toBeVisible();

    await adoption.search("Bella");
    await expect(page.getByText(/bella/i).first()).toBeVisible();
  });

  test("opens an animal profile with its four tabs", async ({ page }) => {
    const adoption = new AdoptionPage(page);
    await adoption.gotoPet("pet-001");

    await expect(adoption.heading()).toHaveText(/bella/i);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expect(adoption.tab(/about me/i)).toHaveAttribute("aria-selected", "true");
  });

  test("submits an application and confirms it was received", async ({ page }) => {
    const adoption = new AdoptionPage(page);
    await adoption.gotoPet("pet-001");

    await adoption.openApplication();
    await adoption.fillApplication({
      // Marked so a row left behind in the shared development database is
      // obviously machine-generated rather than a real applicant.
      applicantName: "E2E Golden Path Applicant",
      email: "e2e-adoption@example.test",
      phone: "012-345 6789",
      address: "No. 24, Jalan SS 2/10, 47300 Petaling Jaya, Selangor",
    });
    await adoption.submitApplication();

    await expect(adoption.confirmation()).toBeVisible();
    await expect(page.getByText(/E2E Golden Path Applicant/)).toBeVisible();
  });

  test("refuses an incomplete application", async ({ page }) => {
    const adoption = new AdoptionPage(page);
    await adoption.gotoPet("pet-001");
    await adoption.openApplication();

    await adoption.nextStep();

    await expect(adoption.dialog().getByText(/enter your full name/i)).toBeVisible();
    await expect(adoption.confirmation()).toBeHidden();
  });
});
