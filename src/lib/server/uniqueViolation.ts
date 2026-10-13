/**
 * Reads which unique constraint a Prisma P2002 actually names.
 *
 * ## Why this is one module
 *
 * Three call sites each answered this question on their own and each got it wrong
 * in the same way: `isReferenceCodeCollision` in `src/actions/applications.ts`,
 * the pledge-reference retry in `donationPledgeLedger.ts`, and the sponsorship
 * write that had no retry at all. All three reasoned from `meta.target`, which is
 * what the query-engine clients emitted. This repo runs Prisma 7 with
 * `@prisma/adapter-pg`, and that client never sets it.
 *
 * ## The shape, measured
 *
 * Captured on 2026-10-13 from a real duplicate insert against PostgreSQL 18, not
 * transcribed from `node_modules`:
 *
 *     { code: "P2002",
 *       meta: { modelName: "DonationPledge",
 *               driverAdapterError: { name: "DriverAdapterError", cause: {
 *                 originalCode: "23505",
 *                 originalMessage: 'duplicate key value violates unique constraint
 *                                   "donation_pledges_pledgeRef_key"',
 *                 kind: "UniqueConstraintViolation",
 *                 constraint: { fields: ['"pledgeRef"'] } } } } }
 *
 * Three things follow. There is no `target`. The field keeps the double quotes
 * Postgres prints around a mixed-case identifier, so matching is by substring.
 * And the constraint's own name is in `originalMessage`, which is a second,
 * independent source when the adapter could not parse a detail line — it leaves
 * `constraint` undefined in that case.
 *
 * `tests/integration/db/uniqueViolation.postgres.test.ts` re-captures this against
 * a live server, so a client upgrade that moves the columns again fails there
 * instead of silently disabling every retry that depends on it.
 */

interface AdapterCause {
  originalMessage?: unknown;
  constraint?: { fields?: unknown; index?: unknown };
}

/** Every name the error offers for the violated constraint: columns and index names. */
function namesFrom(meta: unknown): string[] {
  if (typeof meta !== "object" || meta === null) return [];
  const { target, driverAdapterError } = meta as {
    target?: unknown;
    driverAdapterError?: { cause?: AdapterCause };
  };
  const cause = driverAdapterError?.cause;
  const names: unknown[] = [];

  if (Array.isArray(cause?.constraint?.fields)) names.push(...cause.constraint.fields);
  if (typeof cause?.constraint?.index === "string") names.push(cause.constraint.index);

  // `... violates unique constraint "donation_pledges_pledgeRef_key"`.
  if (typeof cause?.originalMessage === "string") {
    const named = /unique constraint "([^"]+)"/.exec(cause.originalMessage)?.[1];
    if (named) names.push(named);
  }

  // The pre-adapter shape, kept because a future client may emit it again.
  if (Array.isArray(target)) names.push(...target);
  else if (typeof target === "string") names.push(target);

  return names.filter((n): n is string => typeof n === "string" && n.length > 0);
}

/**
 * Whether `err` is a unique violation on `column`.
 *
 * - `true` — a P2002 that names `column`.
 * - `false` — not a P2002, or a P2002 that names something else.
 * - `"unnamed"` — a P2002 that names nothing at all.
 *
 * Three answers, because the third is a different fact from the second and each
 * caller has to decide what to do with it. A caller that can prove `column` is the
 * only unique its statement could violate may treat `"unnamed"` as a hit; one that
 * cannot must treat it as a miss. Folding it into a boolean here is exactly how the
 * earlier predicates ended up either never retrying or retrying everything.
 */
export function uniqueViolationOn(err: unknown, column: string): boolean | "unnamed" {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: unknown };
  if (code !== "P2002") return false;

  const names = namesFrom(meta);
  if (names.length === 0) return "unnamed";
  return names.some((name) => name.includes(column));
}
