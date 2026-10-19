import { describe, expect, it } from "vitest";
import { registeredStateResets, registerStateReset } from "@/lib/stateResets";

/**
 * The global `beforeEach` in `tests/setup/nextMocks.ts` resets whatever has
 * registered with `@/lib/stateResets`. It used to import and reset a fixed list
 * of eleven store owners itself; this pins that every store on that list still
 * registers, so moving to the registry dropped no reset.
 */
const STORE_OWNERS = [
  "@/lib/server/petRepository",
  "@/lib/server/applicationRepository",
  "@/lib/server/rehabNeedsCatalog",
  "@/lib/server/faqRepository",
  "@/lib/server/bulletinRepository",
  "@/lib/server/settingsRepository",
  "@/lib/domain/auditLog",
  "@/lib/security/rateLimit",
  "@/lib/security/idempotency",
  "@/lib/server/donationLedger",
  "@/lib/server/donationPledgeLedger",
  "@/lib/server/sponsorshipLedger",
  "@/lib/server/sponsorDemoSeed",
  "@/lib/server/sponsorRepository",
  "@/lib/server/notificationPreferences",
  "@/lib/server/userStore",
];

const EXPECTED = [
  "pets",
  "applications",
  "rehabNeeds",
  "faqs",
  "bulletins",
  "settings",
  "auditLog",
  "rateLimit",
  "idempotency",
  "donationLedger",
  "donationPledgeLedger",
  "sponsorshipLedger",
  "sponsorDemoSeed",
  "sponsorRepository",
  "notificationPreferences",
  "userStore",
];

describe("module state resets", () => {
  it("registers every store the global hook used to reset by hand", async () => {
    await Promise.all(STORE_OWNERS.map((path) => import(path)));

    expect([...registeredStateResets()].sort()).toEqual([...EXPECTED].sort());
  });

  it("clears the demo-seed flag only after every ledger, so the next test re-seeds", async () => {
    await Promise.all(STORE_OWNERS.map((path) => import(path)));
    const order = registeredStateResets();
    const seedFlag = order.indexOf("sponsorDemoSeed");

    for (const ledger of ["donationLedger", "donationPledgeLedger", "sponsorshipLedger"]) {
      expect(order.indexOf(ledger)).toBeLessThan(seedFlag);
    }
    expect(order.indexOf("sponsorRepository")).toBeGreaterThan(seedFlag);
  });

  it("keeps one entry per name, so a module re-evaluated by vi.resetModules replaces its own", () => {
    registerStateReset("re-registered", () => undefined);
    registerStateReset("re-registered", () => undefined);

    expect(registeredStateResets().filter((name) => name === "re-registered")).toHaveLength(1);
  });
});
