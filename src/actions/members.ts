"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/security/dal";
import {
  ForbiddenError,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  UnauthorizedError,
  USER_STATUSES,
  statusForError,
} from "@/lib/security/rbac";
import { hashPassword } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { checkAddressRateLimit } from "@/lib/security/clientAddress";
import { recordAuditLog } from "@/lib/domain/auditLog";
import { sendStaffInvitationEmail } from "@/lib/email";
import { setSessionCookie, type SessionUser } from "@/lib/security/session";
import {
  INVITE_REDEMPTION_FAILED_MESSAGE,
  countActiveSuperAdmins,
  createInvitedMember,
  findMemberByEmail,
  findMemberById,
  listMemberRecords,
  reissueInvite,
  updateMemberRoleRecord,
  updateMemberStatusRecord,
  verifyInviteToken,
  activateInvitedMember,
  type MemberRecord,
} from "@/lib/server/memberStore";
import {
  acceptInvitationSchema,
  inviteMemberSchema,
  toggleMemberStatusSchema,
  updateMemberRoleSchema,
} from "@/lib/validations/member";
import type { CanonicalRole, UserStatus } from "@/lib/security/permissions";

const MEMBERS_PATH = "/admin/members";

/**
 * Every action returns a discriminated result rather than throwing.
 *
 * `status` carries the HTTP semantics the requirement asks for (403 for an
 * authenticated-but-underprivileged caller, 401 when signed out) without
 * forcing a navigation interrupt, which would be wrong inside a data table.
 * The route itself renders a real HTTP 403 via `forbidden()`.
 */
export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/** Prisma's unique-constraint violation. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Converts a thrown error into a client-safe result.
 *
 * Only the guard errors this module raises deliberately carry their message
 * outward — they are written for the operator. Anything else (a Prisma failure,
 * a connection error) gets the caller's fallback, because those messages embed
 * schema and query detail that has no business reaching a browser. The real
 * error still goes to the server log.
 */
function toFailure(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return { success: false, error: error.message, status: statusForError(error) };
  }

  if (isUniqueConstraintError(error)) {
    // Loses the race against a concurrent invite for the same address.
    return {
      success: false,
      error: "That email address already has a staff account.",
      status: 409,
    };
  }

  console.error("[members action]", error);
  return { success: false, error: fallback, status: 500 };
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Lists all staff accounts with role, status and last login.
 */
export async function listMembers(): Promise<ActionResult<MemberRecord[]>> {
  try {
    await requirePermission(PERMISSIONS.VIEW_MEMBERS);
    const members = await listMemberRecords();
    return { success: true, data: members, status: 200 };
  } catch (error) {
    return toFailure(error, "Failed to load staff members.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Invite                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates an INVITED staff account and dispatches an invitation email.
 *
 * The account exists immediately (so the roster shows it as pending) but holds
 * an unusable password until the recipient redeems the emailed token.
 */
export async function inviteMember(
  email: string,
  name: string,
  role: CanonicalRole
): Promise<ActionResult<MemberRecord>> {
  try {
    const actor = await requirePermission(PERMISSIONS.MANAGE_MEMBERS);

    const parsed = inviteMemberSchema.safeParse({ email, name, role });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation details.",
        status: 400,
      };
    }

    // Bound outbound mail and account creation per administrator.
    const limit = checkRateLimit(`invite-member:${actor.id}`, 10, 60_000);
    if (!limit.success) {
      return {
        success: false,
        error: `Too many invitations sent. Please wait ${limit.retryAfterSeconds} seconds.`,
        status: 429,
      };
    }

    const existing = await findMemberByEmail(parsed.data.email);
    if (existing) {
      return {
        success: false,
        error: `${parsed.data.email} already has a staff account (${existing.status.toLowerCase()}).`,
        status: 409,
      };
    }

    const { member, token, expiresAt } = await createInvitedMember({
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      invitedBy: actor.id,
    });

    const emailResult = await sendStaffInvitationEmail({
      email: member.email,
      name: member.name,
      roleLabel: ROLE_LABELS[member.role],
      roleDescription: ROLE_DESCRIPTIONS[member.role],
      token,
      expiresAt,
      invitedByName: actor.name,
      userId: member.id,
    });

    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "MEMBER_INVITED",
      entity: "User",
      entityId: member.id,
      details: {
        invitedEmail: member.email,
        invitedName: member.name,
        assignedRole: member.role,
        inviteExpiresAt: expiresAt.toISOString(),
        emailDispatched: emailResult.success,
        emailSimulated: Boolean(emailResult.simulated),
      },
    });

    revalidatePath(MEMBERS_PATH);

    if (!emailResult.success) {
      // The account is real and the invitation is resendable, so this is a
      // partial success, not a rollback.
      return {
        success: true,
        data: member,
        error: `Account created, but the invitation email failed to send (${emailResult.error}). Use "Resend Invitation".`,
        status: 201,
      };
    }

    return { success: true, data: member, status: 201 };
  } catch (error) {
    return toFailure(error, "Failed to invite staff member.");
  }
}

/**
 * Mints a fresh invitation token for a pending member and re-sends the email.
 * The previously issued link stops working immediately.
 */
export async function resendInvitation(userId: string): Promise<ActionResult<MemberRecord>> {
  try {
    const actor = await requirePermission(PERMISSIONS.MANAGE_MEMBERS);

    const target = await findMemberById(userId);
    if (!target) {
      return { success: false, error: "Staff member not found.", status: 404 };
    }
    if (target.status !== USER_STATUSES.INVITED) {
      return {
        success: false,
        error: "Only members with a pending invitation can be re-invited.",
        status: 409,
      };
    }

    const limit = checkRateLimit(`resend-invite:${userId}`, 3, 60_000);
    if (!limit.success) {
      return {
        success: false,
        error: `Invitation already re-sent. Please wait ${limit.retryAfterSeconds} seconds.`,
        status: 429,
      };
    }

    const { member, token, expiresAt } = await reissueInvite(userId);

    const emailResult = await sendStaffInvitationEmail({
      email: member.email,
      name: member.name,
      roleLabel: ROLE_LABELS[member.role],
      roleDescription: ROLE_DESCRIPTIONS[member.role],
      token,
      expiresAt,
      invitedByName: actor.name,
      userId: member.id,
    });

    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "MEMBER_INVITE_RESENT",
      entity: "User",
      entityId: member.id,
      details: {
        invitedEmail: member.email,
        inviteExpiresAt: expiresAt.toISOString(),
        emailDispatched: emailResult.success,
      },
    });

    revalidatePath(MEMBERS_PATH);

    if (!emailResult.success) {
      return {
        success: false,
        error: `Could not send the invitation email: ${emailResult.error}`,
        status: 502,
      };
    }

    return { success: true, data: member, status: 200 };
  } catch (error) {
    return toFailure(error, "Failed to resend invitation.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Role & status                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Changes a member's role. Restricted to holders of MANAGE_MEMBERS, which in
 * the shipped matrix means SUPER_ADMIN alone.
 *
 * Two lockouts are blocked outright: demoting yourself, and removing the last
 * active super admin. Either would leave the platform with no one able to
 * restore access.
 */
export async function updateMemberRole(
  userId: string,
  newRole: CanonicalRole
): Promise<ActionResult<MemberRecord>> {
  try {
    const actor = await requirePermission(PERMISSIONS.MANAGE_MEMBERS);

    const parsed = updateMemberRoleSchema.safeParse({ userId, newRole });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid role change.",
        status: 400,
      };
    }

    const target = await findMemberById(parsed.data.userId);
    if (!target) {
      return { success: false, error: "Staff member not found.", status: 404 };
    }

    if (target.role === parsed.data.newRole) {
      return { success: true, data: target, status: 200 };
    }

    if (target.id === actor.id && parsed.data.newRole !== "SUPER_ADMIN") {
      return {
        success: false,
        error: "You cannot remove your own Super Admin role. Ask another Super Admin to do it.",
        status: 409,
      };
    }

    // Currently unreachable, and kept deliberately: MANAGE_MEMBERS is held only
    // by SUPER_ADMIN and the DAL requires an ACTIVE row, so the actor is always
    // a second active Super Admin and the count is always >= 2. The lockout is
    // actually prevented by the self-demotion check above. This becomes the
    // load-bearing guard the moment MANAGE_MEMBERS is delegated to another role.
    if (target.role === "SUPER_ADMIN" && parsed.data.newRole !== "SUPER_ADMIN") {
      const remaining = await countActiveSuperAdmins();
      if (remaining <= 1) {
        return {
          success: false,
          error: "At least one active Super Admin must remain. Promote someone else first.",
          status: 409,
        };
      }
    }

    const updated = await updateMemberRoleRecord(parsed.data.userId, parsed.data.newRole);

    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "MEMBER_ROLE_CHANGED",
      entity: "User",
      entityId: updated.id,
      details: {
        memberEmail: updated.email,
        previousRole: target.role,
        newRole: updated.role,
      },
    });

    revalidatePath(MEMBERS_PATH);
    return { success: true, data: updated, status: 200 };
  } catch (error) {
    return toFailure(error, "Failed to update member role.");
  }
}

/**
 * Activates or suspends a member.
 *
 * Suspension takes effect on the suspended member's very next request, because
 * `getVerifiedSession()` re-reads status from the database rather than trusting
 * the 24-hour session cookie.
 */
export async function toggleMemberStatus(
  userId: string,
  status: UserStatus
): Promise<ActionResult<MemberRecord>> {
  try {
    const actor = await requirePermission(PERMISSIONS.MANAGE_MEMBERS);

    const parsed = toggleMemberStatusSchema.safeParse({ userId, status });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid status change.",
        status: 400,
      };
    }
    const nextStatus = parsed.data.status as UserStatus;

    const target = await findMemberById(parsed.data.userId);
    if (!target) {
      return { success: false, error: "Staff member not found.", status: 404 };
    }

    if (target.id === actor.id && nextStatus === USER_STATUSES.SUSPENDED) {
      return {
        success: false,
        error: "You cannot suspend your own account.",
        status: 409,
      };
    }

    // Unreachable for the same reason as the role guard above, and kept for the
    // same reason. See the note in updateMemberRole.
    if (
      nextStatus === USER_STATUSES.SUSPENDED &&
      target.role === "SUPER_ADMIN" &&
      target.status === USER_STATUSES.ACTIVE
    ) {
      const remaining = await countActiveSuperAdmins();
      if (remaining <= 1) {
        return {
          success: false,
          error: "At least one active Super Admin must remain. Promote someone else first.",
          status: 409,
        };
      }
    }

    // Reactivating someone who never redeemed their invitation would hand them
    // an active account with an unusable password and no way in.
    if (nextStatus === USER_STATUSES.ACTIVE && target.status === USER_STATUSES.INVITED) {
      return {
        success: false,
        error: "This member has not accepted their invitation yet. Resend it instead.",
        status: 409,
      };
    }

    const updated = await updateMemberStatusRecord(parsed.data.userId, nextStatus);

    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action:
        nextStatus === USER_STATUSES.SUSPENDED ? "MEMBER_SUSPENDED" : "MEMBER_REACTIVATED",
      entity: "User",
      entityId: updated.id,
      details: {
        memberEmail: updated.email,
        previousStatus: target.status,
        newStatus: updated.status,
        memberRole: updated.role,
      },
    });

    revalidatePath(MEMBERS_PATH);
    return { success: true, data: updated, status: 200 };
  } catch (error) {
    return toFailure(error, "Failed to update member status.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Invitation redemption (public)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Redeems a staff invitation: verifies the token, sets the chosen password,
 * activates the account and signs the new member in.
 *
 * Deliberately unauthenticated — the emailed token is the credential. Every
 * failure returns INVITE_REDEMPTION_FAILED_MESSAGE regardless of cause, so the
 * endpoint cannot be used to enumerate which staff emails exist; the real
 * reason is recorded in the audit log instead.
 */
export async function acceptInvitation(input: {
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<ActionResult<SessionUser>> {
  try {
    const parsed = acceptInvitationSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invitation details.",
        status: 400,
      };
    }

    // The emailed token is the credential here, and the email beside it is
    // supplied by whoever is calling — so the per-email budget below is reset
    // by varying the address, and the token is enumerable at five guesses per
    // minute per address tried. This budget is the one that actually bounds
    // redemption attempts, because its key is not the caller's to choose.
    const addressLimit = await checkAddressRateLimit("accept-invite", 15, 60_000);
    if (addressLimit.limited) {
      return {
        success: false,
        error: `Too many attempts. Please wait ${addressLimit.retryAfterSeconds} seconds.`,
        status: 429,
      };
    }

    const limit = checkRateLimit(`accept-invite:${parsed.data.email}`, 5, 60_000);
    if (!limit.success) {
      return {
        success: false,
        error: `Too many attempts. Please wait ${limit.retryAfterSeconds} seconds.`,
        status: 429,
      };
    }

    const verification = await verifyInviteToken(parsed.data.email, parsed.data.token);
    if (!verification.ok) {
      // The specific cause goes to the audit log; the caller gets one
      // indistinguishable message so this endpoint cannot be used to probe
      // which addresses have staff accounts or pending invitations.
      recordAuditLog({
        actorId: "anonymous",
        actorEmail: parsed.data.email,
        actorRole: "UNKNOWN",
        action: "MEMBER_INVITE_REJECTED",
        entity: "User",
        entityId: parsed.data.email,
        details: { reason: verification.reason },
      });
      return { success: false, error: INVITE_REDEMPTION_FAILED_MESSAGE, status: 400 };
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const member = await activateInvitedMember(verification.member.id, passwordHash);

    const session = await setSessionCookie({
      id: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
    });

    recordAuditLog({
      actorId: member.id,
      actorEmail: member.email,
      actorRole: member.role,
      action: "MEMBER_INVITE_ACCEPTED",
      entity: "User",
      entityId: member.id,
      details: { assignedRole: member.role, invitedBy: member.invitedBy },
    });

    revalidatePath(MEMBERS_PATH);
    // The session it sealed, as sign-in returns its own: the browser caches it as the
    // console's fallback should its first session check fail.
    return { success: true, data: session, status: 200 };
  } catch (error) {
    return toFailure(error, "Failed to activate your staff account.");
  }
}
