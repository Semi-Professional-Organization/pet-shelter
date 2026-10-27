import { describe, it, expect } from "vitest";
import { fromDbPetStatus, toDbPetStatus } from "@/lib/server/petMappers";
import { DomainValidationError, isKnownPetStatus } from "@/lib/domain/stateMachine";
import {
  buildPetStatusFilterOptions,
  getPetStatusPresentation,
  matchesStatusFilter,
} from "@/lib/presentation/petStatusPresentation";
import { PetStatus } from "@/types/pet";

/**
 * An unrecognised persisted status must never read as Available, the one status that grants an
 * adoption. `fromDbPetStatus` used to return "Available" for anything it did not match exactly,
 * so `adopted` in the wrong case made an animal who had gone home adoptable again.
 * `tasks/decisions/2026-10-27-an-unrecognised-pet-status-is-refused-not-available.md`.
 */
describe("fromDbPetStatus", () => {
  it.each([
    ["adopted", "Adopted"],
    ["ADOPTED", "Adopted"],
    [" Pending ", "Pending"],
    ["IN_REHABILITATION", "In Rehabilitation"],
    ["in rehabilitation", "In Rehabilitation"],
    ["Rehabilitation", "In Rehabilitation"],
    ["available", "Available"],
  ])("reads the drifted spelling %j as %s", (stored, expected) => {
    expect(fromDbPetStatus(stored)).toBe(expected);
  });

  it.each(["Fostered", "", "Avail able!", "constructor", "toString", "__proto__"])(
    "passes the unrecognised value %j through instead of reading it as Available",
    (stored) => {
      const status = fromDbPetStatus(stored);

      expect(status).toBe(stored);
      expect(isKnownPetStatus(status)).toBe(false);
      expect(getPetStatusPresentation(status).isAdoptable).toBe(false);
    }
  );

  it("labels an unrecognised value as what it is, not as Pending", () => {
    // The admin status control lists the row's own status beside every canonical one; labelling
    // the unknown value "Pending" showed two Pendings and hid the row staff need to correct.
    expect(getPetStatusPresentation("Fostered" as PetStatus).labelFallback).toBe("Fostered");
  });
});

describe("toDbPetStatus", () => {
  it("refuses an unrecognised status rather than writing it back as Available", () => {
    expect(() => toDbPetStatus("Fostered" as PetStatus)).toThrow(DomainValidationError);
    expect(() => toDbPetStatus("Fostered" as PetStatus)).toThrow(/not a recognised pet status/);
  });

  it("still writes the canonical statuses and the legacy alias", () => {
    expect(toDbPetStatus("Available")).toBe("Available");
    expect(toDbPetStatus("Rehabilitation")).toBe("In_Rehabilitation");
  });
});

describe("an unrecognised status in the status filter", () => {
  it("is found under the bucket that counts it", () => {
    const pets = [{ status: "Reserved" as PetStatus }, { status: "Pending" as PetStatus }];
    const pending = buildPetStatusFilterOptions(pets).find((o) => o.value === "Pending");

    expect(pending?.count).toBe(2);
    expect(pets.filter((p) => matchesStatusFilter(p.status, "Pending"))).toHaveLength(2);
    expect(matchesStatusFilter("Reserved" as PetStatus, "Available")).toBe(false);
  });

  it("matches nothing for a filter value that is not a status", () => {
    expect(matchesStatusFilter("Pending", "Reserved")).toBe(false);
  });
});
