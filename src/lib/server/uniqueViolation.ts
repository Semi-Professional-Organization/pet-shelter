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
 * Postgres prints around a mixed-case identifier, so they are stripped before an
 * exact comparison.
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

  // The pre-adapter shape, kept because a future client may emit it again. An
  // entry is usually a column name, but some paths put the index name in the
  // array instead, so an entry shaped like one is filed as a constraint.
  const legacy = Array.isArray(target) ? strings(target) : strings([target]);
  for (const entry of legacy) {
    if (entry.endsWith("_key")) names.constraints.push(entry);
    else names.columns.push(unquote(entry));
  }

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
 * A column list, when the error carries one, is the whole answer, and it is
 * compared exactly: a field must *equal* `column` once its quotes are off, so
 * `originalPledgeRef` is not `pledgeRef` and `petId` is not `id`.
 *
 * ceiling: only when there is no column list does this fall back to constraint
 * names, and there it can only match by the `_<column>_key` suffix, because the
 * table name is not known here. A compound unique ending in the column asked
 * about (`t_petId_pledgeRef_key` for `pledgeRef`) therefore reads as `true` on
 * that path. On this stack the adapter always supplies the column list, so the
 * fallback is not reached; a caller on a client that does not must pass the full
 * constraint name it expects instead of trusting the suffix.
 */
export function uniqueViolationOn(err: unknown, column: string): boolean | "unnamed" {
  if (typeof err !== "object" || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: unknown };
  if (code !== "P2002") return false;

  const { columns, constraints } = namesFrom(meta);
  if (columns.length === 0 && constraints.length === 0) return "unnamed";

  if (columns.length > 0) return columns.includes(column);
  return constraints.some((name) => name === column || name.endsWith(`_${column}_key`));
}
