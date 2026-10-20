import { cache } from "react";
import { findMemberAuthStateById } from "@/lib/server/memberStore";
import { findUserById } from "@/lib/server/userStore";
import { getCurrentSession, type SessionUser } from "./session";
import {
  ForbiddenError,
  UnauthorizedError,
  assertHasPermission,
  type Permission,
} from "./rbac";
import { USER_STATUSES } from "./permissions";

/**
 * Server-side Data Access Layer for authorization.
 *
 * The session cookie is stateless and lives for 24 hours, so a role change or
 * a suspension made in /admin/members would otherwise not take effect until
 * the victim's cookie expired. Every guarded entry point resolves the session
 * through here, which re-reads the member's live role and status.
 */

/**
 * Returns the current session with role refreshed from the database, or null
 * when unauthenticated, suspended, or still pending invitation.
 *
 * Failure mode is deliberate: an explicit SUSPENDED/INVITED row denies access,
 * but an *unreachable* database falls back to the cookie's own claims. The rest
 * of this codebase (userStore, auditLog) is built to degrade to in-memory
 * operation when Postgres is offline, and failing every admin request closed on
 * a transient outage would be a worse trade than a suspension taking effect one
 * session late. Revisit if the in-memory fallback is ever removed.
 *
 * A *reachable* database that simply has no such row is the opposite case, and
 * is handled by `readFallbackAuthState` below.
 */
async function readVerifiedSession(): Promise<SessionUser | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  try {
    // Queried through the repository rather than Prisma directly: only
    // src/lib/server/ may reach the client (LAYERS.md §L-B2), and this module
    // is authorization policy, not data access.
    const authState = (await findMemberAuthStateById(session.id)) ?? (await readFallbackAuthState(session.id));

    // Nothing vouches for this id in either store, so the account does not
    // exist: a row deleted straight out of the database, or a session id that
    // never named a real member.
    if (!authState) return null;

    if (authState.status !== USER_STATUSES.ACTIVE) return null;

    return {
      ...session,
      name: authState.name,
      email: authState.email,
      // Raw, for the same reason getCurrentSession() no longer normalises:
      // folding VOLUNTEER onto STAFF would grant it STAFF's application read.
      role: authState.role as SessionUser["role"],
    };
  } catch {
    return session;
  }
}

/**
 * The auth state of an account that has no `users` row, or null if it has no
 * identity at all.
 *
 * **Refuses outright in production.** `findUserById` falls back to `userStore`'s
 * in-memory map, which `ensureInitialized()` seeds with five hardcoded demo
 * accounts — `usr-admin-01` among them, SUPER_ADMIN, ACTIVE, with a hash of a
 * compile-time password. Consulting that map when the database is reachable
 * meant deleting `usr-admin-01` from Postgres revoked nothing: the seed vouched
 * for it and handed back a full SUPER_ADMIN session. The first version of this
 * fix closed the deleted-member hole for every id *except* the five where it
 * mattered most, and review caught it rather than a test.
 *
 * The fallback's only legitimate subjects are development artefacts — the seeded
 * logins, and accounts `createUser` wrote to memory while Postgres was down. In
 * production neither should authorise anything, so the reachable database is the
 * sole authority and a missing row is final. That is also the honest answer to
 * "name the layer that enforces this boundary": in production it is Postgres.
 *

 * This replaces a `if (!member) return session` fall-through. That line handed
 * back the cookie's own claims whenever the row was missing, so a member
 * *deleted* from a perfectly reachable database kept every capability their
 * cookie asserted until it expired — up to 24 hours of full authority for an
 * account that no longer exists. Inverting the one guarantee this module is
 * here to provide.
 *
 * It could not simply be deleted: the seeded demo logins in `userStore` have no
 * `users` row on a reachable-but-unseeded database, and denying them would lock
 * every local and offline session out of /admin. So the question is narrowed
 * from "is the row missing?" to "does *any* store still vouch for this id?".
 * `findUserById` is the right authority because it is the same lookup that
 * authenticated them — Prisma first, then the in-memory seed — so an id it
 * cannot produce is one nothing can.
 */
async function readFallbackAuthState(
  id: string
): Promise<{ role: string; status: string; name: string; email: string } | null> {
  if (process.env.NODE_ENV === "production") return null;

  // Only the four authorization-relevant fields are lifted out; the rest of the
  // record includes a password hash, which has no business in policy code.
  const user = await findUserById(id);
  if (!user) return null;
  return { role: user.role, status: user.status, name: user.name, email: user.email };
}

/**
 * Request-scoped memoization of the session lookup.
 *
 * Re-reading the member row is what makes a suspension take effect immediately,
 * at the cost of a query per guard. Most entry points check once per request,
 * so the saving is narrow rather than dramatic — the concrete case is
 * `getAdminActorOrThrow` in actions/pets.ts, which asks for the capability and
 * then for the actor and so read the same row twice on every pet mutation.
 * `cache` collapses that to one query per request, and more importantly makes
 * the DAL cheap enough to call freely, so a page can gate its UI with
 * `canCurrentUser` without buying another round-trip.
 *
 * Scope note: `cache` is keyed per request in a React server context. Outside
 * one — unit tests, scripts — it degrades to calling straight through, so
 * consecutive calls with different cookies still resolve independently and no
 * session leaks between them. Verified by the auth tests, which sign in as a
 * different role in each case and assert distinct outcomes.
 */
export const getVerifiedSession = cache(readVerifiedSession);

/**
 * Whether the request carries a sealed, unexpired session cookie at all, verified or not.
 *
 * Tells "nobody is signed in" from "signed in as someone the DAL will not honour"
 * (suspended, deleted, held only in the in-memory store), which want different pages.
 * Never authorizes anything: a true here says nothing about who may do what.
 */
export async function hasSessionCookie(): Promise<boolean> {
  return (await getCurrentSession()) !== null;
}

/**
 * Resolves a verified session holding `permission`, or throws.
 *
 * Throws `UnauthorizedError` (401) when signed out and `ForbiddenError` (403)
 * when signed in without the capability.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await getVerifiedSession();
  assertHasPermission(session, permission);
  return session;
}

/**
 * Non-throwing variant for render-path gating (e.g. hiding a nav tab).
 */
export async function canCurrentUser(permission: Permission): Promise<boolean> {
  try {
    await requirePermission(permission);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      return false;
    }
    throw error;
  }
}
