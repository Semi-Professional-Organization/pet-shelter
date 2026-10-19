import { prisma } from "@/lib/server/prisma";
import { getSampleLedger, type SampleLedger } from "../domain/transparencySample";
import {
  buildSnapshot,
  emptySnapshot,
  CategoryTotal,
  ExpenseCategoryKey,
  ExpenseItemRecord,
  FinancialReportRecord,
  ImpactStatRecord,
  TransparencySnapshot,
  TransparencySource,
  allocationFromTotals,
  categoryTotalsFromItems,
  isCountableExpense,
  isExpenseCategory,
  sortExpensesNewestFirst,
  sortImpactStats,
  sortReportsNewestFirst,
} from "../domain/transparency";
import { HOME_METRIC_KEYS, isHomeMetricKey } from "../domain/metrics";
import { registerStateReset } from "@/lib/stateResets";

/**
 * The home page keeps its five counters in this same table, under keys it owns
 * (`src/lib/domain/metrics.ts`). The ledger surfaces must subtract them: a new
 * counter is created with `displayOrder: 0`, the seeded ledger rows are 1/2/3,
 * and /donate renders `sortImpactStats(...).slice(0, 3)` — so without this the
 * first home figure staff publish silently evicts a donation figure, and
 * /transparency, which does not slice at all, shows all five among the ledger's.
 */
const HOME_METRIC_KEY_LIST = [...HOME_METRIC_KEYS];

/** Drops the home page's counters from a ledger surface's rows. */
function ledgerStatsOnly(stats: ImpactStatRecord[]): ImpactStatRecord[] {
  return stats.filter((stat) => !isHomeMetricKey(stat.key));
}

/**
 * Persistence layer for the transparency ledger.
 *
 * PostgreSQL is the source of truth. `src/data/transparency.json` is a
 * DEVELOPMENT dataset so the page is workable offline — it is never substituted
 * in production, because presenting invented expenses as verified spending on a
 * transparency page is worse than showing nothing. In production a failed read
 * yields an honest empty state (`source: "unavailable"`).
 */

/** Rows shipped to the browser for the public feed. Allocation still covers all rows. */
export const PUBLIC_FEED_LIMIT = 120;

/** Rows loaded into the admin editor. Bounded so the table cannot grow without limit. */
export const ADMIN_LEDGER_LIMIT = 500;

/** Published statements listed on the page. A decade of monthly filings fits. */
export const REPORT_LIMIT = 200;

type MutationTarget = "database" | "memory";

type MemoryState = SampleLedger;

const globalForTransparency = globalThis as unknown as {
  transparencyMemory: MemoryState | undefined;
};

/** Survives Turbopack hot reloads so a dev edit is not lost on file save. */
function memory(): MemoryState {
  globalForTransparency.transparencyMemory ??= getSampleLedger();
  return globalForTransparency.transparencyMemory;
}

/** Test-only: restores the in-memory mirror to the baseline dataset. */
export function resetTransparencyMemory(): void {
  globalForTransparency.transparencyMemory = getSampleLedger();
}

registerStateReset("transparency", resetTransparencyMemory);

/**
 * Read at call time, not module scope, so a test can flip it.
 * `next build` runs with NODE_ENV=production, so a build-time prerender against
 * an unreachable database bakes in the honest empty state, not sample figures.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Error classification                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Prisma error codes that mean "the database is not usable", as opposed to
 * "the database rejected this particular write".
 *
 * Verified against Prisma 7: an unreachable server raises a
 * PrismaClientKnownRequestError with code P1001.
 */
const UNAVAILABLE_PRISMA_CODES = new Set([
  "P1000", // authentication failed
  "P1001", // cannot reach database server
  "P1002", // database server timeout
  "P1008", // operation timed out
  "P1010", // access denied
  "P1011", // TLS error
  "P1017", // server closed the connection
  "P2021", // table does not exist (schema not pushed)
  "P2022", // column does not exist (schema out of date)
]);

const UNAVAILABLE_SOCKET_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
]);

/**
 * True only for failures that mean the database itself is unreachable or
 * unmigrated. Anything else — a constraint violation, a bad value — is a real
 * error that must reach the operator rather than being silently absorbed into
 * an in-memory copy that the next read will not show.
 *
 * Defaulting to `false` is the safe direction: an unrecognised error surfaces
 * instead of quietly diverging.
 */
export function isDatabaseUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const candidate = err as { code?: unknown; name?: unknown };

  if (typeof candidate.code === "string") {
    if (UNAVAILABLE_PRISMA_CODES.has(candidate.code)) return true;
    if (UNAVAILABLE_SOCKET_CODES.has(candidate.code)) return true;
  }

  return candidate.name === "PrismaClientInitializationError";
}

/**
 * Prisma raises P2025 when an update or delete targets a row that is not there.
 * That is an ordinary outcome — a stale tab, a double-clicked delete — not a
 * server fault, so it becomes a `null` result and a plain "no longer exists"
 * message instead of being logged as an unexpected error.
 */
function isRecordNotFound(err: unknown): boolean {
  return (
    !!err && typeof err === "object" && (err as { code?: unknown }).code === "P2025"
  );
}

/** Resolves to null when the row is gone; rethrows anything else. */
async function orNullIfMissing<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    if (isRecordNotFound(err)) return null;
    throw err;
  }
}

/**
 * Runs a write against the database, falling back to the in-memory mirror only
 * when the database is genuinely unavailable AND we are not in production.
 */
async function withDatabase<T>(
  operation: () => Promise<T>,
  fallback: () => T
): Promise<{ value: T; target: MutationTarget }> {
  try {
    return { value: await operation(), target: "database" };
  } catch (err) {
    if (isProduction() || !isDatabaseUnavailable(err)) throw err;
    return { value: fallback(), target: "memory" };
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

interface PrismaExpenseRow {
  id: string;
  category: string;
  title: string;
  amountSen: number;
  date: string;
  vendorOrClinic: string | null;
  petName: string | null;
  receiptRef: string | null;
  isPublished: boolean;
}

function toExpenseRecord(row: PrismaExpenseRow): ExpenseItemRecord {
  return {
    id: row.id,
    category: row.category as ExpenseCategoryKey,
    title: row.title,
    amountSen: row.amountSen,
    date: row.date,
    vendorOrClinic: row.vendorOrClinic,
    petName: row.petName,
    receiptRef: row.receiptRef,
    isPublished: row.isPublished,
  };
}

function toIso(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

interface ReadOptions {
  /** Admin view: include unpublished drafts in the returned rows. */
  includeUnpublished?: boolean;
}

/**
 * Reads the ledger.
 *
 * Allocation is aggregated in the database over every published row, while only
 * a bounded window of rows is returned for the feed — so the chart stays exact
 * as the ledger grows without the whole ledger being serialised into every
 * page response.
 */
export async function readTransparencySnapshot(
  options: ReadOptions = {}
): Promise<TransparencySnapshot> {
  const { includeUnpublished = false } = options;
  const rowLimit = includeUnpublished ? ADMIN_LEDGER_LIMIT : PUBLIC_FEED_LIMIT;
  const publishedOnly = includeUnpublished ? {} : { isPublished: true };

  try {
    const [expenses, reports, impactStats, grouped] = await Promise.all([
      prisma.expenseItem.findMany({
        where: publishedOnly,
        // Ties broken by id so a take that lands mid-day is deterministic;
        // the in-memory comparator was made stable for the same reason.
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: rowLimit,
      }),
      prisma.financialReport.findMany({
        where: publishedOnly,
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: REPORT_LIMIT,
      }),
      prisma.impactStat.findMany({
        where: { ...publishedOnly, key: { notIn: HOME_METRIC_KEY_LIST } },
        orderBy: { displayOrder: "asc" },
      }),
      // Aggregate over the ENTIRE published ledger, independent of `take`.
      prisma.expenseItem.groupBy({
        by: ["category"],
        where: { isPublished: true },
        _sum: { amountSen: true },
        _count: { _all: true },
      }),
    ]);

    const totals: CategoryTotal[] = grouped
      .filter((row) => isExpenseCategory(row.category))
      .map((row) => ({
        key: row.category as ExpenseCategoryKey,
        totalSen: row._sum.amountSen ?? 0,
        itemCount: row._count._all,
      }));

    const state: MemoryState = {
      expenses: expenses
        .filter((e) => isExpenseCategory(e.category))
        .map((e) => ({
          id: e.id,
          category: e.category as ExpenseCategoryKey,
          title: e.title,
          amountSen: e.amountSen,
          date: e.date,
          vendorOrClinic: e.vendorOrClinic,
          petName: e.petName,
          receiptRef: e.receiptRef,
          isPublished: e.isPublished,
        })),
      reports: reports.map((r) => ({
        id: r.id,
        year: r.year,
        month: r.month,
        title: r.title,
        fileUrl: r.fileUrl,
        summary: r.summary,
        publishedAt: toIso(r.publishedAt),
        isPublished: r.isPublished,
      })),
      impactStats: impactStats.map((s) => ({
        id: s.id,
        key: s.key,
        metricValue: s.metricValue,
        label: s.label,
        labelMs: s.labelMs,
        period: s.period,
        periodMs: s.periodMs,
        displayOrder: s.displayOrder,
        isPublished: s.isPublished,
      })),
    };

    // A reachable but empty database is a legitimate answer — an unseeded
    // shelter has no spending to show. It must NOT be papered over with the
    // sample dataset.
    return project(state, "database", includeUnpublished, rowLimit, totals);
  } catch (err) {
    if (isProduction()) {
      console.error("[transparency] ledger read failed", err);
      return emptySnapshot("unavailable");
    }
    // Development: fall back to the bundled dataset so the page is workable
    // offline. Labelled `sample` so every surface can say so.
    return project(memory(), "sample", includeUnpublished, rowLimit);
  }
}

function project(
  state: MemoryState,
  source: TransparencySource,
  includeUnpublished: boolean,
  rowLimit: number,
  totals?: CategoryTotal[]
): TransparencySnapshot {
  // Allocation always derives from published rows only — it is what the public
  // sees — even when the caller also wants drafts listed.
  const resolvedTotals = totals ?? categoryTotalsFromItems(state.expenses);

  const published = sortExpensesNewestFirst(
    state.expenses.filter(isCountableExpense)
  ).slice(0, rowLimit);

  // The in-memory mirror holds every row the database would, home counters
  // included, so it needs the same subtraction the queries above apply.
  const ledgerStats = ledgerStatsOnly(state.impactStats);

  const snapshot = buildSnapshot({
    expenses: published,
    reports: state.reports,
    impactStats: ledgerStats,
    source,
    totals: resolvedTotals,
  });

  if (!includeUnpublished) return snapshot;

  // Admin view: widen the raw lists to include drafts, keeping the derived
  // figures above (which describe what the public sees).
  const allExpenses = sortExpensesNewestFirst(state.expenses).slice(0, rowLimit);

  return {
    ...snapshot,
    expenses: allExpenses,
    reports: sortReportsNewestFirst(state.reports),
    impactStats: sortImpactStats(ledgerStats),
    // `expenseCount` counts published rows only, so it cannot answer "are there
    // more drafts?". A full window is the only signal available without a
    // second count query.
    hasMoreExpenses: allExpenses.length >= rowLimit,
  };
}

/** Just the derived figures — no expense rows, no reports. */
export interface AllocationSummaryData {
  allocation: TransparencySnapshot["allocation"];
  totalSen: number;
  impactStats: ImpactStatRecord[];
  source: TransparencySource;
}

/**
 * The subset /donate needs.
 *
 * That page renders five percentages and three counters, so calling
 * `readTransparencySnapshot` made it fetch 120 expense rows and every financial
 * report on each revalidation only to discard them before serialisation. This
 * runs two cheap queries instead.
 */
export async function readAllocationSummary(): Promise<AllocationSummaryData> {
  try {
    const [grouped, impactStats] = await Promise.all([
      prisma.expenseItem.groupBy({
        by: ["category"],
        where: { isPublished: true },
        _sum: { amountSen: true },
        _count: { _all: true },
      }),
      prisma.impactStat.findMany({
        where: { isPublished: true, key: { notIn: HOME_METRIC_KEY_LIST } },
        orderBy: { displayOrder: "asc" },
      }),
    ]);

    const totals: CategoryTotal[] = grouped
      .filter((row) => isExpenseCategory(row.category))
      .map((row) => ({
        key: row.category as ExpenseCategoryKey,
        totalSen: row._sum.amountSen ?? 0,
        itemCount: row._count._all,
      }));

    const { allocation, totalSen } = allocationFromTotals(totals);

    return {
      allocation,
      totalSen,
      impactStats: sortImpactStats(
        impactStats.map((s) => ({
          id: s.id,
          key: s.key,
          metricValue: s.metricValue,
          label: s.label,
          labelMs: s.labelMs,
          period: s.period,
          periodMs: s.periodMs,
          displayOrder: s.displayOrder,
          isPublished: s.isPublished,
        }))
      ),
      source: "database",
    };
  } catch (err) {
    if (isProduction()) {
      console.error("[transparency] allocation summary read failed", err);
      return { allocation: [], totalSen: 0, impactStats: [], source: "unavailable" };
    }

    const state = memory();
    const { allocation, totalSen } = allocationFromTotals(
      categoryTotalsFromItems(state.expenses)
    );
    return {
      allocation,
      totalSen,
      impactStats: sortImpactStats(
        ledgerStatsOnly(state.impactStats).filter((s) => s.isPublished)
      ),
      source: "sample",
    };
  }
}

/**
 * The five home-page counters, and nothing else.
 *
 * Deliberately not `readAllocationSummary`: that also runs a `groupBy` over the
 * whole published expense ledger, and the home page discards every figure it
 * derives. This is the narrow read — five rows by key, no aggregate.
 *
 * Returns `[]` rather than throwing on any failure. The caller overlays these
 * onto curated baseline figures, so an unreachable database costs the *override*
 * and never the counter itself.
 */
export async function readHomeImpactStats(): Promise<ImpactStatRecord[]> {
  try {
    const rows = await prisma.impactStat.findMany({
      where: { isPublished: true, key: { in: HOME_METRIC_KEY_LIST } },
      orderBy: { displayOrder: "asc" },
    });

    return rows.map((s) => ({
      id: s.id,
      key: s.key,
      metricValue: s.metricValue,
      label: s.label,
      labelMs: s.labelMs,
      period: s.period,
      periodMs: s.periodMs,
      displayOrder: s.displayOrder,
      isPublished: s.isPublished,
    }));
  } catch (err) {
    if (isProduction()) {
      console.error("[transparency] home impact stats read failed", err);
      return [];
    }
    return memory().impactStats.filter(
      (s) => s.isPublished && isHomeMetricKey(s.key)
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface WriteOutcome<T> {
  record: T;
  persistedTo: MutationTarget;
}

export type ExpenseWriteInput = Omit<ExpenseItemRecord, "id">;
export type ReportWriteInput = Omit<FinancialReportRecord, "id">;
export type ImpactStatWriteInput = Omit<ImpactStatRecord, "id">;

/** Raised when a write is rejected for a reason the operator should see. */
export class DuplicateReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateReportError";
  }
}

export async function createExpenseItem(
  input: ExpenseWriteInput
): Promise<WriteOutcome<ExpenseItemRecord>> {
  const memoryId = newId("exp");

  const { value, target } = await withDatabase(
    async () => {
      const created = await prisma.expenseItem.create({
        data: {
          category: input.category,
          title: input.title,
          amountSen: input.amountSen,
          date: input.date,
          vendorOrClinic: input.vendorOrClinic ?? null,
          petName: input.petName ?? null,
          receiptRef: input.receiptRef ?? null,
          isPublished: input.isPublished,
        },
      });
      return created.id;
    },
    () => {
      memory().expenses.unshift({ ...input, id: memoryId });
      return memoryId;
    }
  );

  return { record: { ...input, id: value }, persistedTo: target };
}

export interface ExpenseUpdateOutcome {
  before: ExpenseItemRecord | null;
  record: ExpenseItemRecord;
  persistedTo: MutationTarget;
}

export async function updateExpenseItem(
  id: string,
  input: Partial<ExpenseWriteInput>
): Promise<ExpenseUpdateOutcome | null> {
  let before: ExpenseItemRecord | null = null;

  const { value, target } = await withDatabase<ExpenseItemRecord | null>(
    async () => {
      // Read first so the audit log can record what the figures were. An
      // amount change on a published ledger is otherwise unauditable.
      const previous = await prisma.expenseItem.findUnique({ where: { id } });
      before = previous ? toExpenseRecord(previous) : null;

      const updated = await orNullIfMissing(() =>
        prisma.expenseItem.update({ where: { id }, data: input })
      );
      if (!updated) return null;
      return {
        id: updated.id,
        category: updated.category as ExpenseCategoryKey,
        title: updated.title,
        amountSen: updated.amountSen,
        date: updated.date,
        vendorOrClinic: updated.vendorOrClinic,
        petName: updated.petName,
        receiptRef: updated.receiptRef,
        isPublished: updated.isPublished,
      };
    },
    () => {
      const state = memory();
      const idx = state.expenses.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      before = { ...state.expenses[idx] };
      state.expenses[idx] = { ...state.expenses[idx], ...input };
      return state.expenses[idx];
    }
  );

  return value ? { before, record: value, persistedTo: target } : null;
}

export async function deleteExpenseItem(
  id: string
): Promise<WriteOutcome<ExpenseItemRecord> | null> {
  // The removed row is returned, not a boolean: deleting a ledger entry moves
  // the published allocation percentages, so the audit trail has to say what
  // was taken out. A cuid alone resolves to nothing once the row is gone.
  const { value, target } = await withDatabase<ExpenseItemRecord | null>(
    async () => {
      const deleted = await orNullIfMissing(() =>
        prisma.expenseItem.delete({ where: { id } })
      );
      return deleted ? toExpenseRecord(deleted) : null;
    },
    () => {
      const state = memory();
      const idx = state.expenses.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      return state.expenses.splice(idx, 1)[0];
    }
  );

  return value ? { record: value, persistedTo: target } : null;
}

export async function createFinancialReport(
  input: ReportWriteInput
): Promise<WriteOutcome<FinancialReportRecord>> {
  const memoryId = newId("rpt");

  const { value, target } = await withDatabase(
    async () => {
      // Guards against a double submit or a retried request duplicating a
      // statement. `month` is nullable, and Postgres treats NULLs as distinct
      // in a unique index, so this is checked in code rather than by constraint.
      const existing = await prisma.financialReport.findFirst({
        where: { year: input.year, month: input.month, title: input.title },
        select: { id: true },
      });
      if (existing) {
        throw new DuplicateReportError(
          `A report titled "${input.title}" already exists for that period.`
        );
      }

      const created = await prisma.financialReport.create({
        data: {
          year: input.year,
          month: input.month,
          title: input.title,
          fileUrl: input.fileUrl,
          summary: input.summary ?? null,
          publishedAt: new Date(input.publishedAt),
          isPublished: input.isPublished,
        },
      });
      return created.id;
    },
    () => {
      const state = memory();
      const duplicate = state.reports.find(
        (r) => r.year === input.year && r.month === input.month && r.title === input.title
      );
      if (duplicate) {
        throw new DuplicateReportError(
          `A report titled "${input.title}" already exists for that period.`
        );
      }
      state.reports.unshift({ ...input, id: memoryId });
      return memoryId;
    }
  );

  return { record: { ...input, id: value }, persistedTo: target };
}

export async function deleteFinancialReport(
  id: string
): Promise<WriteOutcome<FinancialReportRecord> | null> {
  const { value, target } = await withDatabase<FinancialReportRecord | null>(
    async () => {
      const deleted = await orNullIfMissing(() =>
        prisma.financialReport.delete({ where: { id } })
      );
      return deleted
        ? {
            id: deleted.id,
            year: deleted.year,
            month: deleted.month,
            title: deleted.title,
            fileUrl: deleted.fileUrl,
            summary: deleted.summary,
            publishedAt: toIso(deleted.publishedAt),
            isPublished: deleted.isPublished,
          }
        : null;
    },
    () => {
      const state = memory();
      const idx = state.reports.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      return state.reports.splice(idx, 1)[0];
    }
  );

  return value ? { record: value, persistedTo: target } : null;
}

/**
 * Impact counters are keyed, not free-listed: updating "animals_fed_last_month"
 * must overwrite the existing card rather than append a second one.
 */
export async function upsertImpactStat(
  input: ImpactStatWriteInput
): Promise<WriteOutcome<ImpactStatRecord>> {
  const memoryId = newId("stat");
  const data = {
    metricValue: input.metricValue,
    label: input.label,
    labelMs: input.labelMs ?? null,
    period: input.period,
    periodMs: input.periodMs ?? null,
    displayOrder: input.displayOrder,
    isPublished: input.isPublished,
  };

  const { value, target } = await withDatabase(
    async () => {
      const saved = await prisma.impactStat.upsert({
        where: { key: input.key },
        create: { key: input.key, ...data },
        update: data,
      });
      return saved.id;
    },
    () => {
      const state = memory();
      const idx = state.impactStats.findIndex((s) => s.key === input.key);
      if (idx >= 0) {
        state.impactStats[idx] = { ...state.impactStats[idx], ...input };
        return state.impactStats[idx].id;
      }
      state.impactStats.push({ ...input, id: memoryId });
      return memoryId;
    }
  );

  return { record: { ...input, id: value }, persistedTo: target };
}

export async function deleteImpactStat(
  key: string
): Promise<WriteOutcome<ImpactStatRecord> | null> {
  const { value, target } = await withDatabase<ImpactStatRecord | null>(
    async () => {
      const deleted = await orNullIfMissing(() =>
        prisma.impactStat.delete({ where: { key } })
      );
      return deleted
        ? {
            id: deleted.id,
            key: deleted.key,
            metricValue: deleted.metricValue,
            label: deleted.label,
            labelMs: deleted.labelMs,
            period: deleted.period,
            periodMs: deleted.periodMs,
            displayOrder: deleted.displayOrder,
            isPublished: deleted.isPublished,
          }
        : null;
    },
    () => {
      const state = memory();
      const idx = state.impactStats.findIndex((s) => s.key === key);
      if (idx === -1) return null;
      return state.impactStats.splice(idx, 1)[0];
    }
  );

  return value ? { record: value, persistedTo: target } : null;
}
