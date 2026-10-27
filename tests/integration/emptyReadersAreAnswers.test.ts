import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import committedApplications from "@/data/applications.json";
import { getPrismaDouble, resetPrismaDouble, type PrismaDouble } from "./support/prismaDouble";

/**
 * Tier 3a — the last two readers #65 asked about: is an empty result an answer or an outage?
 *
 * - Applications: an answer. An empty table returns `[]`, never the `applications.json` demo
 *   applicants; the fixtures are reached only from the `catch`.
 * - Settings: the shipped defaults, on both exits. The row is created by the first admin save,
 *   so "no row" means "not saved yet", and the defaults are the right answer to it. What keeps
 *   that from overwriting real settings is `getServerSettingsWithSource` saying `fromDatabase:
 *   false`, so that is asserted too.
 *
 * Each answer gets its fallback proved alongside it, because "returns empty" also passes against
 * a reader that lost its fallback altogether.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return { prisma: double, default: double, disconnectPrisma: vi.fn().mockResolvedValue(undefined) };
});

let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(double);
  vi.unstubAllEnvs();
});

describe("an empty applications table is an answer", () => {
  it("guards the test: the fixture the mirror is seeded from is not empty", () => {
    expect(committedApplications.length).toBeGreaterThan(0);
  });

  it("returns no applications when the query succeeds with no rows", async () => {
    double.adoptionApplication.findMany.mockResolvedValue([]);
    const { getServerApplicationsAsync } = await import("@/lib/server/applicationRepository");

    expect(await getServerApplicationsAsync()).toEqual([]);
  });

  it("still falls back to the mirror when the query fails outside strict mode", async () => {
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
    double.adoptionApplication.findMany.mockRejectedValue(new Error("connection refused"));
    const { getServerApplicationsAsync } = await import("@/lib/server/applicationRepository");

    expect((await getServerApplicationsAsync()).length).toBeGreaterThan(0);
  });
});

describe("a missing settings row is answered with the shipped defaults", () => {
  it("serves the defaults, and does not claim they came from the database", async () => {
    double.shelterSettings.findUnique.mockResolvedValue(null);
    const { getServerSettingsAsync, getServerSettingsWithSource, getServerSettings } = await import(
      "@/lib/server/settingsRepository"
    );

    expect(await getServerSettingsAsync()).toEqual(getServerSettings());
    expect((await getServerSettingsWithSource()).fromDatabase).toBe(false);
  });

  it("serves the defaults on a failed query too, still not as database values", async () => {
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
    double.shelterSettings.findUnique.mockRejectedValue(new Error("connection refused"));
    const { getServerSettingsAsync, getServerSettingsWithSource, getServerSettings } = await import(
      "@/lib/server/settingsRepository"
    );

    expect(await getServerSettingsAsync()).toEqual(getServerSettings());
    expect((await getServerSettingsWithSource()).fromDatabase).toBe(false);
  });

  it("serves the stored row when there is one", async () => {
    // Positive control: proves the reader really queries, so the two cases above are answers.
    double.shelterSettings.findUnique.mockResolvedValue({
      id: "default-settings",
      shelterName: "Stored Shelter",
      email: "stored@example.test",
      phone: "03-0000000",
      address: "Stored address",
      operatingHours: "Always",
      announcementBanner: null,
      adoptionFeeDog: "RM100",
      adoptionFeeCat: "RM50",
      duitNowQrUrl: null,
      tngQrUrl: null,
      bankQrUrl: null,
      paymentPayload: null,
      volunteerFormUrl: "https://example.test/form",
      volunteerFormResponsesUrl: "https://example.test/responses",
    });
    const { getServerSettingsWithSource } = await import("@/lib/server/settingsRepository");

    const { settings, fromDatabase } = await getServerSettingsWithSource();
    expect(fromDatabase).toBe(true);
    expect(settings.shelterName).toBe("Stored Shelter");
  });
});
