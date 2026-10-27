/**
 * A public form can prove whether its own record was written, but external QR
 * and bank rails are outside that transaction. Failure copy must therefore say
 * what the application knows without claiming that no transfer occurred.
 */
export const DONATION_RECORDING_FAILURE_MESSAGE =
  "We could not record your gift, so no receipt was issued. If you already sent a transfer, contact the shelter with your bank reference before trying again.";

export const SPONSORSHIP_RECORDING_FAILURE_MESSAGE =
  "We could not record your sponsorship, so no pledge was recorded. If you already sent a transfer, contact the shelter with your bank reference before trying again.";

export const DONATION_RECORDING_UNCONFIRMED_MESSAGE =
  "We could not confirm that a receipt was issued. If you already sent a transfer, contact the shelter with your bank reference before trying again.";

export const SPONSORSHIP_RECORDING_UNCONFIRMED_MESSAGE =
  "We could not confirm that a pledge was recorded. If you already sent a transfer, contact the shelter with your bank reference before trying again.";

/**
 * Checkout refused before writing anything because the animal is not one it can take a
 * pledge for. The supporter may already have paid from the QR, so these keep the same
 * bank-reference advice rather than claiming nothing was charged.
 */
export const SPONSORSHIP_ANIMAL_NOT_FOUND_MESSAGE =
  "We could not find that animal, so no pledge was recorded. Please choose one from the sponsorship page. If you already sent a transfer, contact the shelter with your bank reference.";

export function sponsorshipAnimalUnavailableMessage(petName: string): string {
  return `${petName} is no longer available for sponsorship, so no pledge was recorded. If you already sent a transfer, contact the shelter with your bank reference.`;
}

const UNVERIFIABLE_NO_CHARGE_CLAIM = /nothing has been charged/i;

export function safeContributionFailureMessage(
  error: string | undefined,
  fallback: string,
): string {
  return error && !UNVERIFIABLE_NO_CHARGE_CLAIM.test(error) ? error : fallback;
}
