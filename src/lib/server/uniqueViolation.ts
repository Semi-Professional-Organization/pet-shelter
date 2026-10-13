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

/** What the error offers: the columns it names, and the constraint names it names. */
interface ViolationNames {
  columns: string[];
  constraints: string[];
}

const strings = (values: unknown[]): string[] =>
  values.filter((v): v is string => typeof v === "string" && v.length > 0);

/** Postgres prints a mixed-case identifier with its double quotes on. */
const unquote = (name: string): string => name.replace(/^"(.*)"$/, "$1");

function namesFrom(meta: unknown): ViolationNames {
  const names: ViolationNames = { columns: [], constraints: [] };
  if (typeof meta !== "object" || meta === null) return names;

  const { target, driverAdapterError } = meta as {
    target?: unknown;
    driverAdapterError?: { cause?: AdapterCause };
  };
  const cause = driverAdapterError?.cause;

  if (Array.isArray(cause?.constraint?.fields)) {
    names.columns.push(...strings(cause.constraint.fields).map(unquote));
  }
  if (typeof cause?.constraint?.index === "string") {
    names.constraints.push(cause.constraint.index);
  }

  // `... violates unique constraint "donation_pledges_pledgeRef_key"`.
  if (typeof cause?.originalMessage === "string") {
    const named = /unique constraint "([^"]+)"/.exec(cause.originalMessage)?.[1];
    if (named) names.constraints.push(named);
  }

  // The pre-adapter shape, kept because a future client may emit it again: an
  // array of column names, or the index name as one string.
  if (Array.isArray(target)) names.columns.push(...strings(target).map(unquote));
  else if (typeof target === "string" && target.length > 0) names.constraints.push(target);

  return names;
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
 *
 * Matching is exact, not by substring. A column must *equal* `column` once its
 * quotes are off, and a constraint name must be Prisma's `<table>_<column>_key`
 * for a single-column unique. A substring test would read `originalPledgeRef` as
 * `pledgeRef`, or `petId` as `id`, and a caller would then retry a collision on
 * the wrong constraint — the duplicate-row hazard the `false` answer exists for.
 *
 * ceiling: a compound unique (`@@unique([a, b])`, index `<table>_a_b_key`) is
 * matched by column only when the adapter lists its fields. Identified by index
 * name alone it reads as `false` for `a`. No caller asks about one today.
 */
export function uniqueViolationOn(err: unknown, column: string): boolean | "unnamed" {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: unknown };
  if (code !== "P2002") return false;

  const { columns, constraints } = namesFrom(meta);
  if (columns.length === 0 && constraints.length === 0) return "unnamed";

  return (
    columns.includes(column) ||
    constraints.some((name) => name === column || name.endsWith(`_${column}_key`))
  );
}
