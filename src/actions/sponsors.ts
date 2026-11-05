"use server";

import {
  sponsorRegistrationSchema,
  sponsorLoginSchema,
  wallPreferenceSchema,
  SponsorRegistrationInput,
  SponsorLoginInput,
} from "@/lib/validations/sponsor";
import { pledgeRefSchema } from "@/lib/validations/sponsorship";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { checkAddressRateLimit } from "@/lib/security/clientAddress";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import {
  setSponsorSessionCookie,
  clearSponsorSessionCookie,
  getCurrentSponsorSession,
} from "@/lib/security/sponsorSession";
import {
  findSponsorByEmail,
  createSponsor,
  setSponsorWallPreference,
} from "@/lib/server/sponsorRepository";
import {
  listSponsorshipsByEmail,
  claimSponsorshipsForUser,
  cancelSponsorshipForUser,
} from "@/lib/server/sponsorshipLedger";
import { seedOfflineSponsorships } from "@/lib/server/sponsorDemoSeed";
import {
  getSponsorDashboard,
  currentSponsorMeetsTier,
  getCurrentSupporterTier,
} from "@/lib/domain/sponsorAccess";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { assertAuthorized, ROLES } from "@/lib/security/rbac";
import { sendCaretakerQuestionEmail } from "@/lib/email";
import { tierLabel } from "@/lib/domain/supporterTier";
import { SponsorDashboardDTO } from "@/types/supporter";

export interface SponsorAuthResponse {
  success: boolean;
  error?: string;
  /** Number of historical contributions attached to the new account. */
  linkedContributions?: number;
}

/**
 * Registers a sponsor account and claims their giving history.
 *
 * The receipt-number challenge is the whole point of this action: contributions are keyed
 * by donor email, so without proof that the registrant holds a receipt issued to that
 * address, anyone could register `someone-else@example.com` and inherit their standing,
 * their sponsored rescues and their Gold-tier media.
 *
 * Deliberately does not reuse `loginAction` from `@/actions/auth`, which accepts the
 * literal password "1234" for any account.
 */
export async function registerSponsorAction(
  input: SponsorRegistrationInput
): Promise<SponsorAuthResponse> {
  let parsed;
  try {
    parsed = sponsorRegistrationSchema.parse(input);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Invalid registration details.",
    };
  }

  // The email is the caller's to choose, so it bounds nothing on its own: a
  // script varying the address draws a fresh five-per-five-minutes budget on
  // every request. Same window here, keyed on something the caller does not
  // pick.
  const addressLimit = await checkAddressRateLimit("sponsor-register", 10, 300000);
  if (addressLimit.limited) {
    return {
      success: false,
      error: `Too many registration attempts. Please wait ${addressLimit.retryAfterSeconds}s before trying again.`,
    };
  }

  const rateLimit = checkRateLimit(`sponsor-register:${parsed.email}`, 5, 300000);
  if (!rateLimit.success) {
    return {
      success: false,
      error: `Too many registration attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
    };
  }


  await seedOfflineSponsorships();
  const ownCommitments = await listSponsorshipsByEmail(parsed.email);

  // The receipt number, not the pledge reference, and only from an ACTIVE commitment.
  //
  // Matching the email alone proves nothing: sponsorship checkout is public and hands
  // the caller back the `pledgeRef` it just minted, so an attacker could pledge RM 10 as
  // victim@example.com and quote it here to claim the victim's history, standing and
  // gated media. A receipt number is only assigned when a coordinator reconciles the
  // payment — an act the claimant cannot perform — which is what breaks that chain.
  const isClaimable = ownCommitments.some(
    (commitment) =>
      commitment.status === "ACTIVE" &&
      commitment.receiptNumber?.toUpperCase() === parsed.receiptNumber
  );

  // One message for every rejection reason, so the form cannot be used to enumerate which
  // receipt numbers exist or which of them have been reconciled.
  if (!isClaimable) {
    recordAuditLog({
      actorId: "sponsor_public",
      actorEmail: parsed.email,
      actorRole: "SPONSOR",
      action: "SPONSOR_REGISTER_FAILED",
      entity: "Sponsor",
      entityId: parsed.email,
      details: { reason: "Receipt number did not match this email address" },
    });
    return {
      success: false,
      error:
        "That donation reference does not match this email address. Check the acknowledgement email we sent you when your transfer was confirmed.",
    };
  }

  // Checked only *after* the receipt challenge, so the form is not an account-existence
  // oracle for anyone who has not already proved they hold a confirmed receipt.
  if (await findSponsorByEmail(parsed.email)) {
    return {
      success: false,
      error: "A sponsor account already exists for this email. Please sign in instead.",
    };
  }

  // Sponsor Wall consent given at checkout seeds the default, but the registrant's own
  // choice wins. OR-ing the two would make consent sticky: a donor who ticked the box at
  // checkout and deliberately unticks it here would still be published.
  const consentedAtCheckout = ownCommitments.some((c) => c.displayOnWall);
  const displayOnWall = input.displayOnWall === undefined
    ? consentedAtCheckout
    : parsed.displayOnWall;

  const passwordHash = await hashPassword(parsed.password);
  const sponsor = await createSponsor({
    email: parsed.email,
    name: parsed.name,
    passwordHash,
    displayOnWall,
  });

  const linkedContributions = await claimSponsorshipsForUser(sponsor.id, sponsor.email);

  await setSponsorSessionCookie({
    sponsorId: sponsor.id,
    email: sponsor.email,
    name: sponsor.name,
  });

  recordAuditLog({
    actorId: sponsor.id,
    actorEmail: sponsor.email,
    actorRole: "SPONSOR",
    action: "SPONSOR_REGISTERED",
    entity: "Sponsor",
    entityId: sponsor.id,
    details: { linkedContributions, displayOnWall: sponsor.displayOnWall },
  });

  return { success: true, linkedContributions };
}

export async function sponsorLoginAction(
  input: SponsorLoginInput
): Promise<SponsorAuthResponse> {
  let parsed;
  try {
    parsed = sponsorLoginSchema.parse(input);
  } catch {
    return { success: false, error: "Please enter your email address and password." };
  }

  // Per address as well as per account. The email key bounds how hard one
  // sponsor can be attacked and cannot see the attack that works against a
  // directory: one common password tried once against every address in turn,
  // which never spends a second attempt on any single key.
  const addressLimit = await checkAddressRateLimit("sponsor-login", 20, 60000);
  if (addressLimit.limited) {
    return {
      success: false,
      error: `Too many sign-in attempts. Please wait ${addressLimit.retryAfterSeconds}s before trying again.`,
    };
  }

  const rateLimit = checkRateLimit(`sponsor-login:${parsed.email}`, 5, 60000);
  if (!rateLimit.success) {
    return {
      success: false,
      error: `Too many sign-in attempts. Please wait ${rateLimit.retryAfterSeconds}s before trying again.`,
    };
  }

  const sponsor = await findSponsorByEmail(parsed.email);
  const isValid = sponsor
    ? await verifyPassword(parsed.password, sponsor.passwordHash)
    : false;

  if (!sponsor || !isValid) {
    recordAuditLog({
      actorId: "sponsor_public",
      actorEmail: parsed.email,
      actorRole: "SPONSOR",
      action: "SPONSOR_LOGIN_FAILED",
      entity: "Sponsor",
      entityId: parsed.email,
      details: { reason: "Invalid email or password" },
    });
    return { success: false, error: "Invalid email address or password." };
  }

  await setSponsorSessionCookie({
    sponsorId: sponsor.id,
    email: sponsor.email,
    name: sponsor.name,
  });

  recordAuditLog({
    actorId: sponsor.id,
    actorEmail: sponsor.email,
    actorRole: "SPONSOR",
    action: "SPONSOR_LOGIN_SUCCESS",
    entity: "Sponsor",
    entityId: sponsor.id,
    details: {},
  });

  return { success: true };
}

export async function sponsorLogoutAction(): Promise<{ success: boolean }> {
  const session = await getCurrentSponsorSession();
  await clearSponsorSessionCookie();

  if (session) {
    recordAuditLog({
      actorId: session.sponsorId,
      actorEmail: session.email,
      actorRole: "SPONSOR",
      action: "SPONSOR_LOGOUT",
      entity: "Sponsor",
      entityId: session.sponsorId,
      details: {},
    });
  }

  return { success: true };
}

/** Toggles the signed-in sponsor's public wall opt-in. Never accepts a sponsor id. */
export async function updateWallPreferenceAction(
  displayOnWall: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentSponsorSession();
  if (!session) {
    return { success: false, error: "Please sign in to change your Sponsor Wall setting." };
  }

  const parsed = wallPreferenceSchema.safeParse({ displayOnWall });
  if (!parsed.success) {
    return { success: false, error: "Invalid Sponsor Wall preference." };
  }

  const stored = await setSponsorWallPreference(
    session.sponsorId,
    parsed.data.displayOnWall
  );
  if (!stored) {
    return {
      success: false,
      error: "Could not save your Sponsor Wall setting. Please try again.",
    };
  }

  recordAuditLog({
    actorId: session.sponsorId,
    actorEmail: session.email,
    actorRole: "SPONSOR",
    action: "SPONSOR_WALL_PREFERENCE_UPDATED",
    entity: "Sponsor",
    entityId: session.sponsorId,
    details: { displayOnWall },
  });

  // No revalidation needed: /sponsors is force-dynamic and /sponsor/dashboard reads
  // cookies, so both already re-render per request.

  return { success: true };
}

/** Server-side read of the signed-in sponsor's dashboard projection. */
export async function getSponsorDashboardAction(): Promise<SponsorDashboardDTO | null> {
  return getSponsorDashboard();
}

/**
 * Lets a sponsor cancel their own recurring pledge.
 *
 * The standing follows immediately, because an annualised monthly pledge is recognised on
 * the strength of the commitment continuing. Scoped to the session's sponsor id, so the
 * receipt number in the request cannot reach anyone else's ledger.
 */
export async function cancelRecurringPledgeAction(
  pledgeRef: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentSponsorSession();
  if (!session) {
    return { success: false, error: "Please sign in to manage your pledges." };
  }

  const ref = pledgeRefSchema.safeParse(pledgeRef);
  if (!ref.success) {
    return { success: false, error: "No sponsorship found for that pledge reference." };
  }

  const cancelled = await cancelSponsorshipForUser(session.sponsorId, ref.data);
  if (!cancelled) {
    return {
      success: false,
      error: "No active recurring pledge of yours matches that pledge reference.",
    };
  }

  recordAuditLog({
    actorId: session.sponsorId,
    actorEmail: session.email,
    actorRole: "SPONSOR",
    action: "RECURRING_PLEDGE_CANCELLED",
    entity: "SponsorContribution",
    entityId: cancelled.pledgeRef,
    details: { amountSen: cancelled.amountSen, petName: cancelled.petName },
  });

  return { success: true };
}

/**
 * Gold perk: a direct question to the sanctuary caretakers.
 *
 * Re-checks the standing here rather than trusting that `<TierGate requiredTier="GOLD">`
 * rendered the form. A Server Action is a public HTTP endpoint — anything that only the
 * UI stops an unauthorized caller from doing, it does not stop at all.
 */
export async function submitCaretakerQuestionAction(
  message: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentSponsorSession();
  if (!session) {
    return { success: false, error: "Please sign in to message the caretakers." };
  }

  if (!(await currentSponsorMeetsTier("GOLD"))) {
    return {
      success: false,
      error: "The caretaker Q&A is a Gold sponsorship privilege.",
    };
  }

  const trimmed = message.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) {
    return {
      success: false,
      error: "Please write between 10 and 2,000 characters.",
    };
  }

  const rateLimit = checkRateLimit(`caretaker-qa:${session.sponsorId}`, 5, 3600000);
  if (!rateLimit.success) {
    return {
      success: false,
      error: `You have reached the hourly message limit. Please try again in ${rateLimit.retryAfterSeconds}s.`,
    };
  }

  // The message itself is retained, not just its length: if the email dispatch fails it
  // is the only remaining record, and the sponsor has already been told it was sent.
  recordAuditLog({
    actorId: session.sponsorId,
    actorEmail: session.email,
    actorRole: "SPONSOR",
    action: "CARETAKER_QUESTION_SUBMITTED",
    entity: "Sponsor",
    entityId: session.sponsorId,
    details: { message: trimmed, messageLength: trimmed.length },
  });

  // Non-blocking, matching the donation receipt dispatch: a slow mail provider must not
  // hold the sponsor's request open.
  sendCaretakerQuestionEmail({
    sponsorName: session.name,
    sponsorEmail: session.email,
    tier: tierLabel(await getCurrentSupporterTier()),
    message: trimmed,
  }).catch((err) => console.error("[Caretaker Question Dispatch Failed]", err));

  return { success: true };
}
