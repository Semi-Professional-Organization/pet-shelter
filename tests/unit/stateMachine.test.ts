import { describe, it, expect } from "vitest";
import {
  APPLICATION_TRANSITION_GRAPH,
  PET_TRANSITION_GRAPH,
  DomainValidationError,
  validateApplicationTransition,
  validatePetTransition,
  normalizePetStatus,
  getAllowedPetStatusTransitions,
} from "@/lib/domain/stateMachine";
import { ApplicationStatus } from "@/types/application";
import { PetStatus } from "@/types/pet";

describe("State Machine Domain Logic", () => {
  describe("Adoption Application State Transitions", () => {
    const ALL_APPLICATION_STATUSES: ApplicationStatus[] = [
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
    ];

    it("should allow no-op self transitions without throwing", () => {
      for (const status of ALL_APPLICATION_STATUSES) {
        expect(() => validateApplicationTransition(status, status)).not.toThrow();
      }
    });

    describe("Valid Application Transitions", () => {
      it("should allow SUBMITTED -> UNDER_REVIEW and SUBMITTED -> REJECTED", () => {
        expect(() => validateApplicationTransition("SUBMITTED", "UNDER_REVIEW")).not.toThrow();
        expect(() => validateApplicationTransition("SUBMITTED", "REJECTED")).not.toThrow();
      });

      it("should allow UNDER_REVIEW -> APPROVED, REJECTED, and SUBMITTED", () => {
        expect(() => validateApplicationTransition("UNDER_REVIEW", "APPROVED")).not.toThrow();
        expect(() => validateApplicationTransition("UNDER_REVIEW", "REJECTED")).not.toThrow();
        expect(() => validateApplicationTransition("UNDER_REVIEW", "SUBMITTED")).not.toThrow();
      });

      it("should allow APPROVED -> UNDER_REVIEW (re-evaluation)", () => {
        expect(() => validateApplicationTransition("APPROVED", "UNDER_REVIEW")).not.toThrow();
      });

      it("should allow REJECTED -> UNDER_REVIEW (appeal / re-evaluation)", () => {
        expect(() => validateApplicationTransition("REJECTED", "UNDER_REVIEW")).not.toThrow();
      });
    });

    describe("Invalid Application Transitions", () => {
      it("should reject SUBMITTED -> APPROVED (cannot bypass review)", () => {
        expect(() => validateApplicationTransition("SUBMITTED", "APPROVED")).toThrow(
          DomainValidationError
        );
        expect(() => validateApplicationTransition("SUBMITTED", "APPROVED")).toThrow(
          /Illegal status transition: Cannot change application from 'SUBMITTED' to 'APPROVED'/
        );
      });

      it("should reject APPROVED -> SUBMITTED and APPROVED -> REJECTED", () => {
        expect(() => validateApplicationTransition("APPROVED", "SUBMITTED")).toThrow(
          DomainValidationError
        );
        expect(() => validateApplicationTransition("APPROVED", "REJECTED")).toThrow(
          DomainValidationError
        );
      });

      it("should reject REJECTED -> APPROVED and REJECTED -> SUBMITTED", () => {
        expect(() => validateApplicationTransition("REJECTED", "APPROVED")).toThrow(
          DomainValidationError
        );
        expect(() => validateApplicationTransition("REJECTED", "SUBMITTED")).toThrow(
          DomainValidationError
        );
      });
    });

    describe("Full 4x4 Cartesian Permutation Matrix Verification", () => {
      it("should correctly validate all 16 state transition permutations against APPLICATION_TRANSITION_GRAPH", () => {
        for (const current of ALL_APPLICATION_STATUSES) {
          for (const next of ALL_APPLICATION_STATUSES) {
            const isSelf = current === next;
            const isAllowedInGraph = APPLICATION_TRANSITION_GRAPH[current]?.includes(next) ?? false;
            const shouldPass = isSelf || isAllowedInGraph;

            if (shouldPass) {
              expect(
                () => validateApplicationTransition(current, next),
                `Expected transition ${current} -> ${next} to be valid`
              ).not.toThrow();
            } else {
              expect(
                () => validateApplicationTransition(current, next),
                `Expected transition ${current} -> ${next} to be invalid`
              ).toThrow(DomainValidationError);
            }
          }
        }
      });
    });

    describe("Edge Cases & Unknown Statuses", () => {
      it("should throw DomainValidationError for unknown source or destination states", () => {
        expect(() =>
          validateApplicationTransition("UNKNOWN_STATUS" as ApplicationStatus, "APPROVED")
        ).toThrow(DomainValidationError);

        expect(() =>
          validateApplicationTransition("SUBMITTED", "NON_EXISTENT_STATE" as ApplicationStatus)
        ).toThrow(DomainValidationError);
      });
    });
  });

  describe("Pet State Transitions", () => {
    const ALL_PET_STATUSES: PetStatus[] = ["Available", "Pending", "Adopted"];

    it("should allow no-op self transitions without throwing", () => {
      for (const status of ALL_PET_STATUSES) {
        expect(() => validatePetTransition(status, status)).not.toThrow();
      }
    });

    describe("Valid Pet Transitions", () => {
      it("should allow Available -> Pending and Available -> Adopted", () => {
        expect(() => validatePetTransition("Available", "Pending")).not.toThrow();
        expect(() => validatePetTransition("Available", "Adopted")).not.toThrow();
      });

      it("should allow Pending -> Available and Pending -> Adopted", () => {
        expect(() => validatePetTransition("Pending", "Available")).not.toThrow();
        expect(() => validatePetTransition("Pending", "Adopted")).not.toThrow();
      });

      it("should allow Adopted -> Available (pet returned to shelter)", () => {
        expect(() => validatePetTransition("Adopted", "Available")).not.toThrow();
      });
    });

    describe("Rehabilitation Transitions", () => {
      it("should allow an animal to enter rehabilitation from Available or Pending", () => {
        expect(() => validatePetTransition("Available", "In Rehabilitation")).not.toThrow();
        expect(() => validatePetTransition("Pending", "In Rehabilitation")).not.toThrow();
      });

      it("should allow In Rehabilitation -> Available on veterinary clearance", () => {
        expect(() => validatePetTransition("In Rehabilitation", "Available")).not.toThrow();
      });

      it("should reject adopting or reserving an animal still in rehabilitation", () => {
        expect(() => validatePetTransition("In Rehabilitation", "Adopted")).toThrow(
          DomainValidationError
        );
        expect(() => validatePetTransition("In Rehabilitation", "Pending")).toThrow(
          DomainValidationError
        );
      });

      it("should treat 'Rehabilitation' as an alias of 'In Rehabilitation'", () => {
        expect(normalizePetStatus("Rehabilitation")).toBe("In Rehabilitation");
        expect(() => validatePetTransition("Rehabilitation", "In Rehabilitation")).not.toThrow();
        expect(() => validatePetTransition("In Rehabilitation", "Rehabilitation")).not.toThrow();
        expect(() => validatePetTransition("Rehabilitation", "Available")).not.toThrow();
        expect(() => validatePetTransition("Rehabilitation", "Adopted")).toThrow(
          DomainValidationError
        );
      });
    });

    describe("Invalid Pet Transitions", () => {
      it("should reject Adopted -> Pending directly", () => {
        expect(() => validatePetTransition("Adopted", "Pending")).toThrow(DomainValidationError);
        expect(() => validatePetTransition("Adopted", "Pending")).toThrow(
          /Illegal pet status transition: Cannot change pet from 'Adopted' to 'Pending'/
        );
      });
    });

    describe("Full 3x3 Cartesian Permutation Matrix Verification", () => {
      it("should correctly validate all 9 pet transition permutations against PET_TRANSITION_GRAPH", () => {
        for (const current of ALL_PET_STATUSES) {
          for (const next of ALL_PET_STATUSES) {
            const isSelf = current === next;
            const isAllowedInGraph = PET_TRANSITION_GRAPH[current]?.includes(next) ?? false;
            const shouldPass = isSelf || isAllowedInGraph;

            if (shouldPass) {
              expect(
                () => validatePetTransition(current, next),
                `Expected pet transition ${current} -> ${next} to be valid`
              ).not.toThrow();
            } else {
              expect(
                () => validatePetTransition(current, next),
                `Expected pet transition ${current} -> ${next} to be invalid`
              ).toThrow(DomainValidationError);
            }
          }
        }
      });
    });

    describe("Edge Cases & Unknown Statuses", () => {
      it("should throw DomainValidationError when moving to an unknown pet status", () => {
        expect(() =>
          validatePetTransition("Available", "Lost" as PetStatus)
        ).toThrow(DomainValidationError);
        expect(() =>
          validatePetTransition("Fostered" as PetStatus, "Lost" as PetStatus)
        ).toThrow(DomainValidationError);
      });

      it("lets staff correct an unknown stored status to any canonical one", () => {
        // A row read with a status the domain does not know is refused for adoption. Without a
        // way out it would stay refused for good, so every canonical status is a legal move.
        for (const to of ["Available", "Pending", "Adopted", "In Rehabilitation"] as PetStatus[]) {
          expect(() => validatePetTransition("Fostered" as PetStatus, to)).not.toThrow();
        }
        expect(getAllowedPetStatusTransitions("Fostered" as PetStatus)).toEqual([
          "Fostered",
          "Available",
          "Pending",
          "Adopted",
          "In Rehabilitation",
        ]);
      });
    });
  });
});

describe("getAllowedPetStatusTransitions", () => {
  // A status control has to be able to show the animal's current state, or a controlled
  // <select> renders whichever option happens to come first — reading, for a rehab
  // animal, as "Available".
  it("leads with the animal's current status", () => {
    expect(getAllowedPetStatusTransitions("Adopted")[0]).toBe("Adopted");
  });

  it("offers rehabilitation as a move out of Available and Pending", () => {
    expect(getAllowedPetStatusTransitions("Available")).toContain("In Rehabilitation");
    expect(getAllowedPetStatusTransitions("Pending")).toContain("In Rehabilitation");
  });

  // Veterinary clearance back to Available is the only way out of care — an animal under
  // treatment must not be adoptable straight from the table.
  it("offers only Available out of rehabilitation", () => {
    expect(getAllowedPetStatusTransitions("In Rehabilitation")).toEqual([
      "In Rehabilitation",
      "Available",
    ]);
  });

  it("returns the canonical spelling for an animal stored under the legacy alias", () => {
    expect(getAllowedPetStatusTransitions("Rehabilitation")).toEqual(
      getAllowedPetStatusTransitions("In Rehabilitation")
    );
  });

  it("omits transitions the graph forbids", () => {
    expect(getAllowedPetStatusTransitions("Adopted")).not.toContain("Pending");
  });

  // Whatever a control offers must survive validation, or staff pick a move the server
  // silently rejects while the optimistic UI keeps showing it.
  it("only offers moves that validatePetTransition accepts", () => {
    const statuses: PetStatus[] = ["Available", "Pending", "Adopted", "In Rehabilitation", "Rehabilitation"];
    for (const from of statuses) {
      for (const to of getAllowedPetStatusTransitions(from)) {
        expect(() => validatePetTransition(from, to)).not.toThrow();
      }
    }
  });
});
