import { prisma } from "@/lib/server/prisma";
import { isLedgerPersistent } from "@/lib/server/donationLedger";
import { normalizeEmail } from "@/lib/notificationTokens";
import { NotificationPreferenceRecord } from "@/types/notifications";
import { registerStateReset } from "@/lib/stateResets";

/**
 * Donor notification consent, keyed by email address.
 *
 * ## Two declared modes, not a try/catch fallback
 *
 * Follows the contract `donationLedger.ts` documents, importing
 * `isLedgerPersistent()` rather than re-deriving it so the two cannot disagree:
 *
 * - `DATABASE_URL` set — Postgres is authoritative and a failed read propagates.
 * - `DATABASE_URL` unset — the in-memory map is authoritative by configuration
 *   (local dev, unit tests), not a degraded database.
 *
 * That distinction is load-bearing here. An earlier version swallowed query
 * errors and fell back to the permissive default, which meant a database blip
 * silently mailed every donor who had unsubscribed. Consent is exactly the wrong
 * thing to guess at, so there is no third "may or may not have landed" state.
 *
 * ## Reading and sending answer different questions
 *
 * `getNotificationPreference` is permissive: a donor who has never expressed a
 * choice is opted in, and rendering that on the preference page is correct.
 * `partitionByConsent` — what the dispatcher uses — fails closed, reporting
 * addresses it could not resolve separately rather than folding them in with the
 * consenting ones. An unsent photo update costs nothing; one sent to someone who
 * unsubscribed is the failure this feature exists to avoid.
 */

export type NotificationChannel = "photoUpdates" | "newsletter";

interface CacheEntry {
  record: NotificationPreferenceRecord;
  /** Past this instant the entry is still usable, but should be re-read first. */
  freshUntil: number;
}

/**
 * Entries expire for *freshness*, but are never dropped.
 *
 * A TTL is required for correctness across instances: this process can cache
 * "opted in", the donor can then unsubscribe against a different instance, and
 * with no expiry this one would keep mailing them for the life of the process.
 * Equally, a stale entry beats no entry — a known opt-out must survive a blip —
 * so expiry downgrades an entry to "stale but usable" instead of deleting it.
 */
const PREFERENCE_FRESHNESS_MS = 60 * 1000;

const preferenceCache = new Map<string, CacheEntry>();

/** In-memory authority when `DATABASE_URL` is unset. */
const memoryPreferences = new Map<string, NotificationPreferenceRecord>();

function defaultPreference(email: string): NotificationPreferenceRecord {
  return {
    email: normalizeEmail(email),
    photoUpdates: true,
    newsletter: true,
    unsubscribedAllAt: null,
  };
}

/** Test seam — clears both stores between cases. */
export function resetNotificationPreferences(): void {
  preferenceCache.clear();
  memoryPreferences.clear();
}

registerStateReset("notificationPreferences", resetNotificationPreferences, 9);

interface PreferenceRow {
  email: string;
  photoUpdates: boolean;
  newsletter: boolean;
  unsubscribedAllAt: Date | string | null;
}

function toRecord(row: PreferenceRow): NotificationPreferenceRecord {
  return {
    email: normalizeEmail(row.email),
    photoUpdates: row.photoUpdates,
    newsletter: row.newsletter,
    unsubscribedAllAt:
      row.unsubscribedAllAt instanceof Date
        ? row.unsubscribedAllAt.toISOString()
        : row.unsubscribedAllAt,
  };
}

function cache(record: NotificationPreferenceRecord): void {
  preferenceCache.set(record.email, {
    record,
    freshUntil: Date.now() + PREFERENCE_FRESHNESS_MS,
  });
}

/**
 * Reads the stored preference for an address, defaulting to opted-in when the
 * donor has never expressed a choice.
 *
 * Suitable for rendering the preference page. NOT suitable for deciding whether
 * to send — use `partitionByConsent`.
 */
export async function getNotificationPreference(
  email: string
): Promise<NotificationPreferenceRecord> {
  const key = normalizeEmail(email);

  if (!isLedgerPersistent()) {
    return memoryPreferences.get(key) ?? defaultPreference(key);
  }

  const entry = preferenceCache.get(key);
  if (entry && Date.now() < entry.freshUntil) return entry.record;

  const row = (await prisma.notificationPreference.findUnique({
    where: { email: key },
  })) as PreferenceRow | null;

  const record = row ? toRecord(row) : defaultPreference(key);
  cache(record);
  return record;
}

/**
 * Persists a preference change.
 *
 * Only the fields actually being changed are written. A whole-record write loses
 * updates: an unsubscribe click and a preference-page toggle can both read the
 * current state, and the slower one then writes its stale copy of the *other*
 * field back — silently restoring an opt-out the donor just made.
 */
export async function setNotificationPreference(
  email: string,
  patch: Partial<Pick<NotificationPreferenceRecord, "photoUpdates" | "newsletter">>
): Promise<NotificationPreferenceRecord> {
  const key = normalizeEmail(email);
  const current = await getNotificationPreference(key);

  const next: NotificationPreferenceRecord = { ...current, ...patch, email: key };

  const optedOutOfEverything = !next.photoUpdates && !next.newsletter;
  next.unsubscribedAllAt = optedOutOfEverything
    ? current.unsubscribedAllAt || new Date().toISOString()
    : null;

  if (!isLedgerPersistent()) {
    memoryPreferences.set(key, next);
    return next;
  }

  const changed: {
    photoUpdates?: boolean;
    newsletter?: boolean;
    unsubscribedAllAt?: Date | null;
  } = {
    unsubscribedAllAt: next.unsubscribedAllAt ? new Date(next.unsubscribedAllAt) : null,
  };
  if (patch.photoUpdates !== undefined) changed.photoUpdates = patch.photoUpdates;
  if (patch.newsletter !== undefined) changed.newsletter = patch.newsletter;

  await prisma.notificationPreference.upsert({
    where: { email: key },
    create: {
      email: key,
      photoUpdates: next.photoUpdates,
      newsletter: next.newsletter,
      unsubscribedAllAt: next.unsubscribedAllAt ? new Date(next.unsubscribedAllAt) : null,
    },
    update: changed,
  });

  cache(next);
  return next;
}

export interface ConsentPartition {
  /** Confirmed to permit this channel. */
  allowed: string[];
  /** Confirmed to have opted out. */
  blocked: string[];
  /**
   * Consent could not be established. Not mailable. Reported separately so a
   * dispatch records "we could not tell" rather than "they said no".
   */
  unresolved: string[];
}

/**
 * The single place that decides whether an address may be mailed on a channel.
 *
 * Fails closed: an address whose consent cannot be established is never mailed.
 */
export async function partitionByConsent(
  emails: string[],
  channel: NotificationChannel
): Promise<ConsentPartition> {
  const allowed: string[] = [];
  const blocked: string[] = [];
  const unresolved: string[] = [];

  const unique = Array.from(new Set(emails.map(normalizeEmail)));

  if (!isLedgerPersistent()) {
    for (const email of unique) {
      const record = memoryPreferences.get(email) ?? defaultPreference(email);
      if (record[channel] === true) allowed.push(email);
      else blocked.push(email);
    }
    return { allowed, blocked, unresolved };
  }

  const now = Date.now();
  const needsRead = unique.filter((email) => {
    const entry = preferenceCache.get(email);
    return !entry || now >= entry.freshUntil;
  });

  // One query for everything that needs reading, rather than an N+1 that queues
  // behind the connection pool exactly when the list is large enough to matter.
  let readFailed = false;
  if (needsRead.length > 0) {
    try {
      const rows = (await prisma.notificationPreference.findMany({
        where: { email: { in: needsRead } },
      })) as PreferenceRow[];

      const found = new Set<string>();
      for (const row of rows) {
        const record = toRecord(row);
        cache(record);
        found.add(record.email);
      }
      // Addresses the query confirmed absent have simply never opted out.
      for (const email of needsRead) {
        if (!found.has(email)) cache(defaultPreference(email));
      }
    } catch (err) {
      // Caught only to convert it into "unresolved", never into "allowed".
      readFailed = true;
      console.error(
        "[Notification Preferences] Consent lookup failed; unresolved addresses will not be mailed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  for (const email of unique) {
    const entry = preferenceCache.get(email);

    if (!entry) {
      unresolved.push(email);
      continue;
    }

    if (readFailed && now >= entry.freshUntil) {
      // Could not refresh. Honour a known opt-out, but never promote a stale
      // "opted in" into permission to send.
      if (entry.record[channel] !== true) blocked.push(email);
      else unresolved.push(email);
      continue;
    }

    if (entry.record[channel] === true) allowed.push(email);
    else blocked.push(email);
  }

  return { allowed, blocked, unresolved };
}
