import { describe, expect, it } from "vitest";

/**
 * The components tier stands in for the browser, so it runs in the zone the shelter's staff and
 * supporters are in (`tests/setup/hermeticRuntime.ts`), not in the server's UTC. A client-side
 * date taken from the UTC day shows up here as the wrong day before 08:00.
 */
describe("the components tier", () => {
  it("runs in Asia/Kuala_Lumpur, where the app's users are", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Kuala_Lumpur");
    expect(new Date("2026-10-20T00:30:00Z").getHours()).toBe(8);
  });
});
