import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "@/lib/security/permissions";
import { prisma } from "@/lib/server/prisma";
import { findMemberRow, signInAs, signOut } from "../setup/authSession";

/**
 * A donation earmark is the donor's own note, stored as one line, otherwise as written,
 * and checked against no animal (owner's decision, 2026-11-11, option B:
 * tasks/decisions/2026-11-11-a-donation-earmark-is-the-donors-note.md; #205).
 *
 * The other half, that staff and donor surfaces label it as the donor's note, is pinned
 * in tests/components/DonationEarmarkDonorNote.test.tsx and the email and CSV suites.
 */

// Every export of the pet repository, wrapped in a spy that still calls through, so
// "no pet lookup happens" is an observation rather than an assumption.
// ceiling: watches only the `@/lib/server/petRepository` exports. A direct `prisma.pet`
// query or a `src/data/pets.json` import on the pledge path would pass unseen; spy on
// `prisma.pet` and mock the JSON module too if the path ever grows a reason to reach them.
vi.mock("@/lib/server/petRepository", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn(value as (...args: unknown[]) => unknown) : value,
    ])
  );
});

beforeEach(async () => {
  // The repository spies are module-level, so each case starts from zero calls.
  const petRepository = await import("@/lib/server/petRepository");
  for (const value of Object.values(petRepository)) {
    if (vi.isMockFunction(value)) value.mockClear();
  }
  // The coordinator's queue re-reads the signed-in member on every call. Answered with
  // the row the test identity has, so authorization goes through the member check and
  // not the DAL's outage fallback (tasks/open/seven-unit-suites-are-authorized-by-the-dal-fallback.md).
  // Every other query still meets the offline client and is served from memory.
  vi.spyOn(prisma.user, "findUnique").mockImplementation(
    findMemberRow as unknown as typeof prisma.user.findUnique
  );
  await signOut();
});

// "Tuah" is the name from the issue. It is also a demo animal in src/data/pets.json, so
// the case is repeated with "Kenanga", which no fixture holds: the earmark is stored the
// same way whether or not any store knows the name.
describe.each(["Tuah", "Kenanga"])("a gift earmarked %s is stored as one line, otherwise as written", (name) => {
  it("records the name, with no pet lookup, and queues it unchanged", async () => {
    const { submitDonationPledgeAction, listPendingDonationPledgesAction } = await import(
      "@/actions/donations"
    );
    const petRepository = await import("@/lib/server/petRepository");
    const { findDonationPledgeByRef } = await import("@/lib/server/donationPledgeLedger");

    const result = await submitDonationPledgeAction({
      donorName: "Aisyah Rahman",
      donorEmail: "aisyah@example.com",
      tierId: "vaccine",
      amountMYR: 50,
      frequency: "one_time",
      paymentMethod: "duitnow_qr",
      targetPetName: name,
    });

    expect(result.success).toBe(true);
    expect(result.data!.targetPetName).toBe(name);
    const stored = await findDonationPledgeByRef(result.data!.pledgeRef);
    expect(stored?.targetPetName).toBe(name);

    for (const [exported, value] of Object.entries(petRepository)) {
      if (vi.isMockFunction(value)) {
        expect(value, `${exported} was called on the pledge path`).not.toHaveBeenCalled();
      }
    }

    await signInAs(ROLES.VOLUNTEER_COORDINATOR);
    const queue = await listPendingDonationPledgesAction();
    expect(queue.success).toBe(true);
    expect(queue.data!.find((r) => r.pledgeRef === result.data!.pledgeRef)?.targetPetName).toBe(
      name
    );
  });
});

// A dedication is stored as one line, so it cannot start a line of its own in the
// plain-text emails and pose as one of their fields.
describe("a dedication is normalised to one line at the boundary", () => {
  it("collapses newlines and control characters in the schema", async () => {
    const { donationPledgeSchema } = await import("@/lib/validations/donation");
    const parsed = donationPledgeSchema.parse({
      donorName: "Aisyah Rahman",
      donorEmail: "aisyah@example.com",
      amountMYR: 50,
      targetPetName: "Tuah\n\nTOTAL RECEIVED: RM 9,999.00",
    });

    expect(parsed.targetPetName).toBe("Tuah TOTAL RECEIVED: RM 9,999.00");
  });

  it("normalises before it caps, so padding cannot push a name out", async () => {
    const { donationPledgeSchema } = await import("@/lib/validations/donation");
    const parsed = donationPledgeSchema.parse({
      donorName: "Aisyah Rahman",
      donorEmail: "aisyah@example.com",
      amountMYR: 50,
      targetPetName: `Tuah${" ".repeat(200)}Kecil`,
    });

    expect(parsed.targetPetName).toBe("Tuah Kecil");
  });

  it("removes zero-width and bidi format characters", async () => {
    const { normaliseDedication } = await import("@/lib/domain/donationPledge");

    expect(normaliseDedication("\u200B")).toBe("");
    expect(normaliseDedication("Tuah\u202Edetaerc")).toBe("Tuahdetaerc");
  });

  it("caps without leaving half of a surrogate pair", async () => {
    const { normaliseDedication, DONATION_DEDICATION_MAX_LENGTH } = await import(
      "@/lib/domain/donationPledge"
    );
    const name = `${"A".repeat(DONATION_DEDICATION_MAX_LENGTH - 1)}🐾`;

    const capped = normaliseDedication(name);
    expect(capped).toBe("A".repeat(DONATION_DEDICATION_MAX_LENGTH - 1));
    expect(capped).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
