import { ApplicationStatus } from "@/types/application";
import { PetStatus } from "@/types/pet";

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

/**
 * Allowed state transitions for Adoption Applications.
 */
export const APPLICATION_TRANSITION_GRAPH: Record<ApplicationStatus, ApplicationStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "SUBMITTED"],
  APPROVED: ["UNDER_REVIEW"], // In case an approval needs re-evaluation
  REJECTED: ["UNDER_REVIEW"], // In case of appeal or updated references
};

/**
 * "Rehabilitation" is an alias of "In Rehabilitation": both denote an animal under
 * clinical or behavioural care and not yet cleared for adoption. Transitions are
 * always evaluated against the canonical value.
 */
const PET_STATUS_ALIASES: Record<PetStatus, PetStatus> = {
  Available: "Available",
  Pending: "Pending",
  Adopted: "Adopted",
  "In Rehabilitation": "In Rehabilitation",
  Rehabilitation: "In Rehabilitation",
};

/**
 * Resolves a pet status to its canonical form. Unknown values pass through unchanged
 * so that callers still fail on genuinely invalid input.
 */
export function normalizePetStatus(status: PetStatus): PetStatus {
  return isKnownPetStatus(status) ? PET_STATUS_ALIASES[status] : status;
}

/**
 * True for the five spellings the domain knows. A persisted status outside them reaches the
 * domain unchanged (see `fromDbPetStatus`), and every check that grants something must treat it
 * as refused, never as Available.
 */
export function isKnownPetStatus(status: string): status is PetStatus {
  return Object.hasOwn(PET_STATUS_ALIASES, status);
}


/**
 * Legal moves out of a status. An unrecognised status may move to any canonical one: that is how
 * staff correct a corrupt row, and with no way out the animal would be stuck refused forever.
 */
function transitionsFrom(from: PetStatus): PetStatus[] {
  if (!isKnownPetStatus(from)) {
    return (Object.keys(PET_STATUS_ALIASES) as PetStatus[]).filter((s) => PET_STATUS_ALIASES[s] === s);
  }
  return PET_TRANSITION_GRAPH[from].map(normalizePetStatus);
}

// Rehabilitating animals leave care only via veterinary clearance back to Available.
const REHAB_TRANSITIONS: PetStatus[] = ["Available"];

/**
 * Allowed state transitions for Pets.
 */
export const PET_TRANSITION_GRAPH: Record<PetStatus, PetStatus[]> = {
  Available: ["Pending", "Adopted", "In Rehabilitation"],
  Pending: ["Available", "Adopted", "In Rehabilitation"],
  Adopted: ["Available"], // Returned to shelter
  "In Rehabilitation": REHAB_TRANSITIONS,
  Rehabilitation: REHAB_TRANSITIONS, // Alias entry — mirrors "In Rehabilitation"
};

/**
 * Validates an adoption application state transition.
 * Throws DomainValidationError if the transition is illegal.
 */
export function validateApplicationTransition(current: ApplicationStatus, next: ApplicationStatus): void {
  if (current === next) return; // No-op transition is allowed

  const allowedNext = APPLICATION_TRANSITION_GRAPH[current] || [];
  if (!allowedNext.includes(next)) {
    throw new DomainValidationError(
      `Illegal status transition: Cannot change application from '${current}' to '${next}'. Allowed next states: [${allowedNext.join(", ")}]`
    );
  }
}

/**
 * Validates a pet status transition.
 * Throws DomainValidationError if the transition is illegal.
 */
export function validatePetTransition(current: PetStatus, next: PetStatus): void {
  const from = normalizePetStatus(current);
  const to = normalizePetStatus(next);
  if (from === to) return;

  const allowedNext = transitionsFrom(from);
  if (!allowedNext.includes(to)) {
    throw new DomainValidationError(
      `Illegal pet status transition: Cannot change pet from '${current}' to '${next}'. Allowed: [${allowedNext.join(", ")}]`
    );
  }
}

/**
 * The statuses a control may offer for an animal: its own canonical status first, then
 * every legal move out of it. Everything is normalized, so an animal stored under the
 * legacy `Rehabilitation` alias resolves to the same list as the canonical spelling and
 * the alias never appears as a separate choice.
 *
 * Deriving the options this way keeps `validatePetTransition` the single authority — a
 * control cannot offer a move the server would reject, which matters because
 * `updatePetStatus` returns `{ success: false }` rather than throwing, and the admin
 * table's optimistic update would otherwise keep displaying the refused state.
 */
export function getAllowedPetStatusTransitions(current: PetStatus): PetStatus[] {
  const from = normalizePetStatus(current);
  return [...new Set<PetStatus>([from, ...transitionsFrom(from)])];
}
