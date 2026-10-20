import { describe, it, expect, vi, afterEach } from "vitest";
import {
  sendApplicationConfirmationEmail,
  sendStaffApplicationAlert,
  sendDonationReceiptEmail,
} from "@/lib/email";
import { AdoptionApplicationRecord } from "@/types/application";
import { DonationReceipt } from "@/types/sponsorship";
import { ApplicationStatus } from "@/types/application";
import { sendApplicationStatusUpdateEmail } from "@/lib/email";
import {
  DESIGN_TONES,
  EMAIL_BRAND,
  EMAIL_RECEIPT,
  EMAIL_TONE,
} from "@/lib/presentation/emailTokens";
import { getApplicationStatusPresentation } from "@/lib/presentation/applicationStatusPresentation";

// Restores every `fetch` spy whether or not the test passed. `RESEND_API_KEY` stubs are undone by
// the config's `unstubEnvs`.
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Puts the mailer on its live path: a Resend key is configured, and `fetch` answers every call as
 * an accepted send, so nothing can reach api.resend.com.
 *
 * `vi.spyOn` hands back the existing spy when `fetch` already is one, so `mockClear()` gives each
 * arming its own call record: one test may render several emails and must count each send alone.
 */
function stubResendAccepts() {
  vi.stubEnv("RESEND_API_KEY", "test_key");
  return vi
    .spyOn(globalThis, "fetch")
    .mockClear()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-msg-test" }),
    } as unknown as Response);
}

describe("Transactional Email Service", () => {
  const sampleApplication: AdoptionApplicationRecord = {
    id: "app-test-999",
    petId: "pet-001",
    petName: "Kopi",
    applicantName: "Tan Ah Kow",
    email: "tahkow@example.com",
    phone: "012-3456789",
    address: "123 Jalan SS2, Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    applicantNotes: "Very excited to adopt Kopi!",
    status: "SUBMITTED",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  };

  it("dispatches adopter confirmation email in simulation mode when RESEND_API_KEY is unset", async () => {
    // The mailer tests the key for truthiness, so an empty string is unset.
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendApplicationConfirmationEmail(sampleApplication);
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.messageId).toContain("sim-");
  });

  it("dispatches shelter staff alert email in simulation mode when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendStaffApplicationAlert(sampleApplication);
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.messageId).toContain("sim-");
  });

  it("handles network failure gracefully without crashing or throwing", async () => {
    // A configured key, and a network that rejects every request.
    vi.stubEnv("RESEND_API_KEY", "test_key");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network connection reset"));

    const result = await sendApplicationConfirmationEmail(sampleApplication);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network connection reset");
  });
});

describe("Sec 44(6) donation receipt — the two halves must agree", () => {
  const baseReceipt: DonationReceipt = {
    receiptNumber: "HFS-DON-202608-4821",
    date: "28 Aug 2026, 10:15 AM",
    donorName: "Siti Nurhaliza",
    donorEmail: "siti@example.com",
    donorPhone: "012-345 6789",
    tierId: "vaccine",
    tierName: "Core Vaccination & Deworming",
    amountMYR: 250,
    frequency: "one_time",
    paymentMethod: "duitnow_qr",
    targetPetName: "Luna",
    taxIdOrIc: "910101-10-1234",
    notes: "In loving memory of Bubbles",
    taxDeductibleRef: "LHDN.01/35/42/51/179-6.9999",
    shelterRegistrationNo: "PPM-001-10-99999999",
  };

  /**
   * The receipt is only observable on the wire: sendDonationReceiptEmail returns a dispatch result,
   * not a body. Drive the live path with a stubbed key and read both halves off the Resend payload.
   */
  async function renderReceipt(
    overrides: Partial<DonationReceipt> = {}
  ): Promise<{ subject: string; text: string; html: string }> {
    const fetchSpy = stubResendAccepts();

    const result = await sendDonationReceiptEmail({ ...baseReceipt, ...overrides });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const init = fetchSpy.mock.calls[0][1];
    return JSON.parse(String(init?.body));
  }

  const RAIL_CASES: Array<{ method: DonationReceipt["paymentMethod"]; label: string }> = [
    { method: "duitnow_qr", label: "DuitNow QR (PayNet)" },
    { method: "online_banking", label: "Direct Bank Transfer" },
    { method: "card", label: "Credit / Debit Card" },
  ];

  // The defect this closes: a card donation was receipted as "Direct Bank Transfer" in the HTML
  // half while the plain-text half of the same email said "Credit / Debit Card". Asserting the
  // absence of the other two labels is what makes a silent fallback impossible to reintroduce.
  it.each(RAIL_CASES)(
    "receipts a $method donation as \"$label\" in BOTH halves, and as nothing else",
    async ({ method, label }) => {
      const mail = await renderReceipt({ paymentMethod: method });
      const otherLabels = RAIL_CASES.filter((c) => c.method !== method).map((c) => c.label);

      for (const [half, body] of [["text", mail.text], ["html", mail.html]] as const) {
        expect(body, `${half} half should state ${label}`).toContain(label);
        for (const other of otherLabels) {
          expect(body, `${half} half must not state ${other}`).not.toContain(other);
        }
      }
    }
  );

  it("echoes the donor's own message in the HTML half, not only the plain text", async () => {
    const mail = await renderReceipt({ notes: "In memory of Bubbles, our first rescue" });

    expect(mail.text).toContain('- Donor Message: "In memory of Bubbles, our first rescue"');
    expect(mail.html).toContain("Donor Message:");
    expect(mail.html).toContain("In memory of Bubbles, our first rescue");
  });

  it("omits the donor-message row from both halves when no message was left", async () => {
    const mail = await renderReceipt({ notes: undefined });

    expect(mail.text).not.toContain("Donor Message");
    expect(mail.html).not.toContain("Donor Message");
  });

  it("escapes donor-supplied markup before placing it in the HTML body", async () => {
    const mail = await renderReceipt({ notes: '<script>alert("xss")</script> Ali & Sons' });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("Ali &amp; Sons");
    // The plain-text half is not markup and is left verbatim.
    expect(mail.text).toContain('<script>alert("xss")</script> Ali & Sons');
  });

  it("renders a fractional amount identically and correctly in both halves", async () => {
    const mail = await renderReceipt({ amountMYR: 250.5 });

    expect(mail.text).toContain("RM 250.50");
    expect(mail.html).toContain("RM 250.50");
    expect(mail.text).not.toContain("250.5.00");
    expect(mail.html).not.toContain("250.5.00");
  });

  it("states the same optional rows in both halves", async () => {
    const mail = await renderReceipt({ targetPetName: "Luna", taxIdOrIc: "910101-10-1234" });

    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("Luna");
      expect(body).toContain("910101-10-1234");
      expect(body).toContain("RM 250.00");
    }
  });

  it("keeps an identifier-free HTML receipt non-claimable without promising reissue", async () => {
    const mail = await renderReceipt({ taxIdOrIc: undefined });

    expect(mail.html).not.toContain("Official Tax-Exempt e-Receipt");
    expect(mail.html).not.toMatch(/valid for .*tax filing.*Section 44\(6\)/i);
    expect(mail.html).toMatch(/cannot be filed against a tax return/i);
    expect(mail.html).toMatch(
      /cannot be filed against a tax return[\s\S]*contact (?:us|the shelter)/i
    );
    expect(mail.html).not.toMatch(/we (?:will|'ll) reissue/i);
  });
});

/**
 * The rendered half of email colour parity.
 *
 * `designSystemGuards.test.ts` proves the hex mirror still equals the tokens in
 * `globals.css`. That is necessary but not sufficient: it would stay green if `email.ts`
 * imported the mirror and then never used it, or used the wrong entry. These assertions read
 * the markup that actually goes on the wire.
 *
 * Background: docs/tasks/TARGET_EMAIL_COLOUR_PARITY.md.
 */
describe("rendered email colour parity", () => {
  const application: AdoptionApplicationRecord = {
    id: "app-parity-001",
    petId: "pet-001",
    petName: "Kopi",
    applicantName: "Tan Ah Kow",
    email: "tahkow@example.com",
    phone: "012-3456789",
    address: "123 Jalan SS2, Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    applicantNotes: "Excited!",
    status: "SUBMITTED",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  };

  /** Drives a builder down the live path and returns the payload Resend would receive. */
  async function capture(dispatch: () => Promise<unknown>): Promise<string> {
    const fetchSpy = stubResendAccepts();

    await dispatch();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).html as string;
  }

  it("gives all seven tones a badge and a card, in the mirrored colours", async () => {
    // The gap this closes: the email had four badge classes named after application statuses,
    // so care, neutral and highlight had no email colour at all and anything mapped to them
    // rendered in the sky reserved for "informational".
    const html = await capture(() => sendApplicationStatusUpdateEmail(application, "APPROVED"));

    const missing: string[] = [];
    for (const tone of DESIGN_TONES) {
      const { surface, text, accent } = EMAIL_TONE[tone];
      if (!html.includes(`.badge-${tone} { background: ${surface}; color: ${text}; }`)) {
        missing.push(`.badge-${tone} (${surface} / ${text})`);
      }
      if (!html.includes(`.card-${tone} { background: ${surface}; border-left-color: ${accent}; }`)) {
        missing.push(`.card-${tone} (${surface} / ${accent})`);
      }
    }

    expect(
      missing,
      "Every tone needs an email presence, or a status mapped to it silently falls back to " +
        "the default informational badge in the recipient's inbox."
    ).toEqual([]);
  });

  it("badges a status in the same tone the app shows it in", async () => {
    // The defect in the target doc §1.2: a status read one colour in the admin table and
    // another in the inbox, because email kept its own status → colour table.
    const statuses: ApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];

    for (const status of statuses) {
      const html = await capture(() => sendApplicationStatusUpdateEmail(application, status));
      const { toneClass } = getApplicationStatusPresentation(status);
      const tone = toneClass.replace(/^tone-/, "");

      expect(
        html,
        `${status} is ${toneClass} in the app, so its email badge must be badge-${tone}`
      ).toContain(`class="badge badge-${tone}"`);
    }
  });

  it("styles the statutory receipt from the --receipt-* group", async () => {
    // §3.3: --receipt-* is the one token group already fixed across themes, because a
    // Sec 44(6) receipt is black ink on white paper and has to survive a monochrome printer.
    // The emailed and the printed receipt for the same donation are meant to be one document.
    const html = await capture(() =>
      sendDonationReceiptEmail({
        receiptNumber: "HFS-DON-202608-4821",
        date: "28 Aug 2026, 10:15 AM",
        donorName: "Siti Nurhaliza",
        donorEmail: "siti@example.com",
        tierId: "vaccine",
        tierName: "Core Vaccination & Deworming",
        amountMYR: 250,
        frequency: "one_time",
        paymentMethod: "duitnow_qr",
        targetPetName: "Luna",
        taxDeductibleRef: "LHDN.01/35/42/51/179-6.9999",
        shelterRegistrationNo: "PPM-001-10-99999999",
      })
    );

    expect(html, "the receipt sits on receipt paper").toContain(EMAIL_RECEIPT.paper);
    expect(html, "receipt headings are receipt ink").toContain(EMAIL_RECEIPT.ink);
    expect(html, "the total is the fixed receipt accent").toContain(EMAIL_RECEIPT.inkAccent);
    expect(html, "field labels are the faint ink").toContain(EMAIL_RECEIPT.inkFaint);
  });

  it("wears the brand palette, and none of the palette it replaced", async () => {
    const html = await capture(() => sendApplicationStatusUpdateEmail(application, "APPROVED"));

    expect(html, "the header band is the brand terracotta").toContain(EMAIL_BRAND.primary);
    expect(html, "the page sits on the brand cream").toContain(EMAIL_BRAND.background);

    // The stock Tailwind slate/sky the email was built from. A shelter whose app is warm
    // cream and terracotta was sending cool slate-and-sky mail; these are the exact values.
    const ABANDONED = ["#0f172a", "#f8fafc", "#64748b", "#e2e8f0", "#0284c7", "#0369a1", "#1e293b"];
    const survivors = ABANDONED.filter((hex) => html.toLowerCase().includes(hex));

    expect(
      survivors,
      "These are Tailwind's stock slate/sky — the vocabulary the token pass removed from the " +
        "app. Reaching for one here puts the shelter's email back in a palette its own " +
        "application abandoned."
    ).toEqual([]);
  });
});

/**
 * The staff alert had the same defect shape as the Sec 44(6) receipt: one application authored
 * twice, once as plain text and once as HTML, with no shared source for the values. The HTML half
 * omitted `applicantNotes` entirely — the most decision-relevant free-text field on the form — and
 * dropped the pet ID from the pet row. A coordinator reading the HTML half saw neither.
 *
 * Background: docs/archives/tasks/URGENT_RECEIPT_EMAIL_CORRECTNESS.md.
 */
describe("staff application alert — the two halves must agree", () => {
  const baseApplication: AdoptionApplicationRecord = {
    id: "app-alert-001",
    petId: "pet-042",
    petName: "Kopi",
    applicantName: "Tan Ah Kow",
    email: "tahkow@example.com",
    phone: "012-3456789",
    address: "123 Jalan SS2, Petaling Jaya",
    housingType: "landed_terrace",
    hasFencedYard: "yes",
    currentPets: "none",
    householdExperience: "experienced",
    applicantNotes: "We have a fenced garden and I work from home.",
    status: "SUBMITTED",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  };

  /**
   * The alert is only observable on the wire: sendStaffApplicationAlert returns a dispatch result,
   * not a body. Drive the live path with a stubbed key and read both halves off the Resend payload.
   */
  async function renderStaffAlert(
    overrides: Partial<AdoptionApplicationRecord> = {}
  ): Promise<{ subject: string; text: string; html: string }> {
    const fetchSpy = stubResendAccepts();

    const result = await sendStaffApplicationAlert({ ...baseApplication, ...overrides });
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    return JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
  }

  it("states the applicant's own notes in BOTH halves, not only the plain text", async () => {
    const mail = await renderStaffAlert({
      applicantNotes: "We have a fenced garden and I work from home.",
    });

    expect(mail.text).toContain("Notes: We have a fenced garden and I work from home.");
    expect(
      mail.html,
      "A coordinator whose client renders the HTML half must still see what the applicant wrote."
    ).toContain("<strong>Notes:</strong> We have a fenced garden and I work from home.");
  });

  it("states the pet ID in BOTH halves", async () => {
    const mail = await renderStaffAlert({ petId: "pet-042", petName: "Kopi" });

    expect(mail.text).toContain("Pet: Kopi (ID: pet-042)");
    expect(
      mail.html,
      "Two shelter animals can share a name; the ID is what disambiguates the application."
    ).toContain("Kopi (ID: pet-042)");
  });

  it("uses the same fallbacks in both halves when the optional fields are absent", async () => {
    const mail = await renderStaffAlert({ applicantNotes: undefined, petId: "" });

    for (const [half, body] of [["text", mail.text], ["html", mail.html]] as const) {
      expect(body, `${half} half should fall back to "None" for missing notes`).toContain("None");
      expect(body, `${half} half should fall back to "N/A" for a missing pet ID`).toContain("N/A");
    }
    expect(mail.text).toContain("Notes: None");
    expect(mail.html).toContain("<strong>Notes:</strong> None");
    expect(mail.text).toContain("(ID: N/A)");
    expect(mail.html).toContain("(ID: N/A)");
  });

  it("escapes applicant-supplied markup before placing it in the HTML body", async () => {
    const mail = await renderStaffAlert({
      applicantNotes: '<script>alert("xss")</script> Ali & Sons "quoted"',
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("Ali &amp; Sons");
    expect(mail.html).toContain("&quot;quoted&quot;");
    // The plain-text half is not markup and is left verbatim.
    expect(mail.text).toContain('<script>alert("xss")</script> Ali & Sons "quoted"');
  });
});
