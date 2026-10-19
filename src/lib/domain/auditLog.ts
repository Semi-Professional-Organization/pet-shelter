import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { handlePersistenceError, isStrictPersistence } from "@/lib/persistenceMode";
import { registerStateReset } from "@/lib/stateResets";

interface DbAuditLogRecord {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  metadata?: unknown;
  createdAt: Date | string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string; // e.g. "APPLICATION_APPROVED", "PET_CREATED", "STATUS_UPDATED"
  entity: string; // "AdoptionApplication" | "Pet" | "ShelterSettings" | "Auth"
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export type AuditEntryInput = Omit<AuditEntry, "id" | "createdAt">;

// In-memory persistent array for demonstration, testing, and offline fallback
const auditLogsStore: AuditEntry[] = [];

/**
 * Writes issued by `recordAuditLog` that have not settled yet.
 *
 * `recordAuditLog` is synchronous by design — a privileged mutation should not
 * wait on the audit row — so its Prisma call is a floating promise. That is
 * fine when failures are swallowed, but strict persistence has to surface them
 * somehow, and rethrowing inside a floating `.catch()` would raise an
 * *unhandled rejection* that tears down the Node process instead of failing a
 * test. So the write is parked here and its error captured, and
 * `flushAuditLogWrites()` is what converts it into a throw the caller can see.
 */
const pendingAuditWrites = new Set<Promise<void>>();
let lastAuditWriteError: unknown = null;

/**
 * Awaits every audit write issued so far.
 *
 * Under `STRICT_PERSISTENCE=true` this rethrows the first failure, giving the
 * fire-and-forget write path a deterministic assertion point:
 *
 * ```ts
 * recordAuditLog(entry);
 * await expect(flushAuditLogWrites()).rejects.toThrow();
 * ```
 *
 * Outside strict mode it simply drains, which is also what an integration test
 * wants before asserting on persisted rows.
 */
export async function flushAuditLogWrites(): Promise<void> {
  // Looped: settling one batch can enqueue another if a caller logged again
  // while we were awaiting. Entries evict themselves, so the set drains.
  while (pendingAuditWrites.size > 0) {
    await Promise.all(pendingAuditWrites);
  }
  if (isStrictPersistence() && lastAuditWriteError !== null) {
    const err = lastAuditWriteError;
    lastAuditWriteError = null;
    throw err;
  }
}

/**
 * Clears the in-memory audit trail and any recorded write failure.
 *
 * Test-only. Wired into the global `beforeEach` in `tests/setup/nextMocks.ts`
 * so entries logged by one test cannot be counted by the next.
 */
export function resetAuditLogs(): void {
  auditLogsStore.length = 0;
  pendingAuditWrites.clear();
  lastAuditWriteError = null;
}

registerStateReset("auditLog", resetAuditLogs);

function auditLogCreateData(entry: AuditEntryInput) {
  return {
    action: entry.action,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    targetEntity: entry.entity,
    targetId: entry.entityId,
    details: JSON.stringify(entry.details || {}),
    metadata: entry.details ? (entry.details as object) : undefined,
  };
}

/**
 * Persists an audit entry through the supplied client and propagates failures.
 *
 * Transactional mutations use this seam so their state transition and audit
 * record commit or roll back together. The synchronous `recordAuditLog` API
 * remains the non-blocking contract for existing callers.
 */
export async function persistAuditLog(
  client: Pick<Prisma.TransactionClient, "auditLog">,
  entry: AuditEntryInput
): Promise<void> {
  await client.auditLog.create({ data: auditLogCreateData(entry) });
}

/**
 * Records an immutable audit log entry in memory and persists to PostgreSQL via Prisma.
 */
export function recordAuditLog(entry: AuditEntryInput): AuditEntry {
  const newEntry: AuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  auditLogsStore.unshift(newEntry);

  // Keep last 1,000 entries in memory
  if (auditLogsStore.length > 1000) {
    auditLogsStore.pop();
  }

  // Asynchronously persist to PostgreSQL without blocking execution. The catch
  // never rethrows — see `pendingAuditWrites` — it records, and
  // `flushAuditLogWrites()` decides whether that record becomes a throw.
  const write: Promise<void> = persistAuditLog(prisma, entry)
    .then(
      () => undefined,
      (err: unknown) => {
        lastAuditWriteError = err;
        if (!isStrictPersistence() && process.env.NODE_ENV === "development") {
          console.warn(
            "[Database Store] Audit log write fallback notice:",
            err instanceof Error ? err.message : err
          );
        }
      }
    )
    .finally(() => {
      // Self-eviction keeps the set bounded in a long-lived server process,
      // where nothing ever calls `flushAuditLogWrites()`.
      pendingAuditWrites.delete(write);
    });

  pendingAuditWrites.add(write);
  keepAliveUntilSettled(write);

  return newEntry;
}

/**
 * Extends the serverless invocation until an audit write has settled.
 *
 * `pendingAuditWrites` makes the write *observable* to a test; it does nothing
 * to make it *survive*. On a serverless host the invocation is frozen the
 * moment the response is sent, so a promise nobody is holding may never be
 * resumed — the row is simply lost, silently, and only in production. `after()`
 * hands the promise to the platform's `waitUntil`, which is the only mechanism
 * that keeps the function alive for it.
 *
 * Awaiting at the call site was the alternative and is not available:
 * `recordAuditLog` is synchronous by contract, returns the entry, and is called
 * from dozens of sites across actions and repositories. Making it async is a
 * cross-module signature change, and a privileged mutation should not block on
 * its own audit row anyway — which is the same reason `after()` exists.
 *
 * The guard is not defensive padding. `after()` throws "`after` was called
 * outside a request scope" anywhere there is no request — unit tests, seed
 * scripts, module initialisation — and `recordAuditLog` runs in all three.
 * Measured, not assumed; `tests/unit/security/authSessionDal.test.ts` pins both
 * halves. Losing the registration outside a server costs nothing, because
 * nothing is about to freeze.
 */
function keepAliveUntilSettled(write: Promise<void>): void {
  try {
    after(write);
  } catch (err) {
    // Out of request scope is the expected, uninteresting case. Anything else
    // means the guard is swallowing a real failure of the control it exists to
    // provide — after() called past the response, or a Next upgrade tightening
    // its contract — and the write goes back to being an unowned promise a
    // serverless host can freeze. Still not rethrown, because that would turn
    // every audited mutation into a 500; but it must not be silent, which is
    // the state the whole floating-promise defect lived in.
    const outOfScope = err instanceof Error && /request scope/i.test(err.message);
    if (!outOfScope) {
      console.warn(
        "[Audit] after() refused the audit write; it is no longer protected from a serverless freeze:",
        err instanceof Error ? err.message : err
      );
    }
  }
}

/**
 * Retrieves latest audit log entries from Prisma or memory fallback.
 */
export async function getAuditLogsAsync(limit = 50): Promise<AuditEntry[]> {
  try {
    const dbLogs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    if (dbLogs && dbLogs.length > 0) {
      return (dbLogs as unknown as DbAuditLogRecord[]).map((log: DbAuditLogRecord) => ({
        id: log.id,
        actorId: log.actorId || "",
        actorEmail: log.actorEmail,
        actorRole: log.actorRole,
        action: log.action,
        entity: log.targetEntity,
        entityId: log.targetId || "",
        details: log.metadata ? (log.metadata as Record<string, unknown>) : undefined,
        createdAt: typeof log.createdAt === "string" ? log.createdAt : new Date(log.createdAt).toISOString(),
      }));
    }
  } catch (err) {
    handlePersistenceError("Prisma audit log query", err, "read");
  }

  return auditLogsStore.slice(0, limit);
}

/**
 * Synchronous in-memory lookup.
 */
export function getAuditLogs(limit = 50): AuditEntry[] {
  return auditLogsStore.slice(0, limit);
}
