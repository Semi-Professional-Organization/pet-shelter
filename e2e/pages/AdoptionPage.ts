import type { Page, Locator } from "@playwright/test";

export interface AdoptionFormData {
  applicantName: string;
  email: string;
  phone: string;
  address: string;
  identification?: string;
  housingType?: string;
  vetClinic?: string;
}

/**
 * The public adoption journey: a pet profile and the application dialog it opens.
 *
 * Locators are role- and label-based throughout. The pages under test are
 * restyled often — the design-system work runs on the same branch — so anything
 * anchored to a class name would break on a change that no user could notice.
 */
export class AdoptionPage {
  constructor(private readonly page: Page) {}

  /** Opens a specific animal's profile directly. */
  async gotoPet(petId: string): Promise<void> {
    await this.page.goto(`/pets/${petId}`);
    await this.page.getByRole("tablist", { name: /pet profile tabs/i }).waitFor();
  }

  /** Opens the public catalogue. */
  async gotoCatalogue(): Promise<void> {
    await this.page.goto("/pets");
    await this.page.getByRole("heading", { level: 1, name: /meet our animals/i }).waitFor();
  }

  searchBox(): Locator {
    return this.page.getByPlaceholder(/search by name, breed/i);
  }

  /** Narrows the catalogue by free text and waits for the grid to settle. */
  async search(term: string): Promise<void> {
    await this.searchBox().fill(term);
  }

  heading(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }

  tab(name: RegExp): Locator {
    return this.page.getByRole("tab", { name });
  }

  /** Opens the adoption application dialog from a pet profile. */
  async openApplication(): Promise<void> {
    await this.page.getByRole("button", { name: /apply to adopt/i }).first().click();
    await this.page.getByRole("dialog").waitFor();
  }

  dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  /** Advances to the next step in the multi-step wizard. */
  async nextStep(): Promise<void> {
    await this.dialog().getByRole("button", { name: /next/i }).click();
  }

  /** Steps back to the previous step in the multi-step wizard. */
  async previousStep(): Promise<void> {
    await this.dialog().getByRole("button", { name: /back/i }).click();
  }

  /** Fills Step 1: Contact & Identification. */
  async fillContactStep(data: AdoptionFormData): Promise<void> {
    const dialog = this.dialog();
    await dialog.getByLabel(/full name/i).fill(data.applicantName);
    await dialog.getByLabel(/email address/i).fill(data.email);
    await dialog.getByLabel(/contact phone number/i).fill(data.phone);
    await dialog.getByLabel(/nric or passport number/i).fill(data.identification ?? "880101-14-5678");
    await dialog.getByLabel(/residential address/i).fill(data.address);
  }

  /** Fills Step 2: Living Environment. Defaults are pre-selected. */
  async fillLivingStep(housingType?: string): Promise<void> {
    const housingSelect = this.dialog().getByLabel(/housing & accommodation type/i);
    await housingSelect.waitFor();
    if (housingType) {
      await housingSelect.selectOption(housingType);
    }
  }

  /** Fills Step 3: Experience & Care Plan. */
  async fillCareStep(vetClinic = "Klinik Haiwan SS2, Petaling Jaya"): Promise<void> {
    const vetInput = this.dialog().getByLabel(/preferred veterinary clinic/i);
    await vetInput.waitFor();
    await vetInput.fill(vetClinic);
  }

  /** Fills Step 4: Agrees to terms and home visit check. */
  async acceptAgreements(): Promise<void> {
    const dialog = this.dialog();
    const terms = dialog.getByLabel(/shelter adoption terms/i);
    await terms.waitFor();
    await terms.check();
    await dialog.getByLabel(/home check/i).check();
  }

  /**
   * Completes all 4 steps of the adoption wizard.
   */
  async fillApplication(data: AdoptionFormData): Promise<void> {
    // Step 1: Contact
    await this.fillContactStep(data);
    await this.nextStep();

    // Step 2: Living Environment
    await this.fillLivingStep(data.housingType);
    await this.nextStep();

    // Step 3: Care Plan
    await this.fillCareStep(data.vetClinic);
    await this.nextStep();

    // Step 4: Agreement
    await this.acceptAgreements();
  }

  /**
   * Submits the adoption application on Step 4. If called on an earlier step,
   * falls back to clicking Next to trigger step-level validation.
   */
  async submitApplication(): Promise<void> {
    const submitBtn = this.dialog().getByRole("button", { name: /submit/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      await this.nextStep();
    }
  }

  /** The post-submission confirmation panel. */
  confirmation(): Locator {
    return this.page.getByText(/application submitted/i);
  }

  /** The sponsorship deep link on the support tab. */
  sponsorLink(petName: string): Locator {
    return this.page.getByRole("link", { name: new RegExp(`sponsor ${petName} today`, "i") });
  }
}
