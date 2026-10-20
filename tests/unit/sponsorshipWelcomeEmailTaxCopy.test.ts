import { describe, expect, it, vi } from "vitest";
import { sendSponsorshipWelcomeEmail } from "@/lib/email";
import { reconciliationNotice } from "@/lib/domain/petSponsorship";

describe("identifier-free sponsorship welcome email", () => {
  it("makes no Section 44(6) or tax-exempt promise in either rendered half", async () => {
    vi.stubEnv("RESEND_API_KEY", "test_key");
    // Every call, not only the first, so a second send cannot fall through to an unstubbed fetch.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-msg-test" }),
    } as unknown as Response);

    const identifierFreePledge = {
      pledgeRef: "HFS-PLG-20260914-ABCD",
      petName: "Bella",
      sponsorName: "Aisyah Rahman",
      sponsorEmail: "aisyah@example.com",
      tierName: "Core Vaccination & Deworming",
      amountMYR: 50,
      frequency: "one_time" as const,
      paymentMethod: "duitnow_qr" as const,
      taxIdOrIc: undefined,
      // Use the real domain copy: otherwise fixing only the template footer
      // would leave this caller-supplied promise undetected.
      reconciliationNotice: reconciliationNotice("one_time", "duitnow_qr"),
    };

    try {
      const result = await sendSponsorshipWelcomeEmail(identifierFreePledge);
      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as {
        subject: string;
        text: string;
        html: string;
      };

      for (const [half, body] of [
        ["subject", request.subject],
        ["plain text", request.text],
        ["HTML", request.html],
      ] as const) {
        expect(
          body,
          `${half} must not promise statutory relief without an identifier`,
        ).not.toMatch(/\b(?:subsection|section)\s+44\s*\(6\)/i);
        expect(
          body,
          `${half} must not call a future receipt tax-exempt without an identifier`,
        ).not.toMatch(/\btax[\s-]*exempt\b/i);
        expect.soft(
          body,
          `${half} must describe a pending pledge, not a current or confirmed sponsorship`,
        ).not.toMatch(/\b(?:sponsorship confirmed|you are now a sponsor|current sponsor)\b/i);
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
