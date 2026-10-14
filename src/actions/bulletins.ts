"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/security/dal";
import { ForbiddenError, PERMISSIONS, UnauthorizedError } from "@/lib/security/rbac";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  bulletinFormSchema,
  type BulletinFormInput,
} from "@/lib/validations/bulletin";
import type { BulletinRecord } from "@/types/bulletin";
import { isDatabaseUnavailable } from "@/lib/server/transparencyRepository";
import {
  deleteServerBulletin,
  insertServerBulletin,
  isBulletinSchemaMissing,
  listBulletinRecords,
  setServerBulletinPinned,
  setServerBulletinPublished,
  updateServerBulletin,
} from "@/lib/server/bulletinRepository";

/**
 * Server actions for the community bulletin editor.
 *
 * The public feeds read `getPublicBulletins()` directly from their Server
 * Components — no action needed, so a notice is server-rendered rather than
 * fetched by the browser. Every write here is gated on the `MANAGE_CONTENT`
 * permission, rate limited, recorded in the audit log, and followed by
 * revalidation of all three public surfaces that render bulletins.
 *
 * Authorisation is by CAPABILITY (`MANAGE_CONTENT`) rather than a role list, so
 * a future role rename cannot silently widen or close this gate. It follows
 * `src/actions/transparency.ts`, not `src/actions/faqs.ts` — the latter still
 * carries a legacy role list that the 2026-09-18 decision deliberately left in
 * place rather than extended to new code.
 *
 * WHAT THIS REPLACES MATTERS FOR REVIEW. Until this file existed there was no
 * authorisation on bulletins at all, because there was no server path at all:
 * `BulletinFeed` rendered a "Staff Admin Access" button to every visitor and
 * wrote their edits to their own localStorage. The damage was confined to one
 * browser, which is the only reason it was not an incident. Moving the store
 * server-side removes that confinement, so the gates below are the load-bearing
 * part of this change, not its paperwork.
 */

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Every surface that renders a bulletin: the three public feeds, plus the
 * editor itself.
 *
 * The three public ones are listed for the reason `LEDGER_PATHS` gives in
 * `src/actions/transparency.ts`: an editor who fixes a notice and watches only
 * `/bulletins` update would otherwise believe the home page was stale for five
 * minutes by design, with nothing saying so. `/` carries `revalidate = 300`,
 * which is exactly that window.
 *
 * `/admin/bulletins` is the fourth and is NOT public. It is `force-dynamic`, so
 * purging it is a no-op today; it is listed so that the list stays "everywhere
 * a bulletin is rendered" rather than becoming a list someone has to re-derive
 * if that page ever gains caching.
 */
const BULLETIN_PATHS = ["/", "/pets", "/bulletins", "/admin/bulletins"];

/** Generous enough never to block real editing; stops a runaway client loop. */
const WRITE_RATE_LIMIT = 60;
const WRITE_RATE_WINDOW_MS = 60_000;

/** Typed so `toMessage` passes it through verbatim rather than as generic failure text. */
class RateLimitedError extends Error {
  constructor(retryAfterSeconds: number) {
    super(`Too many changes in a short period. Try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitedError";
  }
}

/**
 * Purge every surface that renders a bulletin.
 *
 * The try is **inside** the loop on purpose. Wrapping the whole loop meant one
 * failing path skipped the rest: if `/` threw, `/pets` and `/bulletins` were
 * never purged, the action still returned `success: true`, and the editor was
 * told the change was live while two public feeds served the old render for the
 * full 300s window this list exists to prevent.
 *
 * A failure is logged rather than swallowed. The common cause really is calling
 * this outside a Next request scope, which is every unit test, so it must not
 * throw — but a silent catch that is right for tests is how a production purge
 * failure goes unnoticed.
 */
function revalidateBulletins(): void {
  for (const path of BULLETIN_PATHS) {
    try {
      revalidatePath(path);
    } catch (err) {
      // Outside a Next.js request scope (unit tests) this is expected and
      // uninteresting; in a request it means a stale public page.
      if (process.env.NODE_ENV !== "test") {
        console.error("[bulletins] failed to revalidate", path, err);
      }
    }
  }
}

/**
 * Converts a thrown error into a message safe to show an editor.
 *
 * Authorisation and validation messages are already written for humans. A raw
 * database error is not, and can disclose schema details, so it is logged and
 * replaced.
 */
function toMessage(err: unknown, fallback: string): string {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof RateLimitedError
  ) {
    return err.message;
  }

  if (err && typeof err === "object" && (err as { name?: unknown }).name === "ZodError") {
    const issues = (err as { issues?: { message?: string }[] }).issues ?? [];
    const first = issues.find((i) => typeof i.message === "string")?.message;
    if (first) return first;
  }

  // The table does not exist yet: the code deployed before the hand-run
  // migration reached this database. The likeliest production failure for this
  // feature, and the one a generic message hides completely — the editor needs
  // to know nothing will save until someone runs the migration.
  if (isBulletinSchemaMissing(err)) {
    return (
      "Bulletins are not set up on this database yet, so nothing can be saved. " +
      "The migration in prisma/migrations/manual/20260922_community_bulletins needs to be applied."
    );
  }

  // Connectivity, timeouts, TLS, refused sockets — the shared classifier rather
  // than a hand-picked list of three codes that missed most of them.
  if (isDatabaseUnavailable(err)) {
    return "The database is unavailable, so this change was not saved. Try again once it is reachable.";
  }

  console.error("[bulletins]", fallback, err);
  return fallback;
}

/**
 * Rate limit one editor's writes.
 *
 * Authorization is deliberately NOT folded in here. Every action states its own
 * `requirePermission` so the gate is readable where the action is read, rather
 * than one indirection away — which is also what
 * `tests/unit/serverActionAuth.test.ts` checks for. It goes through the DAL
 * rather than the raw cookie reader, so a suspended or deleted member's
 * unexpired cookie is refused; see `tests/unit/security/verifiedSessionOnly.test.ts`.
 */
function enforceWriteRateLimit(actorId: string): void {
  const limit = checkRateLimit(
    `bulletins:write:${actorId}`,
    WRITE_RATE_LIMIT,
    WRITE_RATE_WINDOW_MS
  );
  if (!limit.success) {
    throw new RateLimitedError(limit.retryAfterSeconds);
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every bulletin, drafts included, for the editor.
 *
 * Gated: an unpublished notice is staff-only by definition, and the public
 * feeds have their own unauthenticated reader that filters to published rows.
 */
export async function listBulletinsAction(): Promise<ActionResult<BulletinRecord[]>> {
  try {
    await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    const records = await listBulletinRecords();
    return { success: true, data: records };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to load bulletins") };
  }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export async function createBulletinAction(
  input: BulletinFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    enforceWriteRateLimit(session.id);

    const validated = bulletinFormSchema.parse(input);
    const record = await insertServerBulletin(validated, session);

    revalidateBulletins();
    return { success: true, data: { id: record.id } };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to publish bulletin") };
  }
}

export async function updateBulletinAction(
  id: string,
  input: BulletinFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    enforceWriteRateLimit(session.id);

    const validated = bulletinFormSchema.parse(input);
    const record = await updateServerBulletin(id, validated, session);
    if (!record) return { success: false, error: "That bulletin no longer exists." };

    revalidateBulletins();
    return { success: true, data: { id: record.id } };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to update bulletin") };
  }
}

export async function setBulletinPublishedAction(
  id: string,
  isPublished: boolean
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    enforceWriteRateLimit(session.id);

    const record = await setServerBulletinPublished(id, isPublished, session);
    if (!record) return { success: false, error: "That bulletin no longer exists." };

    revalidateBulletins();
    return { success: true, data: { id: record.id } };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to change publication state") };
  }
}

export async function setBulletinPinnedAction(
  id: string,
  isPinned: boolean
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    enforceWriteRateLimit(session.id);

    const record = await setServerBulletinPinned(id, isPinned, session);
    if (!record) return { success: false, error: "That bulletin no longer exists." };

    revalidateBulletins();
    return { success: true, data: { id: record.id } };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to change pin state") };
  }
}

export async function deleteBulletinAction(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission(PERMISSIONS.MANAGE_CONTENT);
    enforceWriteRateLimit(session.id);

    const deleted = await deleteServerBulletin(id, session);
    if (!deleted) return { success: false, error: "That bulletin no longer exists." };

    revalidateBulletins();
    return { success: true };
  } catch (err) {
    return { success: false, error: toMessage(err, "Failed to delete bulletin") };
  }
}
