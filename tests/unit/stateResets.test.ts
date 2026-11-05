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
  // Not on that list, and reset by hand in their own suites until they registered.
  "@/lib/server/clinicalRepository",
  "@/lib/server/transparencyRepository",
  "@/lib/security/secrets",
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
  "clinical",
  "transparency",
  "secretWarnings",
];

/** Every source file under src/, read once for the guards below. */
const SRC = fileURLToPath(new URL("../../src", import.meta.url));
const SOURCES = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => ({ path: `src/${file.replace(/\\/g, "/")}`, text: readFileSync(join(SRC, file), "utf8") }));

/** The registrations in a file: a `registerStateReset("name", resetFn);` line, not one commented out. */
function registrations(text: string): Array<{ name: string; reset: string }> {
  return [...text.matchAll(/^\s*registerStateReset\("([^"]+)",\s*(\w+)\);/gm)].map((match) => ({
    name: match[1],
    reset: match[2],
  }));
}

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
    const names = SOURCES.flatMap(({ text }) => registrations(text).map(({ name }) => name));

    expect(names.sort(), "every store registers once, under a name in EXPECTED").toEqual([...EXPECTED].sort());
  });

  it("registers every reset src/ exports, so no store is left out of the harness", () => {
    // A store whose reset is exported but never registered leaks its state between tests
    // in any file that does not call it by hand, and the name list above cannot see it.
    const unregistered = SOURCES.flatMap(({ path, text }) => {
      const registered = new Set(registrations(text).map(({ reset }) => reset));
      return [...text.matchAll(/export (?:async )?function (reset[A-Z]\w*)/g)]
        .map((match) => match[1])
        .filter((name) => name !== "resetRegisteredState" && !registered.has(name))
        .map((name) => `${name} (${path})`);
    });

    expect(unregistered).toEqual([]);
  });

  it("keeps one entry per name, so a module re-evaluated by vi.resetModules replaces its own", () => {
    registerStateReset("re-registered", () => undefined);
    registerStateReset("re-registered", () => undefined);

    expect(registeredStateResets().filter((name) => name === "re-registered")).toHaveLength(1);
  });
});
