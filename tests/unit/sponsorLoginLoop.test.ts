import { describe, it, expect, vi } from "vitest";
import { getLastRedirect, MockNavigationError } from "../setup/nextMocks";
import { setSponsorSessionCookie } from "@/lib/security/sponsorSession";

vi.mock("@/lib/server/sponsorRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/sponsorRepository")>();
  return { ...actual, findSponsorById: vi.fn(actual.findSponsorById) };
});
vi.mock("@/lib/server/sponsorshipLedger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/sponsorshipLedger")>();
  return { ...actual, listSponsorshipsByUserId: vi.fn(actual.listSponsorshipsByUserId) };
});

/**
 * /sponsor/login and /sponsor/dashboard agree on who is signed in.
 *
 * The dashboard asks whether the session still names a sponsor; the sign-in page asked only
 * whether the cookie was valid. A sponsor whose record is gone — deleted, or an offline-mode
 * registration lost to a restart — was sent from the sign-in page to the dashboard and from
 * the dashboard back again, and no page ever rendered. The first case fails against the
 * sign-in page before 2026-10-19.
 */
const PAGES = {
  login: () => import("@/app/sponsor/login/page"),
  dashboard: () => import("@/app/sponsor/dashboard/page"),
  certificate: () => import("@/app/sponsor/certificate/page"),
};

async function open(path: keyof typeof PAGES): Promise<string | null> {
  const { default: Page } = await PAGES[path]();
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
    // ...which the dashboard sends here, so the two now end in a page rather than a loop,
    // and so does the certificate page, which used to render for the cookie alone.
    expect(await open("dashboard")).toBe("/sponsor/login");
    expect(await open("certificate")).toBe("/sponsor/login");
  });

  it("sends a sponsor who still exists on to the dashboard", async () => {
    await setSponsorSessionCookie({ sponsorId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah" });

    expect(await open("login")).toBe("/sponsor/dashboard");
  });

  it("shows the sign-in form when signed out", async () => {
    expect(await open("login")).toBeNull();
  });

  it("still shows the sign-in form when the database cannot say who the cookie names", async () => {
    // So a sponsor can start over during an outage instead of meeting a 500.
    const { findSponsorById } = await import("@/lib/server/sponsorRepository");
    vi.mocked(findSponsorById).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await setSponsorSessionCookie({ sponsorId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah" });

    expect(await open("login")).toBeNull();
    // ...and says so, or the outage looks exactly like a signed-out visitor.
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("[Sponsor Sign-In]"), expect.any(Error));
    logged.mockRestore();
  });

  it("decides without reading the sponsor's sponsorships", async () => {
    const { listSponsorshipsByUserId } = await import("@/lib/server/sponsorshipLedger");
    vi.mocked(listSponsorshipsByUserId).mockClear();
    await setSponsorSessionCookie({ sponsorId: "spn-bronze-01", email: "bronze@example.com", name: "Nurul Aisyah" });

    await open("login");

    expect(listSponsorshipsByUserId).not.toHaveBeenCalled();
  });
});
