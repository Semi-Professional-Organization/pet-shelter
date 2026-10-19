import { describe, it, expect } from "vitest";
import { getLastRedirect, MockNavigationError } from "../setup/nextMocks";
import { setSponsorSessionCookie } from "@/lib/security/sponsorSession";

/**
 * /sponsor/login and /sponsor/dashboard agree on who is signed in.
 *
 * The dashboard asks whether the session still names a sponsor; the sign-in page asked only
 * whether the cookie was valid. A sponsor whose record is gone — deleted, or an offline-mode
 * registration lost to a restart — was sent from the sign-in page to the dashboard and from
 * the dashboard back again, and no page ever rendered. The first case fails against the
 * sign-in page before 2026-10-19.
 */
async function open(path: "login" | "dashboard"): Promise<string | null> {
  const { default: Page } =
    path === "login" ? await import("@/app/sponsor/login/page") : await import("@/app/sponsor/dashboard/page");
  try {
    await Page();
    return null;
  } catch (error) {
    if (error instanceof MockNavigationError) return getLastRedirect();
    throw error;
  }
}

describe("sponsor sign-in", () => {
  it("shows the sign-in form to a valid cookie whose sponsor no longer exists", async () => {
    await setSponsorSessionCookie({ sponsorId: "spn-gone-01", email: "gone@example.com", name: "Gone Sponsor" });

    expect(await open("login")).toBeNull();
    // ...which the dashboard sends here, so the two now end in a page rather than a loop.
    expect(await open("dashboard")).toBe("/sponsor/login");
  });

  it("sends a sponsor who still exists on to the dashboard", async () => {
    await setSponsorSessionCookie({ sponsorId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah" });

    expect(await open("login")).toBe("/sponsor/dashboard");
  });

  it("shows the sign-in form when signed out", async () => {
    expect(await open("login")).toBeNull();
  });
});
