import { describe, it, expect } from "vitest";
import {
  validatePetTransition,
  getAllowedPetStatusTransitions,
  DomainValidationError,
} from "@/lib/domain/stateMachine";

describe("Target P9: Admin Status Write-back & Transition Constraints", () => {
  describe("State Transition Guards (stateMachine.ts)", () => {
    it("permits legal pet status transitions", () => {
      expect(() => validatePetTransition("Available", "Pending")).not.toThrow();
      expect(() => validatePetTransition("Available", "Adopted")).not.toThrow();
      expect(() => validatePetTransition("Available", "In Rehabilitation")).not.toThrow();
      expect(() => validatePetTransition("Pending", "Adopted")).not.toThrow();
      expect(() => validatePetTransition("In Rehabilitation", "Available")).not.toThrow();
      expect(() => validatePetTransition("Adopted", "Available")).not.toThrow();
    });

    it("rejects illegal transitions that bypass required workflow", () => {
      // Adopted animals cannot directly transition to Pending without first returning to shelter (Available)
      expect(() => validatePetTransition("Adopted", "Pending")).toThrow(DomainValidationError);
      expect(() => validatePetTransition("Adopted", "In Rehabilitation")).toThrow(DomainValidationError);

      // Animals in rehabilitation cannot be adopted directly without veterinary clearance to Available
      expect(() => validatePetTransition("In Rehabilitation", "Adopted")).toThrow(DomainValidationError);
      expect(() => validatePetTransition("In Rehabilitation", "Pending")).toThrow(DomainValidationError);
      expect(() => validatePetTransition("Rehabilitation", "Adopted")).toThrow(DomainValidationError);
    });

    it("getAllowedPetStatusTransitions restricts options for Adopted animals", () => {
      const allowed = getAllowedPetStatusTransitions("Adopted");
      expect(allowed).toContain("Adopted");
      expect(allowed).toContain("Available");
      expect(allowed).not.toContain("Pending");
      expect(allowed).not.toContain("In Rehabilitation");
    });

    it("getAllowedPetStatusTransitions restricts options for In Rehabilitation animals", () => {
      const canonicalAllowed = getAllowedPetStatusTransitions("In Rehabilitation");
      expect(canonicalAllowed).toEqual(["In Rehabilitation", "Available"]);

      const aliasAllowed = getAllowedPetStatusTransitions("Rehabilitation");
      expect(aliasAllowed).toEqual(["In Rehabilitation", "Available"]);
    });

    it("getAllowedPetStatusTransitions offers full paths for Available animals", () => {
      const allowed = getAllowedPetStatusTransitions("Available");
      expect(allowed).toEqual(["Available", "Pending", "Adopted", "In Rehabilitation"]);
    });
  });
});
