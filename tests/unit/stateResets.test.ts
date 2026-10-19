import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

    // A subset check: the last test in this file registers a name of its own.
    expect(registeredStateResets()).toEqual(expect.arrayContaining(EXPECTED));
  });

  it("gives each store a name no other module registers", () => {
    // Names are typed by hand, and the registry keeps one reset per name: a second
    // module registering an existing name would silently replace the first one's
    // reset, and that store would leak between tests.
    const src = fileURLToPath(new URL("../../src", import.meta.url));
    const registrations = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const text = readFileSync(join(src, file), "utf8");
        return [...text.matchAll(/registerStateReset\("([^"]+)"/g)].map((match) => match[1]);
      });

    expect(registrations.sort(), "every store registers once, under a name in EXPECTED").toEqual(
      [...EXPECTED].sort()
    );
  });

  it("keeps one entry per name, so a module re-evaluated by vi.resetModules replaces its own", () => {
    registerStateReset("re-registered", () => undefined);
    registerStateReset("re-registered", () => undefined);

    expect(registeredStateResets().filter((name) => name === "re-registered")).toHaveLength(1);
  });
});
