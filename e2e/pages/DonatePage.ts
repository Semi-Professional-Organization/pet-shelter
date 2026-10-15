import type { Page, Locator } from "@playwright/test";

export interface DonorDetails {
  name: string;
  email: string;
  phone?: string;
  taxIdOrIc?: string;
}

/**
 * The pledge journey on `/donate`, through to its acknowledgement.
 *
 * There is no receipt at the end of this page any more: a general gift is
 * recorded as pending and its LHDN receipt is issued from `/admin/donations`
 * once a coordinator confirms the transfer.
 */
export class DonatePage {
  constructor(private readonly page: Page) {}

  /** Opens the page, optionally as a deep link from a pet profile. */
  async goto(query = ""): Promise<void> {
    await this.page.goto(`/donate${query ? `?${query}` : ""}`);
    await this.carousel().waitFor();
  }

  carousel(): Locator {
    return this.page.getByRole("region", { name: /pet selection carousel/i });
  }

  /** Dedicates the pledge to one animal via the carousel. */
  async dedicateTo(petName: string): Promise<void> {
    await this.carousel().getByRole("button", { name: new RegExp(petName, "i") }).first().click();
  }

  async chooseGeneralFund(): Promise<void> {
    await this.carousel().getByRole("button", { name: /general sanctuary fund/i }).click();
  }

  async chooseFrequency(frequency: "one_time" | "monthly"): Promise<void> {
    const name = frequency === "monthly" ? /monthly rescue hero/i : /one-time gift/i;
    await this.page.getByRole("button", { name }).click();
  }

  /**
   * Selects a sponsorship tier by its catalogue name.
   *
   * By name rather than by amount: each tier card renders its price, its badge
   * and its impact copy inside one button, so a "RM 120" filter also matches any
   * card whose description happens to mention that figure.
   */
  async chooseTier(tierName: RegExp): Promise<void> {
    await this.page.getByRole("button").filter({ hasText: tierName }).first().click();
  }

  async fillDonor(details: DonorDetails): Promise<void> {
    await this.page.getByLabel(/full name/i).first().fill(details.name);
    await this.page.getByLabel(/email/i).first().fill(details.email);
    if (details.phone) await this.page.getByPlaceholder("012-345 6789").fill(details.phone);
    if (details.taxIdOrIc) {
      // The identifier field is disabled until the donor asks for Section 44(6)
      // relief, and Playwright's `fill()` waits for an enabled element — so without
      // this click the step does not fail, it hangs until the test times out.
      await this.page.locator("#widgetWantsTaxReceipt").check();
      await this.page.getByPlaceholder(/920512-10-5432/).fill(details.taxIdOrIc);
    }
  }

  /** The running total the widget shows beside the tier grid. */
  selectedAmount(): Locator {
    return this.page.getByText(/^RM \d+\.00/).first();
  }

  async submitPledge(): Promise<void> {
    await this.page
      .getByRole("button", { name: /confirm|pledge|sponsor now|complete/i })
      .first()
      .click();
  }

  /** The reference a donor quotes on their transfer. Not a receipt number. */
  pledgeReference(): Locator {
    return this.page.getByText(/HFS-GFT-\d{8}-\d{6}/).first();
  }

  taxReference(): Locator {
    return this.page.getByText(/LHDN\.\d|44\(6\)/i).first();
  }
}
