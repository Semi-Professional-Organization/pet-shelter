import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import initialPets from "@/data/pets.json";
import {
  getPrismaDouble,
  makeDbPet,
  resetPrismaDouble,
  type PrismaDouble,
} from "./support/prismaDouble";

/**
 * Tier 3a — an animal the database does not hold is a missing animal, not a cue to
 * serve the bundled demo one.
 *
 * `findServerPetByIdAsync` used to fall through to the `src/data/pets.json` mirror on
 * *both* exits of its database branch: after a thrown query and after a query that
 * succeeded with no row. So an id present in the fixture but absent from a populated
 * database was served at its exact URL — `/pets` did not list it, because the catalogue
 * reader trusts whatever the database returns, so the animal was unreachable from the
 * grid and reachable by direct link. A hard-deleted row, or a fixture id production was
 * never seeded with, published a demo animal. The same read backs sponsorship checkout,
 * where it recorded a pledge against the fixture's name.
 *
 * The fix is the shape the two readers beside it already use: the fallback runs from the
 * `catch`, or when no database is configured, and never after a successful empty read.
 * `getServerPetsAsync` reaches it the same way (`softDeleteFiltering.test.ts`, "returns an
 * empty array without falling back to fixtures when the database is merely empty"), and so
 * does `getServerFaqsAsync` (`faqEmptyPublishSet.test.ts`).
 *
 * Every id below is `pet-001`, a real row in `src/data/pets.json` and unarchived there.
 * That is the whole point: an `itest-` id is absent from the mirror too, so the mirror
 * returns null for it and the assertion passes against the broken reader for the wrong
 * reason — the trap `softDeleteFiltering.test.ts` documents at its own null test.
 *
 * Both halves matter. Pinning only "a missing row returns null" would also pass against a
 * reader that had lost its fallback altogether, so the outage and no-database cases pin
 * that the fallback still exists and still runs.
 */

vi.mock("@/lib/server/prisma", async () => {
  const { createPrismaDouble } = await import("./support/prismaDouble");
  const double = createPrismaDouble();
  return {
    prisma: double,
    default: double,
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
  };
});

/**
 * The pledge write, stubbed at the ledger rather than at Prisma.
 *
 * The checkout tests' question is which animal the action resolved, not how a pledge is
 * persisted — and `PrismaDouble` carries no sponsorship delegates, so reaching the real
 * ledger would fail for plumbing reasons and mask the answer. Partial, so the error type
 * and the summary helpers the action also imports stay real.
 */
vi.mock("@/lib/server/sponsorshipLedger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/sponsorshipLedger")>();
  return {
    ...actual,
    recordSponsorshipPledge: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      id: "itest-pledge",
      pledgeRef: "SP-ITEST-0001",
      status: "pending",
      createdAt: new Date(0).toISOString(),
    })),
  };
});

/**
 * Nothing here is about mail; the welcome send would otherwise reach a real transport.
 *
 * Partial, like the ledger mock above. Replacing the module wholesale would leave its other
 * twelve exports undefined, and the next test in this file that reaches the photo-update or
 * application-confirmation path would fail at call time with "No export is defined on the
 * mock" rather than at import — a long way from the line that caused it.
 */
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendSponsorshipWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendDonationReceiptEmail: vi.fn().mockResolvedValue(undefined),
  };
});

/** A fixture animal, chosen because the mirror can serve it and a populated database may not. */
const FIXTURE_ID = "pet-001";
const FIXTURE_NAME = "Bella";

let double: PrismaDouble;

beforeAll(async () => {
  double = await getPrismaDouble();
});

beforeEach(() => {
  resetPrismaDouble(double);
  vi.unstubAllEnvs();
  // The ledger mock is built once, in the module factory, and this config sets no
  // `clearMocks`. Without this, `not.toHaveBeenCalled()` below would be asserting against
  // call history accumulated by every earlier test in the file — passing only because of
  // the order the tests happen to be declared in.
  vi.clearAllMocks();
});

/** Guards every assertion below: an id the fixture does not hold would prove nothing. */
it("uses an id the bundled fixture really holds", () => {
  const fixture = (initialPets as Array<{ id: string; name: string; isArchived?: boolean }>).find(
    (p) => p.id === FIXTURE_ID
  );

  expect(fixture).toBeDefined();
  expect(fixture?.name).toBe(FIXTURE_NAME);
  // Unarchived in the fixture, so nothing downstream can mistake a leak for an archive filter.
  expect(fixture?.isArchived ?? false).toBe(false);
});

describe("the repository distinguishes a missing row from an unreachable database", () => {
  it("returns null when the database answers with no row", async () => {
    // The default double already resolves `findUnique` to null; stated here because it is
    // the arrangement under test rather than an incidental default.
    double.pet.findUnique.mockResolvedValue(null);
    const { findServerPetByIdAsync } = await import("@/lib/server/petRepository");

    expect(await findServerPetByIdAsync(FIXTURE_ID)).toBeNull();
  });

  it("does not empty the mirror when it declines to serve from it", async () => {
    double.pet.findUnique.mockResolvedValue(null);
    const { findServerPetByIdAsync, getServerPets } = await import("@/lib/server/petRepository");

    await findServerPetByIdAsync(FIXTURE_ID);

    // Scope stated honestly, because an earlier version of this test claimed more than it
    // proves. It does **not** guard against a reader that lost its fallback: the harness's
    // reset of the pet store reseeds this array from `pets.json` before every test, so the
    // assertion below holds even against a reader with no fallback at all. That coverage
    // comes from the outage and no-database cases above, which observe what the reader
    // *returns* rather than what the mirror contains.
    //
    // What it does pin is narrower and still worth having: a declined read leaves the mirror
    // alone rather than mutating it. Asserted on a *different* fixture id than the one just
    // queried, so it does not also forbid evicting the row the database denied — which was one
    // option for the outage case, settled instead by
    // `tasks/decisions/2026-10-27-fixture-animals-are-display-only-during-an-outage.md`.
    const mirror = getServerPets();
    expect(mirror.length).toBeGreaterThan(0);
    expect(mirror.some((p) => p.id === "pet-002")).toBe(true);
  });

  it("still falls back to the mirror when the query fails", async () => {
    // `handlePersistenceError` rethrows under STRICT_PERSISTENCE, which the integration
    // project sets; the fallback only runs with it off. `persistenceMode` reads both flags
    // per call precisely so this works on an already-imported module. DATABASE_URL has to be
    // stubbed truthy too, or `isDatabasePersistent()` is false and the query never runs.
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
    double.pet.findUnique.mockRejectedValue(new Error("connection refused"));
    const { findServerPetByIdAsync } = await import("@/lib/server/petRepository");

    const pet = await findServerPetByIdAsync(FIXTURE_ID);

    expect(pet).toMatchObject({ id: FIXTURE_ID, name: FIXTURE_NAME });
    expect(double.pet.findUnique).toHaveBeenCalled();
  });

  it("serves the mirror without querying when no database is configured", async () => {
    // The app is designed to run with no database at all; that path must keep its fixtures.
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "");
    const { findServerPetByIdAsync } = await import("@/lib/server/petRepository");

    const pet = await findServerPetByIdAsync(FIXTURE_ID);

    expect(pet).toMatchObject({ id: FIXTURE_ID, name: FIXTURE_NAME });
    expect(double.pet.findUnique).not.toHaveBeenCalled();
  });

  it("propagates the failure instead of falling back under strict persistence", async () => {
    // The property this tier exists for: a broken query must not be absorbed and reported
    // as a healthy read of fixture data.
    double.pet.findUnique.mockRejectedValue(new Error('relation "pets" does not exist'));
    const { findServerPetByIdAsync } = await import("@/lib/server/petRepository");

    await expect(findServerPetByIdAsync(FIXTURE_ID)).rejects.toThrow(/relation "pets"/);
  });

  it("still returns the row the database does hold", async () => {
    // The guard is about absence, so it must not have cost the present case anything.
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: "Persisted Bella" }));
    const { findServerPetByIdAsync } = await import("@/lib/server/petRepository");

    expect(await findServerPetByIdAsync(FIXTURE_ID)).toMatchObject({
      id: FIXTURE_ID,
      name: "Persisted Bella",
    });
  });
});

describe("the public callers do not serve or bill demo data", () => {
  it("404s a profile the database does not hold", async () => {
    double.pet.findUnique.mockResolvedValue(null);
    const { getPetById } = await import("@/actions/pets");

    // `/pets` already omits this animal — `getServerPetsAsync` returns whatever the database
    // returned — so serving it here made it reachable by direct link and nowhere else.
    expect(await getPetById(FIXTURE_ID)).toBeNull();
  });

  it("still refuses a case-variant of a fixture id on both mirror routes", async () => {
    // Coverage this branch would otherwise have destroyed. `getPetById`'s exact-id guard was
    // pinned by `softDeleteFiltering.test.ts` ("does not serve an archived animal through a
    // case-variant of its id"), which arranges `findUnique` to resolve null for `PET-001`.
    // Against the reader *this branch ships*, that arrangement never reaches the mirror — the
    // repository returns null straight from the empty read — so the guard stops being the thing
    // that refuses the request. Deleting `pet.id !== requested` left the entire integration
    // project green, which is how a guard gets removed by a later cleanup with CI agreeing.
    //
    // These two arrangements take the routes where the mirror really does answer, and where its
    // lookup lowercases `PET-001` into fixture `pet-001`.
    const { getPetById } = await import("@/actions/pets");

    // Route 1: no database configured at all.
    vi.stubEnv("STRICT_PERSISTENCE", "false");
    vi.stubEnv("DATABASE_URL", "");
    expect(await getPetById("PET-001")).toBeNull();
    expect(double.pet.findUnique).not.toHaveBeenCalled();

    // Route 2: a non-strict outage, where the `catch` hands back the mirror.
    vi.stubEnv("DATABASE_URL", "postgresql://itest/unreachable");
    double.pet.findUnique.mockRejectedValue(new Error("connection refused"));
    expect(await getPetById("Pet-001")).toBeNull();

    // The discriminator. Without it, a reader that refused *everything* on these routes would
    // pass the two assertions above, and deleting the guard would still fail nothing. The
    // canonical spelling resolving here proves the route works and that the guard alone is
    // what refuses the variants.
    expect(await getPetById("pet-001")).toMatchObject({ id: FIXTURE_ID, name: FIXTURE_NAME });
  });

  it("refuses a sponsorship for an animal the database does not hold", async () => {
    double.pet.findUnique.mockResolvedValue(null);
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction({
      petId: FIXTURE_ID,
      petName: FIXTURE_NAME,
      sponsorName: "Integration Sponsor",
      sponsorEmail: "sponsor.missing@example.test",
      amountMYR: 50,
    });

    expect(result.success).toBe(false);
    // The assertion that names the defect: money must not be pledged against a demo animal.
    expect(ledger.recordSponsorshipPledge).not.toHaveBeenCalled();
  });

  it("records a sponsorship against the name the database holds", async () => {
    // Positive control for the test above — without it, a checkout that failed for any
    // unrelated reason (rate limit, payment gate, schema) would read as the guard working.
    double.pet.findUnique.mockResolvedValue(makeDbPet({ id: FIXTURE_ID, name: "Persisted Bella" }));
    const ledger = await import("@/lib/server/sponsorshipLedger");
    const { createPetSponsorshipAction } = await import("@/actions/sponsorships");

    const result = await createPetSponsorshipAction({
      petId: FIXTURE_ID,
      petName: FIXTURE_NAME,
      sponsorName: "Integration Sponsor",
      sponsorEmail: "sponsor.present@example.test",
      amountMYR: 50,
    });

    expect(result.success).toBe(true);
    // The submitted `petName` is supporter-supplied; the recorded one comes from the row.
    expect(ledger.recordSponsorshipPledge).toHaveBeenCalledWith(
      expect.objectContaining({ petId: FIXTURE_ID, petName: "Persisted Bella" })
    );
  });
});
