/**
 * Strict-persistence switch for the repository layer.
 *
 * The dual-layer store (docs/architecture/LAYERS.md, L-B2) deliberately swallows
 * Prisma errors and falls back to the in-memory JSON fixtures, so the app runs
 * with no database at all. That same forgiveness makes it impossible for an
 * integration test to tell a working query from a broken one: a schema drift, a
 * renamed column, or a malformed `where` clause all "pass" by silently serving
 * fixture data.
 *
 * Setting `STRICT_PERSISTENCE=true` disables the fallback and rethrows, so the
 * Tier-3 suite fails loudly on the real defect instead of green-lighting it.
 *
 * The flag is read on every call rather than captured at module load, so
 * `vi.stubEnv("STRICT_PERSISTENCE", ...)` works inside an already-imported module.
 */
export function isStrictPersistence(): boolean {
  return process.env.STRICT_PERSISTENCE === "true";
}

/**
 * True when the database is authoritative (either a real DATABASE_URL is configured,
 * or STRICT_PERSISTENCE is explicitly enabled in integration tests).
 */
export function isDatabasePersistent(): boolean {
  return Boolean(process.env.DATABASE_URL) || isStrictPersistence();
}

/**
 * How loudly a swallowed failure is reported when strict mode is *off*.
 *
 * - `"read"` — warn in development only. A read falling back offline is the
 *   documented, expected state of this app; warning on it in production would
 *   be pure noise.
 * - `"write"` — warn always. A write that reached only the in-memory array is
 *   data loss the moment the process restarts, so it stays visible in every
 *   environment.
 * Both kinds should additionally be forwarded to your telemetry/alerting sink in
 * production; a console line is a breadcrumb, not a page.
 */
export type PersistenceFailureKind = "read" | "write";

/**
 * Prisma's unique-constraint violation. Unlike a connectivity failure, this is a
 * caller bug (duplicate id) or a genuine conflict — it must surface to the caller
 * in every mode, because "keep the stale fixture copy instead" is never the right
 * resolution for it.
 */
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * The single decision point every repository catch block delegates to.
 *
 * Two things escape the swallow, in both modes:
 *
 * - Strict mode rethrows *everything* verbatim — preserving the stack and Prisma
 *   error code — rather than wrapping, because a wrapper would hide exactly the
 *   detail the test needs.
 * - Unique-constraint violations rethrow in every mode. They are deterministic
 *   conflicts, not transient outages; silently serving the fixture copy would
 *   mask a real data conflict.
 *
 * @param context Human-readable label for the failing operation, used in the warning.
 * @param err     The caught value.
 * @param kind    Reporting level for non-strict mode. See {@link PersistenceFailureKind}.
 */
export function handlePersistenceError(
  context: string,
  err: unknown,
  kind: PersistenceFailureKind = "read"
): void {
  if (isUniqueViolation(err) || isStrictPersistence()) {
    throw err;
  }
  if (kind === "write" || process.env.NODE_ENV === "development") {
    console.warn(
      `[Database Store] ${context} fallback notice:`,
      err instanceof Error ? err.message : err
    );
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

/**
 * Prisma's "record to update/delete not found" (P2025). Not an outage: the query ran and the row
 * was not there, so a write that hits it wrote nothing and must not be reported as saved.
 */
export function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}
