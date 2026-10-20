import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryVar } from "@/components/features/transparency/palette";
import {
  EXPENSE_CATEGORIES,
  ExpenseItemRecord,
  allocationFromTotals,
  buildSnapshot,
  categoryTotalsFromItems,
  computeAllocation,
  emptySnapshot,
  formatLongDate,
  formatMYR,
  formatMonthYear,
  formatReportPeriod,
  formatTimestampDate,
  getCategoryMeta,
  groupExpensesByMonth,
  isExpenseCategory,
  isIsoDate,
  parseRinggitToSen,
  sortExpensesNewestFirst,
  sortReportsNewestFirst,
} from "@/lib/domain/transparency";
import {
  expenseItemSchema,
  financialReportSchema,
  impactStatSchema,
} from "@/lib/validations/transparency";
import baseline from "@/data/transparency.json";

/**
 * `DATABASE_URL` in this project points at a Neon PRODUCTION branch, so Prisma
 * is mocked for the whole suite — no test can reach a real database. The mock is
 * per-test configurable so the database code path is genuinely exercised rather
 * than skipped, which was the coverage gap in the first version of this file.
 */
const prismaMock = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  });
  return {
    expenseItem: model(),
    financialReport: model(),
    impactStat: model(),
    auditLog: { create: vi.fn(() => Promise.resolve({})) },
  };
});

vi.mock("@/lib/server/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sessionMock = vi.hoisted(() => ({ getCurrentSession: vi.fn() }));
vi.mock("@/lib/security/session", () => sessionMock);

// The actions resolve their principal through the DAL, which re-reads the member's row.
// Answered here as a reachable database would answer for an active member holding the
// cookie's role. Without it the mocked Prisma above has no `user` model, the lookup throws,
// and every test in this file would pass through the DAL's database-outage path instead —
// the right answers for the wrong reason. Suspension itself is covered in
// tests/unit/security/suspendedMemberContentActions.test.ts.
vi.mock("@/lib/server/memberStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/memberStore")>()),
  findMemberAuthStateById: vi.fn(async (id: string) => {
    const session = await sessionMock.getCurrentSession();
    return session && session.id === id
      ? { role: session.role, status: "ACTIVE", name: session.name, email: session.email }
      : null;
  }),
}));

/** Makes every Prisma call reject the way an unreachable server does. */
function makeDatabaseUnreachable() {
  const unreachable = () => {
    const err = new Error("Can't reach database server") as Error & { code: string };
    err.name = "PrismaClientKnownRequestError";
    err.code = "P1001";
    return Promise.reject(err);
  };

  for (const model of [
    prismaMock.expenseItem,
    prismaMock.financialReport,
    prismaMock.impactStat,
  ]) {
    for (const fn of Object.values(model)) {
      (fn as ReturnType<typeof vi.fn>).mockImplementation(unreachable);
    }
  }
}

function expense(
  overrides: Partial<ExpenseItemRecord> & Pick<ExpenseItemRecord, "id">
): ExpenseItemRecord {
  return {
    category: "MEDICAL",
    title: "Test expense",
    amountSen: 10000,
    date: "2026-01-01",
    vendorOrClinic: null,
    petName: null,
    receiptRef: null,
    isPublished: true,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  makeDatabaseUnreachable();
  const store = await import("@/lib/server/transparencyRepository");
  store.resetTransparencyMemory();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* -------------------------------------------------------------------------- */
/* Pure domain                                                                 */
/* -------------------------------------------------------------------------- */

describe("Transparency domain - dates", () => {
  it("accepts a real ISO calendar date", () => {
    expect(isIsoDate("2026-08-14")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects malformed and impossible dates", () => {
    expect(isIsoDate("14/08/2026")).toBe(false);
    expect(isIsoDate("March 2026")).toBe(false);
    expect(isIsoDate("2026-8-14")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false); // shape-valid, calendar-invalid
    expect(isIsoDate("2025-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("formats month and long dates in both languages", () => {
    expect(formatMonthYear("2026-03-11")).toBe("March 2026");
    expect(formatMonthYear("2026-03-11", true)).toBe("Mac 2026");
    expect(formatLongDate("2026-08-14")).toBe("14 August 2026");
    expect(formatLongDate("2026-08-14", true)).toBe("14 Ogos 2026");
  });

  it("labels report periods by month or annual", () => {
    expect(formatReportPeriod(2026, 8)).toBe("August 2026");
    expect(formatReportPeriod(2025, null)).toBe("Annual 2025");
    expect(formatReportPeriod(2025, null, true)).toBe("Tahunan 2025");
  });

  it("formats a timestamp from its UTC calendar date, not the local timezone", () => {
    // 23:30 UTC is already the next day in Malaysia (UTC+8). Rendering via
    // `new Date().toLocaleDateString()` would therefore disagree between a UTC
    // server and a Malaysian browser, producing a hydration mismatch.
    expect(formatTimestampDate("2026-03-28T23:30:00.000Z")).toBe("28 March 2026");
    expect(formatTimestampDate("2026-01-01T00:00:00.000Z")).toBe("1 January 2026");
    expect(formatTimestampDate("2026-01-01T00:00:00.000Z", true)).toBe("1 Januari 2026");
  });

  it("never consults the local clock, so it cannot vary by timezone", () => {
    // Asserted structurally rather than by reassigning process.env.TZ: that does
    // not reliably repoint V8's timezone mid-process, and restoring an
    // originally-unset TZ writes the literal string "undefined" for every later
    // test in the worker. A timestamp at 23:30 UTC is the following day in
    // Malaysia (UTC+8); the output must still be the UTC calendar date.
    expect(formatTimestampDate("2026-03-28T23:30:00.000Z")).toBe("28 March 2026");
    expect(formatTimestampDate("2026-03-28T00:30:00.000Z")).toBe("28 March 2026");
    expect(formatTimestampDate("2026-12-31T16:00:00.000Z")).toBe("31 December 2026");
  });

  it("returns the input unchanged when it is not a date at all", () => {
    expect(formatTimestampDate("not-a-date")).toBe("not-a-date");
  });
});

describe("Transparency domain - money", () => {
  it("formats sen as ringgit with thousands separators", () => {
    expect(formatMYR(145000)).toBe("RM 1,450");
    expect(formatMYR(0)).toBe("RM 0");
    expect(formatMYR(10000000)).toBe("RM 100,000");
  });

  it("shows cents only when the amount is not whole ringgit", () => {
    expect(formatMYR(145075)).toBe("RM 1,450.75");
    expect(formatMYR(145000, { withCents: true })).toBe("RM 1,450.00");
  });

  it("parses typed ringgit amounts into integer sen", () => {
    expect(parseRinggitToSen("1450")).toBe(145000);
    expect(parseRinggitToSen("1,450.75")).toBe(145075);
    expect(parseRinggitToSen("RM 1450")).toBe(145000);
    expect(parseRinggitToSen(" 12.5 ")).toBe(1250);
  });

  it("groups large amounts without relying on the runtime's Intl data", () => {
    // Rendered on the server and hydrated in the browser, so the output must not
    // depend on which ICU dataset the runtime happens to ship.
    expect(formatMYR(123_456_789)).toBe("RM 1,234,567.89");
    expect(formatMYR(100_000_000)).toBe("RM 1,000,000");
    expect(formatMYR(99_900)).toBe("RM 999");
    expect(formatMYR(100)).toBe("RM 1");
    expect(formatMYR(1)).toBe("RM 0.01");
    expect(formatMYR(-145000)).toBe("-RM 1,450");
  });

  it("does not emit malformed output for non-integer or non-finite input", () => {
    // Splitting whole ringgit from cents assumes a whole number of sen; without
    // a guard these produced "RM 14.50.5" and "RM NaN.NaN".
    // 1450.5 sen is RM 14.505, which rounds to 1451 sen = RM 14.51.
    expect(formatMYR(1450.5)).toBe("RM 14.51");
    expect(formatMYR(1450.4)).toBe("RM 14.50");
    expect(formatMYR(NaN)).toBe("RM 0");
    expect(formatMYR(Infinity)).toBe("RM 0");
  });

  it("rejects amounts it cannot parse rather than guessing", () => {
    expect(parseRinggitToSen("about a thousand")).toBeNull();
    expect(parseRinggitToSen("1450.755")).toBeNull();
    expect(parseRinggitToSen("")).toBeNull();
    expect(parseRinggitToSen("-50")).toBeNull();
  });
});

describe("computeAllocation", () => {
  it("sums per category and orders largest first", () => {
    const { allocation, totalSen, expenseCount } = computeAllocation([
      expense({ id: "a", category: "MEDICAL", amountSen: 4000 }),
      expense({ id: "b", category: "FOOD_NUTRITION", amountSen: 6000 }),
      expense({ id: "c", category: "MEDICAL", amountSen: 1000 }),
    ]);

    expect(totalSen).toBe(11000);
    expect(expenseCount).toBe(3);
    expect(allocation.map((s) => s.key)).toEqual(["FOOD_NUTRITION", "MEDICAL"]);
    expect(allocation[1].itemCount).toBe(2);
  });

  it("always produces percentages summing to exactly 100", () => {
    const { allocation } = computeAllocation([
      expense({ id: "a", category: "MEDICAL", amountSen: 1000 }),
      expense({ id: "b", category: "FOOD_NUTRITION", amountSen: 1000 }),
      expense({ id: "c", category: "SHELTER_MAINTENANCE", amountSen: 1000 }),
    ]);

    expect(allocation.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it("keeps the sum at 100 across many awkward splits", () => {
    const amounts = [
      [1, 1, 1, 1, 1],
      [7, 11, 13, 17, 19],
      [1, 2, 3, 4, 5],
      [999, 1, 1, 1, 1],
      [333, 333, 334],
    ];

    for (const set of amounts) {
      const { allocation } = computeAllocation(
        set.map((amount, idx) =>
          expense({
            id: `x${idx}`,
            category: EXPENSE_CATEGORIES[idx].key,
            amountSen: amount,
          })
        )
      );
      expect(allocation.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
    }
  });

  it("excludes unpublished and non-positive entries", () => {
    const { allocation, totalSen } = computeAllocation([
      expense({ id: "a", category: "MEDICAL", amountSen: 1000 }),
      expense({ id: "b", category: "FOOD_NUTRITION", amountSen: 5000, isPublished: false }),
      expense({ id: "c", category: "STAFF_CARE", amountSen: 0 }),
    ]);

    expect(totalSen).toBe(1000);
    expect(allocation).toHaveLength(1);
    expect(allocation[0].key).toBe("MEDICAL");
  });

  it("returns an empty allocation for an empty ledger instead of dividing by zero", () => {
    const { allocation, totalSen } = computeAllocation([]);
    expect(allocation).toEqual([]);
    expect(totalSen).toBe(0);
  });

  it("gives identical figures whether aggregated from rows or from totals", () => {
    const items = [
      expense({ id: "a", category: "MEDICAL", amountSen: 4000 }),
      expense({ id: "b", category: "FOOD_NUTRITION", amountSen: 6000 }),
      expense({ id: "c", category: "MEDICAL", amountSen: 1000 }),
    ];

    const fromRows = computeAllocation(items);
    const fromTotals = allocationFromTotals(categoryTotalsFromItems(items));

    expect(fromTotals).toEqual(fromRows);
  });

  it("ignores unknown categories coming back from an aggregate", () => {
    const { allocation, totalSen } = allocationFromTotals([
      { key: "MEDICAL", totalSen: 1000, itemCount: 1 },
      // A category removed from the enum but still present in old rows.
      { key: "PARTY_FUND" as never, totalSen: 9999, itemCount: 3 },
    ]);

    expect(allocation).toHaveLength(1);
    expect(totalSen).toBe(1000);
  });
});

describe("Ordering and grouping", () => {
  it("sorts expenses newest first using ISO string order", () => {
    const sorted = sortExpensesNewestFirst([
      expense({ id: "a", date: "2026-01-05" }),
      expense({ id: "b", date: "2026-11-02" }),
      expense({ id: "c", date: "2026-02-28" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("uses a consistent comparator for entries sharing a date", () => {
    // A comparator that never returns 0 makes same-day ordering unspecified.
    const sameDay = [
      expense({ id: "a", date: "2026-05-05" }),
      expense({ id: "b", date: "2026-05-05" }),
      expense({ id: "c", date: "2026-05-05" }),
    ];
    expect(sortExpensesNewestFirst(sameDay).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(sortExpensesNewestFirst([...sameDay].reverse()).map((e) => e.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("groups the feed by month, newest month first, with subtotals", () => {
    const groups = groupExpensesByMonth([
      expense({ id: "a", date: "2026-08-14", amountSen: 1000 }),
      expense({ id: "b", date: "2026-08-01", amountSen: 500 }),
      expense({ id: "c", date: "2026-07-03", amountSen: 250 }),
    ]);

    expect(groups.map((g) => g.monthKey)).toEqual(["2026-08", "2026-07"]);
    expect(groups[0].monthLabel).toBe("August 2026");
    expect(groups[0].subtotalSen).toBe(1500);
    expect(groups[1].items).toHaveLength(1);
  });

  it("sorts reports by year, newest year first", () => {
    const sorted = sortReportsNewestFirst([
      { id: "a", year: 2025, month: null, title: "", fileUrl: "/a.pdf", publishedAt: "", isPublished: true },
      { id: "b", year: 2026, month: 7, title: "", fileUrl: "/b.pdf", publishedAt: "", isPublished: true },
      { id: "c", year: 2026, month: 8, title: "", fileUrl: "/c.pdf", publishedAt: "", isPublished: true },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("puts the annual report first WITHIN its own year", () => {
    // The previous fixture compared an annual 2025 against monthly 2026 reports,
    // so the year comparator alone decided the order and this claim — which the
    // implementation actually got backwards — was never exercised.
    const sorted = sortReportsNewestFirst([
      { id: "jul", year: 2026, month: 7, title: "", fileUrl: "/j.pdf", publishedAt: "", isPublished: true },
      { id: "annual", year: 2026, month: null, title: "", fileUrl: "/a.pdf", publishedAt: "", isPublished: true },
      { id: "aug", year: 2026, month: 8, title: "", fileUrl: "/g.pdf", publishedAt: "", isPublished: true },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["annual", "aug", "jul"]);
  });
});

describe("buildSnapshot", () => {
  it("drops unpublished rows from every collection", () => {
    const snapshot = buildSnapshot({
      expenses: [
        expense({ id: "shown", date: "2026-05-01" }),
        expense({ id: "hidden", date: "2026-06-01", isPublished: false }),
      ],
      reports: [
        { id: "r1", year: 2026, month: null, title: "Shown", fileUrl: "/a.pdf", publishedAt: "", isPublished: true },
        { id: "r2", year: 2026, month: 1, title: "Hidden", fileUrl: "/b.pdf", publishedAt: "", isPublished: false },
      ],
      impactStats: [
        { id: "s1", key: "shown", metricValue: "1", label: "Shown", period: "2026", displayOrder: 1, isPublished: true },
        { id: "s2", key: "hidden", metricValue: "2", label: "Hidden", period: "2026", displayOrder: 2, isPublished: false },
      ],
      source: "sample",
    });

    expect(snapshot.expenses.map((e) => e.id)).toEqual(["shown"]);
    expect(snapshot.reports.map((r) => r.id)).toEqual(["r1"]);
    expect(snapshot.impactStats.map((s) => s.key)).toEqual(["shown"]);
    expect(snapshot.lastExpenseDate).toBe("2026-05-01");
    expect(snapshot.source).toBe("sample");
  });

  it("reports more entries than it carries when given a bounded window", () => {
    const snapshot = buildSnapshot({
      expenses: [expense({ id: "a", amountSen: 1000 })],
      reports: [],
      impactStats: [],
      source: "database",
      // Aggregate says the ledger holds 40 rows; only 1 was fetched.
      totals: [{ key: "MEDICAL", totalSen: 400000, itemCount: 40 }],
    });

    expect(snapshot.expenses).toHaveLength(1);
    expect(snapshot.expenseCount).toBe(40);
    expect(snapshot.hasMoreExpenses).toBe(true);
    // Chart figures come from the aggregate, not the window.
    expect(snapshot.totalSen).toBe(400000);
  });

  it("never lists a row that the totals exclude", () => {
    // A refund and a zero-value in-kind row are dropped by the aggregate. If the
    // feed still listed them, the month subtotals would disagree with the chart
    // on the same page — two answers to one financial question.
    const snapshot = buildSnapshot({
      expenses: [
        expense({ id: "ok", category: "MEDICAL", amountSen: 800000, date: "2026-05-03" }),
        expense({ id: "refund", category: "STAFF_CARE", amountSen: -20000, date: "2026-05-02" }),
        expense({ id: "zero", category: "FOOD_NUTRITION", amountSen: 0, date: "2026-05-01" }),
      ],
      reports: [],
      impactStats: [],
      source: "database",
    });

    expect(snapshot.expenses.map((e) => e.id)).toEqual(["ok"]);
    expect(snapshot.expenseCount).toBe(1);
    expect(snapshot.hasMoreExpenses).toBe(false);

    const feedTotal = snapshot.expenses.reduce((sum, e) => sum + e.amountSen, 0);
    expect(feedTotal).toBe(snapshot.totalSen);
  });

  it("produces an honest empty snapshot with no invented figures", () => {
    const snapshot = emptySnapshot("unavailable");
    expect(snapshot.expenses).toEqual([]);
    expect(snapshot.allocation).toEqual([]);
    expect(snapshot.totalSen).toBe(0);
    expect(snapshot.expenseCount).toBe(0);
    expect(snapshot.hasMoreExpenses).toBe(false);
    expect(snapshot.source).toBe("unavailable");
  });
});

describe("Baseline dataset integrity", () => {
  const data = baseline as unknown as {
    expenses: { category: string; date: string; amountSen: number; id: string }[];
    reports: { fileUrl: string; year: number; month: number | null; summary: string }[];
    impactStats: { key: string }[];
  };

  it("uses only known categories, ISO dates and positive integer amounts", () => {
    for (const item of data.expenses) {
      expect(isExpenseCategory(item.category)).toBe(true);
      expect(isIsoDate(item.date)).toBe(true);
      expect(Number.isInteger(item.amountSen)).toBe(true);
      expect(item.amountSen).toBeGreaterThan(0);
    }
  });

  it("has no duplicate ids or impact-stat keys", () => {
    const ids = data.expenses.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = data.impactStats.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("points every report at a site-relative path or https URL", () => {
    // Checked through the schema itself so the fixture and the rule cannot
    // disagree about what is allowed — the previous hand-rolled regex did.
    for (const report of data.reports) {
      expect(
        financialReportSchema.safeParse({
          year: report.year,
          month: report.month,
          title: "Fixture",
          fileUrl: report.fileUrl,
          publishedAt: "2026-01-01T00:00:00.000Z",
        }).success
      ).toBe(true);
    }
  });

  it("labels every sample report so a placeholder cannot pass as a filed statement", () => {
    for (const report of data.reports) {
      expect(report.summary.startsWith("SAMPLE DOCUMENT")).toBe(true);
    }
  });

  it("passes its own schema validation", () => {
    for (const item of data.expenses) {
      expect(expenseItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("produces a documented allocation that sums to 100%", () => {
    const records = data.expenses.map((e) =>
      expense({ ...(e as Partial<ExpenseItemRecord>), id: e.id })
    );
    const { allocation, totalSen } = computeAllocation(records);

    expect(totalSen).toBe(10_000_000); // RM 100,000
    expect(allocation.reduce((sum, s) => sum + s.percent, 0)).toBe(100);

    const byKey = Object.fromEntries(allocation.map((s) => [s.key, s.percent]));
    expect(byKey.MEDICAL).toBe(40);
    expect(byKey.FOOD_NUTRITION).toBe(25);
    expect(byKey.SHELTER_MAINTENANCE).toBe(18);
    expect(byKey.RESCUE_TNRM).toBe(12);
    expect(byKey.STAFF_CARE).toBe(5);
  });
});

describe("Category metadata", () => {
  it("gives every category a bilingual label", () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(cat.label.length).toBeGreaterThan(0);
      expect(cat.labelMs.length).toBeGreaterThan(0);
    }
  });

  it("maps every category to its own colour token, declared in both themes", () => {
    // The palette lives in globals.css rather than in this module, so the guard
    // that matters is no longer "is it a hex" but "does each category resolve to
    // a distinct token that the theme actually defines in light AND dark". A
    // token declared in only one block would silently fall back in the other.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    // Anchored to the block declarations at the start of a line: `.dark` also
    // appears earlier inside `@custom-variant dark (&:is(.dark *))`, and slicing
    // on a bare indexOf produced an empty `:root` section that passed nothing.
    const rootStart = css.search(/^:root \{/m);
    const darkStart = css.search(/^\.dark \{/m);
    expect(rootStart).toBeGreaterThan(-1);
    expect(darkStart).toBeGreaterThan(rootStart);

    const root = css.slice(rootStart, darkStart);
    const dark = css.slice(darkStart);

    const vars = EXPENSE_CATEGORIES.map((c) => categoryVar(c.key));
    expect(new Set(vars).size).toBe(vars.length);

    for (const cssVar of vars) {
      const token = cssVar.slice("var(".length, -1);
      expect(token).toMatch(/^--expense-[a-z]+$/);
      expect(root).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
  });

  it("looks categories up by key and rejects unknown ones", () => {
    expect(getCategoryMeta("MEDICAL")?.label).toBe("Veterinary Surgery & Medicine");
    expect(getCategoryMeta("CRYPTO_MINING")).toBeUndefined();
    expect(isExpenseCategory("STAFF_CARE")).toBe(true);
    expect(isExpenseCategory("staff_care")).toBe(false);
  });
});

describe("Validation schemas", () => {
  const validExpense = {
    category: "MEDICAL",
    title: "Core vaccines for 20 rescues",
    amountSen: 145000,
    date: "2026-07-22",
  };

  it("accepts a well-formed expense", () => {
    expect(expenseItemSchema.safeParse(validExpense).success).toBe(true);
  });

  it("rejects a non-ISO date, which would break chronological sorting", () => {
    expect(expenseItemSchema.safeParse({ ...validExpense, date: "22 July 2026" }).success).toBe(
      false
    );
  });

  it("rejects zero, negative and fractional sen amounts", () => {
    expect(expenseItemSchema.safeParse({ ...validExpense, amountSen: 0 }).success).toBe(false);
    expect(expenseItemSchema.safeParse({ ...validExpense, amountSen: -100 }).success).toBe(false);
    expect(expenseItemSchema.safeParse({ ...validExpense, amountSen: 10.5 }).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(
      expenseItemSchema.safeParse({ ...validExpense, category: "PARTY_FUND" }).success
    ).toBe(false);
  });

  const validReport = {
    year: 2026,
    month: 8,
    title: "Monthly Expenditure Summary",
    fileUrl: "/reports/august.pdf",
    publishedAt: "2026-09-01T00:00:00.000Z",
  };

  it("accepts relative paths and https URLs for report files", () => {
    expect(financialReportSchema.safeParse(validReport).success).toBe(true);
    expect(
      financialReportSchema.safeParse({
        ...validReport,
        fileUrl: "https://example.org/report.pdf",
      }).success
    ).toBe(true);
  });

  it("rejects script-bearing and non-http report links", () => {
    for (const fileUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "reports/relative.pdf",
    ]) {
      expect(financialReportSchema.safeParse({ ...validReport, fileUrl }).success).toBe(false);
    }
  });

  it("rejects protocol-relative URLs that masquerade as site paths", () => {
    // "//evil.example/x.pdf" starts with "/" but is an absolute off-site URL.
    // A bare startsWith("/") check passed it, and the renderer then classified
    // it as internal — so the link omitted rel="noopener noreferrer" while
    // actually navigating away from the site.
    for (const fileUrl of [
      "//evil.example/statement.pdf",
      "///evil.example/statement.pdf",
      "//evil.example",
    ]) {
      expect(financialReportSchema.safeParse({ ...validReport, fileUrl }).success).toBe(false);
    }
    expect(
      financialReportSchema.safeParse({ ...validReport, fileUrl: "/reports/ok.pdf" }).success
    ).toBe(true);
  });

  it("rejects plaintext http, which the error message already promised", () => {
    // These links are presented to donors as audited financial statements; over
    // HTTP from an HTTPS page they are mixed content and MITM-modifiable.
    expect(
      financialReportSchema.safeParse({ ...validReport, fileUrl: "http://old.example/a.pdf" })
        .success
    ).toBe(false);
    expect(
      financialReportSchema.safeParse({ ...validReport, fileUrl: "https://ok.example/a.pdf" })
        .success
    ).toBe(true);
  });

  it("rejects an out-of-range month", () => {
    expect(financialReportSchema.safeParse({ ...validReport, month: 13 }).success).toBe(false);
    expect(financialReportSchema.safeParse({ ...validReport, month: 0 }).success).toBe(false);
    expect(financialReportSchema.safeParse({ ...validReport, month: null }).success).toBe(true);
  });

  const validStat = {
    key: "animals_fed_last_month",
    metricValue: "180",
    label: "Animals fed last month",
    period: "August 2026",
  };

  it("accepts a well-formed impact statistic", () => {
    expect(impactStatSchema.safeParse(validStat).success).toBe(true);
  });

  it("rejects keys that are not stable slugs", () => {
    for (const key of ["Animals Fed", "animals-fed", "animals fed", "AF"]) {
      expect(impactStatSchema.safeParse({ ...validStat, key }).success).toBe(false);
    }
  });

  it("allows non-numeric headline values such as percentages", () => {
    expect(impactStatSchema.safeParse({ ...validStat, metricValue: "100%" }).success).toBe(true);
    expect(impactStatSchema.safeParse({ ...validStat, metricValue: "RM 0" }).success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Store: error classification and the database path                           */
/* -------------------------------------------------------------------------- */

describe("isDatabaseUnavailable", () => {
  it("recognises the codes that mean the database cannot be used", async () => {
    const { isDatabaseUnavailable } = await import("@/lib/server/transparencyRepository");

    // P1001 verified empirically against Prisma 7 with an unreachable server.
    expect(isDatabaseUnavailable({ code: "P1001" })).toBe(true);
    expect(isDatabaseUnavailable({ code: "P2021" })).toBe(true); // table missing
    expect(isDatabaseUnavailable({ code: "ECONNREFUSED" })).toBe(true);
    expect(isDatabaseUnavailable({ name: "PrismaClientInitializationError" })).toBe(true);
  });

  it("treats a rejected write as a real error, not an offline database", async () => {
    const { isDatabaseUnavailable } = await import("@/lib/server/transparencyRepository");

    expect(isDatabaseUnavailable({ code: "P2002" })).toBe(false); // unique violation
    expect(isDatabaseUnavailable({ code: "P2025" })).toBe(false); // record not found
    expect(isDatabaseUnavailable(new Error("boom"))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable("P1001")).toBe(false);
  });
});

describe("readTransparencySnapshot - database path", () => {
  const dbExpenses = [
    {
      id: "db-1",
      category: "MEDICAL",
      title: "Surgery",
      amountSen: 600000,
      date: "2026-08-14",
      vendorOrClinic: "Clinic",
      petName: "Bruno",
      receiptRef: "INV-1",
      isPublished: true,
    },
    {
      id: "db-2",
      category: "FOOD_NUTRITION",
      title: "Kibble",
      amountSen: 400000,
      date: "2026-07-02",
      vendorOrClinic: null,
      petName: null,
      receiptRef: null,
      isPublished: true,
    },
  ];

  function wireDatabase({
    expenses = dbExpenses,
    reports = [] as unknown[],
    stats = [] as unknown[],
    grouped = [
      { category: "MEDICAL", _sum: { amountSen: 600000 }, _count: { _all: 1 } },
      { category: "FOOD_NUTRITION", _sum: { amountSen: 400000 }, _count: { _all: 1 } },
    ],
  } = {}) {
    prismaMock.expenseItem.findMany.mockResolvedValue(expenses);
    prismaMock.expenseItem.groupBy.mockResolvedValue(grouped);
    prismaMock.financialReport.findMany.mockResolvedValue(reports);
    prismaMock.impactStat.findMany.mockResolvedValue(stats);
  }

  it("maps rows and marks the snapshot as coming from the database", async () => {
    wireDatabase({
      reports: [
        {
          id: "r1",
          year: 2025,
          month: null,
          title: "Annual",
          fileUrl: "/r.pdf",
          summary: null,
          publishedAt: new Date("2026-03-28T09:00:00.000Z"),
          isPublished: true,
        },
      ],
      stats: [
        {
          id: "s1",
          key: "fed",
          metricValue: "180",
          label: "Fed",
          labelMs: null,
          period: "Aug",
          periodMs: null,
          displayOrder: 1,
          isPublished: true,
        },
      ],
    });

    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");
    const snapshot = await readTransparencySnapshot();

    expect(snapshot.source).toBe("database");
    expect(snapshot.expenses.map((e) => e.id)).toEqual(["db-1", "db-2"]);
    expect(snapshot.expenses[0].petName).toBe("Bruno");
    expect(snapshot.impactStats[0].key).toBe("fed");
    // Prisma returns a Date; the record contract is an ISO string.
    expect(snapshot.reports[0].publishedAt).toBe("2026-03-28T09:00:00.000Z");
    expect(typeof snapshot.reports[0].publishedAt).toBe("string");
  });

  it("derives allocation from the aggregate, not from the fetched window", async () => {
    wireDatabase({
      expenses: [dbExpenses[0]], // only one row fetched
      grouped: [
        { category: "MEDICAL", _sum: { amountSen: 7_500_000 }, _count: { _all: 90 } },
        { category: "FOOD_NUTRITION", _sum: { amountSen: 2_500_000 }, _count: { _all: 30 } },
      ],
    });

    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");
    const snapshot = await readTransparencySnapshot();

    expect(snapshot.expenses).toHaveLength(1);
    expect(snapshot.totalSen).toBe(10_000_000);
    expect(snapshot.expenseCount).toBe(120);
    expect(snapshot.hasMoreExpenses).toBe(true);

    const byKey = Object.fromEntries(snapshot.allocation.map((s) => [s.key, s.percent]));
    expect(byKey.MEDICAL).toBe(75);
    expect(byKey.FOOD_NUTRITION).toBe(25);
  });

  it("bounds the public query and asks only for published rows", async () => {
    wireDatabase();
    const { readTransparencySnapshot, PUBLIC_FEED_LIMIT } = await import(
      "@/lib/server/transparencyRepository"
    );
    await readTransparencySnapshot();

    const args = prismaMock.expenseItem.findMany.mock.calls[0][0];
    expect(args.take).toBe(PUBLIC_FEED_LIMIT);
    expect(args.where).toEqual({ isPublished: true });
    // A date-only sort with `take` cuts same-day rows arbitrarily, so which of
    // them fall inside the window would vary between requests.
    expect(args.orderBy).toEqual([{ date: "desc" }, { id: "desc" }]);
    expect(prismaMock.expenseItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true } })
    );
  });

  it("uses the wider admin limit and includes drafts when asked", async () => {
    wireDatabase();
    const { readTransparencySnapshot, ADMIN_LEDGER_LIMIT } = await import(
      "@/lib/server/transparencyRepository"
    );
    await readTransparencySnapshot({ includeUnpublished: true });

    const args = prismaMock.expenseItem.findMany.mock.calls[0][0];
    expect(args.take).toBe(ADMIN_LEDGER_LIMIT);
    expect(args.where).toEqual({});
    // The chart still reflects published rows only.
    expect(prismaMock.expenseItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true } })
    );
  });

  it("treats a reachable but empty database as an empty ledger, not sample data", async () => {
    wireDatabase({ expenses: [], grouped: [], reports: [], stats: [] });

    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");
    const snapshot = await readTransparencySnapshot();

    expect(snapshot.source).toBe("database");
    expect(snapshot.expenses).toEqual([]);
    expect(snapshot.totalSen).toBe(0);
    // The bundled sample ledger must not leak in to fill the gap.
    expect(snapshot.allocation).toEqual([]);
  });

  it("skips rows whose category is no longer part of the enum", async () => {
    wireDatabase({
      expenses: [{ ...dbExpenses[0], category: "PARTY_FUND" }],
      grouped: [{ category: "PARTY_FUND", _sum: { amountSen: 1 }, _count: { _all: 1 } }],
    });

    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");
    const snapshot = await readTransparencySnapshot();

    expect(snapshot.expenses).toEqual([]);
    expect(snapshot.allocation).toEqual([]);
  });
});

describe("readTransparencySnapshot - failure handling", () => {
  it("falls back to the labelled sample dataset outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");

    const snapshot = await readTransparencySnapshot();

    expect(snapshot.source).toBe("sample");
    expect(snapshot.expenses.length).toBeGreaterThan(0);
  });

  it("NEVER serves sample figures in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");
    const snapshot = await readTransparencySnapshot();

    expect(snapshot.source).toBe("unavailable");
    expect(snapshot.expenses).toEqual([]);
    expect(snapshot.allocation).toEqual([]);
    expect(snapshot.totalSen).toBe(0);
    expect(snapshot.impactStats).toEqual([]);
    expect(snapshot.reports).toEqual([]);

    consoleError.mockRestore();
  });
});

describe("Write failures", () => {
  it("does not silently absorb a rejected write into memory", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const rejected = new Error("Unique constraint failed") as Error & { code: string };
    rejected.code = "P2002";
    prismaMock.expenseItem.create.mockRejectedValue(rejected);

    const { createExpenseItem, readTransparencySnapshot } = await import(
      "@/lib/server/transparencyRepository"
    );

    await expect(
      createExpenseItem({
        category: "MEDICAL",
        title: "Rejected entry",
        amountSen: 1000,
        date: "2026-09-01",
        isPublished: true,
      })
    ).rejects.toThrow(/Unique constraint/);

    // And it must not have landed in the in-memory mirror either.
    const snapshot = await readTransparencySnapshot();
    expect(snapshot.expenses.some((e) => e.title === "Rejected entry")).toBe(false);
  });

  it("falls back to memory only when the database is genuinely unavailable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { createExpenseItem } = await import("@/lib/server/transparencyRepository");

    const result = await createExpenseItem({
      category: "MEDICAL",
      title: "Offline entry",
      amountSen: 1000,
      date: "2026-09-01",
      isPublished: true,
    });

    expect(result.persistedTo).toBe("memory");
  });

  it("refuses to fall back to memory in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createExpenseItem } = await import("@/lib/server/transparencyRepository");

    await expect(
      createExpenseItem({
        category: "MEDICAL",
        title: "Production entry",
        amountSen: 1000,
        date: "2026-09-01",
        isPublished: true,
      })
    ).rejects.toMatchObject({ code: "P1001" });
  });

  it("reports a missing row as gone rather than as a server error", async () => {
    // Prisma raises P2025 for an update/delete against a row that is not there —
    // an ordinary double-clicked delete. Rethrowing it made the friendly
    // "no longer exists" branch unreachable whenever the database was up.
    vi.stubEnv("NODE_ENV", "production");
    const notFound = new Error("Record to delete does not exist") as Error & { code: string };
    notFound.code = "P2025";
    prismaMock.expenseItem.delete.mockRejectedValue(notFound);
    prismaMock.expenseItem.update.mockRejectedValue(notFound);
    // The update now reads the prior row first, for the audit trail's `before`.
    prismaMock.expenseItem.findUnique.mockResolvedValue(null);

    const { deleteExpenseItem, updateExpenseItem } = await import(
      "@/lib/server/transparencyRepository"
    );

    await expect(deleteExpenseItem("gone")).resolves.toBeNull();
    await expect(updateExpenseItem("gone", { title: "x" })).resolves.toBeNull();
  });

  it("surfaces the missing-row case to the editor as plain language", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // This is the file's first import of the action graph, so `crypto.ts` resolves the
    // session secret now, under production rules — and a production process always has one.
    // It passed before only because the global hook used to load `crypto.ts` first, in test
    // mode, for every file.
    vi.stubEnv("SESSION_SECRET", "transparency-test-only-session-secret-7f3a9c2e");
    const notFound = new Error("Record to delete does not exist") as Error & { code: string };
    notFound.code = "P2025";
    prismaMock.expenseItem.delete.mockRejectedValue(notFound);
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);

    const { deleteExpenseItemAction } = await import("@/actions/transparency");
    const res = await deleteExpenseItemAction("gone");

    expect(res.success).toBe(false);
    expect(res.error).toBe("That expense entry no longer exists.");
  });

  it("returns the removed row so the audit log can record what was deleted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const row = {
      id: "db-9",
      category: "MEDICAL",
      title: "Major surgery",
      amountSen: 6_000_000,
      date: "2026-08-01",
      vendorOrClinic: "Clinic",
      petName: null,
      receiptRef: "INV-9",
      isPublished: true,
    };
    prismaMock.expenseItem.delete.mockResolvedValue(row);

    const { deleteExpenseItem } = await import("@/lib/server/transparencyRepository");
    const removed = await deleteExpenseItem("db-9");

    // A cuid alone resolves to nothing once the row is gone; the amount and
    // category are the only record of why the allocation moved.
    expect(removed?.record.amountSen).toBe(6_000_000);
    expect(removed?.record.category).toBe("MEDICAL");
    expect(removed?.record.receiptRef).toBe("INV-9");
  });

  it("records the prior values when an expense is edited", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const previous = {
      id: "db-8",
      category: "MEDICAL",
      title: "Before",
      amountSen: 100,
      date: "2026-08-01",
      vendorOrClinic: null,
      petName: null,
      receiptRef: null,
      isPublished: true,
    };
    prismaMock.expenseItem.findUnique.mockResolvedValue(previous);
    prismaMock.expenseItem.update.mockResolvedValue({ ...previous, amountSen: 999999 });

    const { updateExpenseItem } = await import("@/lib/server/transparencyRepository");
    const result = await updateExpenseItem("db-8", { amountSen: 999999 });

    expect(result?.before?.amountSen).toBe(100);
    expect(result?.record.amountSen).toBe(999999);
  });

  it("rejects a duplicate financial report", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { createFinancialReport } = await import("@/lib/server/transparencyRepository");

    const report = {
      year: 2025,
      month: null,
      title: "Annual Audited Financial Statements 2025",
      fileUrl: "/reports/x.pdf",
      summary: null,
      publishedAt: "2026-03-28T09:00:00.000Z",
      isPublished: true,
    };

    // The sample ledger already contains this exact report.
    await expect(createFinancialReport(report)).rejects.toThrow(/already exists/);
  });
});

/* -------------------------------------------------------------------------- */
/* Server actions: authorisation and the admin -> public path                  */
/* -------------------------------------------------------------------------- */

const ADMIN = {
  id: "usr-admin-01",
  email: "admin@hopeforstrays.org",
  name: "Admin",
  role: "SUPER_ADMIN" as const,
  expiresAt: Date.now() + 3_600_000,
};

const CONTENT_EDITOR = { ...ADMIN, id: "usr-editor-01", role: "CONTENT_EDITOR" as const };
// Legacy alias: normalises to SUPER_ADMIN, so it keeps access.
const LEGACY_ADMIN = { ...ADMIN, id: "usr-legacy-01", role: "ADMIN" as const };
const COORDINATOR = { ...ADMIN, id: "usr-coord-01", role: "COORDINATOR" as const };
const STAFF = { ...ADMIN, id: "usr-staff-01", role: "STAFF" as const };
const VOLUNTEER = { ...ADMIN, id: "usr-vol-01", role: "VOLUNTEER" as const };

describe("Transparency server actions", () => {
  beforeEach(() => {
    // Actions exercise the development fallback so a write is observable.
    vi.stubEnv("NODE_ENV", "development");
  });

  it("refuses writes from an unauthenticated visitor", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(null);
    const { createExpenseItemAction } = await import("@/actions/transparency");

    const res = await createExpenseItemAction({
      category: "MEDICAL",
      title: "Injected expense",
      amountSen: 100000,
      date: "2026-09-01",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sign in|Authentication/i);
  });

  // The gate is the MANAGE_CONTENT permission, held only by SUPER_ADMIN and
  // CONTENT_EDITOR. VOLUNTEER_COORDINATOR — which the legacy COORDINATOR role
  // normalises to — does not hold it, so a coordinator can no longer edit
  // published financial figures. That is the brief's intent, and a deliberate
  // narrowing of the earlier role-list gate.
  it.each([
    ["STAFF", STAFF],
    ["VOLUNTEER", VOLUNTEER],
    ["COORDINATOR", COORDINATOR],
  ])("refuses writes from %s", async (_name, user) => {
    sessionMock.getCurrentSession.mockResolvedValue(user);
    const { saveImpactStatAction } = await import("@/actions/transparency");

    const res = await saveImpactStatAction({
      key: "unauthorised_edit",
      metricValue: "999",
      label: "Should not publish",
      period: "2026",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not authorized/i);
  });

  it.each([
    ["SUPER_ADMIN", ADMIN],
    ["CONTENT_EDITOR", CONTENT_EDITOR],
    ["ADMIN (legacy alias for SUPER_ADMIN)", LEGACY_ADMIN],
  ])("allows %s to edit the ledger", async (_name, user) => {
    sessionMock.getCurrentSession.mockResolvedValue(user);
    const { createExpenseItemAction } = await import("@/actions/transparency");

    const res = await createExpenseItemAction({
      category: "RESCUE_TNRM",
      title: "TNRM sterilisation drive",
      amountSen: 250000,
      date: "2026-09-01",
    });

    expect(res.success).toBe(true);
  });

  it("surfaces an admin impact-stat edit on the public snapshot", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { saveImpactStatAction } = await import("@/actions/transparency");
    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");

    const before = await readTransparencySnapshot();
    expect(
      before.impactStats.find((s) => s.key === "animals_fed_last_month")?.metricValue
    ).toBe("180");

    const saved = await saveImpactStatAction({
      key: "animals_fed_last_month",
      metricValue: "212",
      label: "Animals fed last month",
      labelMs: "Haiwan diberi makan bulan lalu",
      period: "September 2026",
      periodMs: "September 2026",
      displayOrder: 1,
      isPublished: true,
    });
    expect(saved.success).toBe(true);

    const after = await readTransparencySnapshot();
    const stat = after.impactStats.find((s) => s.key === "animals_fed_last_month");
    expect(stat?.metricValue).toBe("212");
    expect(stat?.period).toBe("September 2026");

    // Upsert by key must overwrite the card, never append a duplicate.
    expect(after.impactStats.filter((s) => s.key === "animals_fed_last_month")).toHaveLength(1);
  });

  it("revalidates every public path that renders ledger figures", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { revalidatePath } = await import("next/cache");
    const { createExpenseItemAction } = await import("@/actions/transparency");

    await createExpenseItemAction({
      category: "MEDICAL",
      title: "Emergency surgery",
      amountSen: 500000,
      date: "2026-09-02",
    });

    const paths = vi.mocked(revalidatePath).mock.calls.map(([p]) => p);
    // All three server-render figures derived from this ledger, so all three
    // must be purged. `/` reads the same `ImpactStat` table for the home page's
    // impact counters; omitting it left a corrected figure stale there for up
    // to five minutes while the other two updated at once.
    expect(paths).toContain("/transparency");
    expect(paths).toContain("/donate");
    expect(paths).toContain("/");
  });

  it("revalidates the home page when an impact counter is edited", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { revalidatePath } = await import("next/cache");
    const { saveImpactStatAction } = await import("@/actions/transparency");

    await saveImpactStatAction({
      key: "home_animals_neutered",
      metricValue: "640+",
      label: "Neutered via TNRM",
      labelMs: "Dimandulkan (TNRM)",
      period: "To date",
      periodMs: "Sehingga kini",
      displayOrder: 10,
      isPublished: true,
    });

    const paths = vi.mocked(revalidatePath).mock.calls.map(([p]) => p);
    expect(paths).toContain("/");
  });

  it("moves the published allocation when an admin adds an expense", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { createExpenseItemAction } = await import("@/actions/transparency");
    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");

    const before = await readTransparencySnapshot();
    const medicalBefore = before.allocation.find((s) => s.key === "MEDICAL")?.percent ?? 0;

    await createExpenseItemAction({
      category: "MEDICAL",
      title: "Major surgical programme",
      amountSen: 5_000_000,
      date: "2026-09-02",
    });

    const after = await readTransparencySnapshot();
    const medicalAfter = after.allocation.find((s) => s.key === "MEDICAL")!.percent;

    expect(after.totalSen).toBe(before.totalSen + 5_000_000);
    expect(medicalAfter).toBeGreaterThan(medicalBefore);
    expect(after.allocation.reduce((n, s) => n + s.percent, 0)).toBe(100);
  });

  it("hides an unpublished expense from the public snapshot", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(CONTENT_EDITOR);
    const { createExpenseItemAction } = await import("@/actions/transparency");
    const { readTransparencySnapshot } = await import("@/lib/server/transparencyRepository");

    await createExpenseItemAction({
      category: "STAFF_CARE",
      title: "Draft entry pending receipt",
      amountSen: 100000,
      date: "2026-09-02",
      isPublished: false,
    });

    const publicView = await readTransparencySnapshot();
    expect(publicView.expenses.some((e) => e.title === "Draft entry pending receipt")).toBe(
      false
    );

    const adminView = await readTransparencySnapshot({ includeUnpublished: true });
    expect(adminView.expenses.some((e) => e.title === "Draft entry pending receipt")).toBe(true);
  });

  it("rejects an invalid payload even from an authorised editor", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const { createExpenseItemAction } = await import("@/actions/transparency");

    const res = await createExpenseItemAction({
      category: "MEDICAL",
      title: "Bad date entry",
      amountSen: 100000,
      date: "September 2026",
    });

    expect(res.success).toBe(false);
  });

  it("does not leak raw database errors to the editor", async () => {
    sessionMock.getCurrentSession.mockResolvedValue(ADMIN);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const leaky = new Error(
      'Invalid `prisma.expenseItem.create()` invocation: column "secret_internal" does not exist'
    ) as Error & { code: string };
    leaky.code = "P2010";
    prismaMock.expenseItem.create.mockRejectedValue(leaky);

    const { createExpenseItemAction } = await import("@/actions/transparency");
    const res = await createExpenseItemAction({
      category: "MEDICAL",
      title: "Triggers a database error",
      amountSen: 100000,
      date: "2026-09-02",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to record expense");
    expect(res.error).not.toMatch(/secret_internal|prisma/i);

    consoleError.mockRestore();
  });

  it("rate limits a runaway client", async () => {
    sessionMock.getCurrentSession.mockResolvedValue({ ...ADMIN, id: "usr-ratelimit-test" });
    const { createExpenseItemAction } = await import("@/actions/transparency");

    const payload = {
      category: "MEDICAL" as const,
      title: "Repeated submission",
      amountSen: 1000,
      date: "2026-09-02",
    };

    const results = [];
    for (let i = 0; i < 65; i++) {
      results.push(await createExpenseItemAction(payload));
    }

    expect(results.filter((r) => r.success).length).toBeLessThanOrEqual(60);
    expect(results.at(-1)?.error).toMatch(/Too many changes/);
  });
});
