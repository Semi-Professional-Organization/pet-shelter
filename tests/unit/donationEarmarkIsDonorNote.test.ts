import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "@/lib/security/permissions";

/**
 * A donation earmark is the donor's own note, stored as written and checked against no
 * animal (owner's decision, 2026-11-11, option B:
 * tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md; #205).
 *
 * The other half — that every surface labels it as the donor's note — is pinned in
 * tests/components/DonationEarmarkDonorNote.test.tsx and the email and CSV suites.
 */

const COORDINATOR = { id: "usr-coord-01", email: "coordinator@hopeforstrays.org" };
const signedIn = { value: false };

vi.mock("@/lib/security/session", () => ({
  getCurrentSession: vi.fn(async () =>
    signedIn.value
      ? {
          ...COORDINATOR,
          name: "Test coordinator",
          role: ROLES.VOLUNTEER_COORDINATOR,
          expiresAt: Date.now() + 3_600_000,
        }
      : null
  ),
}));

// Every export of the pet repository, wrapped in a spy that still calls through, so
// "no pet lookup happens" is an observation rather than an assumption.
vi.mock("@/lib/server/petRepository", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn(value as (...args: unknown[]) => unknown) : value,
    ])
  );
});

beforeEach(() => {
  signedIn.value = false;
});

describe("/donate?pet=Tuah when the catalogue holds no Tuah", () => {
  it("records Tuah as the donor's text, with no pet lookup, and queues it as written", async () => {
    const { submitDonationPledgeAction, listPendingDonationPledgesAction } = await import(
      "@/actions/donations"
    );
    const petRepository = await import("@/lib/server/petRepository");
    const { findDonationPledgeByRef } = await import("@/lib/server/donationPledgeLedger");

    // Nothing here seeds a Tuah. Whether one exists does not matter, because the path
    // under test must not ask: the assertion below is that no repository function runs.
    const result = await submitDonationPledgeAction({
      donorName: "Aisyah Rahman",
      donorEmail: "aisyah@example.com",
      tierId: "vaccine",
      amountMYR: 50,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
      targetPetName: "Tuah",
    });

    expect(result.success).toBe(true);
    expect(result.data!.targetPetName).toBe("Tuah");
    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);
    expect(stored?.targetPetName).toBe("Tuah");

    for (const [name, value] of Object.entries(petRepository)) {
      if (vi.isMockFunction(value)) {
        expect(value, `${name} was called on the pledge path`).not.toHaveBeenCalled();
      }
    }

    signedIn.value = true;
    const queue = await listPendingDonationPledgesAction();
    expect(queue.success).toBe(true);
    expect(queue.data!.find((r) => r.pledgeRef === result.data!.pledgeRef)?.targetPetName).toBe(
      "Tuah"
    );
  });
});
