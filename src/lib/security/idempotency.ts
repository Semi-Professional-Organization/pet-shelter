import { registerStateReset } from "@/lib/stateResets";

interface IdempotencyRecord<T> {
  response: T;
  expiresAt: number;
}

const idempotencyStore = new Map<string, IdempotencyRecord<unknown>>();

/**
 * Operations that have started but not yet settled.
 *
 * The result cache alone is a check-then-act: two callers arriving before the
 * first has finished both miss it and both run the operation — which is exactly
 * the double-clicked Submit the cache exists to prevent. Concurrent callers share
 * the first caller's promise instead.
 */
const inFlightOperations = new Map<string, Promise<unknown>>();

/** How often expired entries are swept out of the result cache. */
const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweepAt = 0;

/**
 * Wraps an async operation with idempotency protection.
 * If the key has already been processed within the TTL window, returns the cached result.
 *
 * A failed operation is deliberately not cached, so a retry after a transient
 * error can still succeed.
 */
export async function withIdempotency<T>(
  key: string | undefined | null,
  operation: () => Promise<T>,
  ttlMs = 1000 * 60 * 10 // 10 minutes
): Promise<T> {
  if (!key || key.trim() === "") {
    return operation();
  }

  const cleanKey = `idemp:${key.trim()}`;
  const now = Date.now();

  // Sweep expired entries. Nothing else removes them, and a cached value can hold
  // personal data — a photo-update result carries the recipient list — so a
  // long-lived process would otherwise retain donor addresses indefinitely, one
  // dead entry per operation.
  if (now - lastSweepAt > SWEEP_INTERVAL_MS) {
    lastSweepAt = now;
    for (const [existingKey, record] of idempotencyStore) {
      if (now >= record.expiresAt) idempotencyStore.delete(existingKey);
    }
  }

  const cached = idempotencyStore.get(cleanKey);
  if (cached && now < cached.expiresAt) {
    return cached.response as T;
  }

  const pending = inFlightOperations.get(cleanKey);
  if (pending) {
    return pending as Promise<T>;
  }

  const execution = (async () => {
    const result = await operation();
    idempotencyStore.set(cleanKey, {
      response: result,
      expiresAt: Date.now() + ttlMs,
    });
    return result;
  })();

  inFlightOperations.set(cleanKey, execution);

  try {
    return await execution;
  } finally {
    inFlightOperations.delete(cleanKey);
  }
}

/**
 * Drops every cached idempotent response.
 *
 * Test-only, and the counterpart to `resetRateLimitStore()`: a replayed key from
 * an earlier test would otherwise short-circuit the operation under test and
 * return a stale response instead of executing it. Wired into the global
 * `beforeEach` in `tests/setup/nextMocks.ts`.
 */
export function resetIdempotencyStore(): void {
  idempotencyStore.clear();
  inFlightOperations.clear();
  lastSweepAt = 0;
}

registerStateReset("idempotency", resetIdempotencyStore, 3);
