"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXPENSE_CATEGORIES,
  ExpenseItemRecord,
  FinancialReportRecord,
  ImpactStatRecord,
  TransparencySnapshot,
  formatMYR,
  formatReportPeriod,
  parseRinggitToSen,
} from "@/lib/domain/transparency";
import { HOME_METRIC_BASELINE } from "@/lib/domain/metrics";
import { categoryVar } from "@/components/features/transparency/palette";
import {
  createExpenseItemAction,
  createFinancialReportAction,
  deleteExpenseItemAction,
  deleteFinancialReportAction,
  deleteImpactStatAction,
  getAdminTransparencySnapshotAction,
  saveImpactStatAction,
  updateExpenseItemAction,
} from "@/actions/transparency";

/**
 * Admin editor for the public transparency page.
 *
 * Role gating is enforced server-side in every action, and the page renders this
 * editor only for a member its gate admitted (`requireAdminSection`). It used to
 * repeat the check here from the browser's copy of the session, which could only
 * disagree: a cached role, or a promotion the cookie had not seen, showed
 * "Insufficient permissions" on a page the server had opened.
 */

const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass =
  "block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

type Tab = "expenses" | "impact" | "reports";

interface Banner {
  kind: "success" | "error" | "warning";
  message: string;
}

/**
 * Today in the VIEWER's timezone, as YYYY-MM-DD.
 *
 * `toISOString()` yields the UTC date, which in Malaysia (UTC+8) is still
 * yesterday between local midnight and 08:00 — so an editor recording a morning
 * expense got yesterday's date pre-filled in a field that looked right, filing
 * it into the wrong month and moving that month's published subtotal.
 */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Built per call, never shared as a module constant: a constant is evaluated
 * once at import, so a tab left open overnight kept offering yesterday's date
 * (and, for the report year, last year after New Year).
 */
function makeEmptyExpense() {
  return {
    id: "",
    category: EXPENSE_CATEGORIES[0].key as string,
    title: "",
    amount: "",
    date: todayLocalIso(),
    vendorOrClinic: "",
    petName: "",
    receiptRef: "",
    isPublished: true,
  };
}

const emptyStat = {
  key: "",
  metricValue: "",
  label: "",
  labelMs: "",
  period: "",
  periodMs: "",
  displayOrder: 0,
  isPublished: true,
};

function makeEmptyReport() {
  return {
    year: new Date().getFullYear(),
    month: "" as string,
    title: "",
    fileUrl: "",
    summary: "",
    publishedAt: todayLocalIso(),
    isPublished: true,
  };
}

export function TransparencyEditor() {
  const [tab, setTab] = useState<Tab>("expenses");
  const [snapshot, setSnapshot] = useState<TransparencySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getAdminTransparencySnapshotAction();
    if (res.success && res.data) {
      setSnapshot(res.data);
    } else {
      setBanner({ kind: "error", message: res.error ?? "Failed to load ledger" });
    }
  }, []);

  useEffect(() => {
    let active = true;
    // State is set only after the await, never synchronously in the effect body.
    void (async () => {
      await refresh();
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [refresh]);

  /** Applies one mutation, then re-reads so the list always matches the server. */
  const run = useCallback(
    async (
      operation: () => Promise<{
        success: boolean;
        error?: string;
        persistedTo?: "database" | "memory";
      }>,
      successMessage: string
    ): Promise<boolean> => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await operation();
        if (!res.success) {
          setBanner({ kind: "error", message: res.error ?? "Operation failed" });
          return false;
        }
        // falls through to the success path below
        await refresh();
        setBanner(
          res.persistedTo === "memory"
            ? {
                kind: "warning",
                message: `${successMessage} — but the database was unreachable, so this change lives only in server memory and will be lost on restart.`,
              }
            : { kind: "success", message: successMessage }
        );
        return true;
      } catch (err) {
        // A Server Action can reject outright — a dropped connection, a 500, or
        // deploy skew. Without this the banner had already been cleared, the
        // spinner stopped, and the editor was left with no feedback at all and
        // an unhandled rejection (every delete button calls this as `void run`).
        setBanner({
          kind: "error",
          message:
            err instanceof Error && err.message
              ? `Could not reach the server: ${err.message}`
              : "Could not reach the server. Your change may not have been saved — reload before retrying.",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading transparency ledger...
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: "expenses", label: "Expense Ledger", icon: BarChart3 },
    { id: "impact", label: "Impact Counters", icon: Gauge },
    { id: "reports", label: "Audit Reports", icon: FileText },
  ];

  return (
    <div className={`max-w-5xl space-y-6`}>

      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Financial Transparency Editor
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Everything here publishes straight to the public{" "}
          <a href="/transparency" target="_blank" rel="noreferrer" className="font-semibold text-foreground underline">
            /transparency
          </a>{" "}
          page. Allocation percentages are computed from the expense ledger — you
          never type a percentage, so the chart cannot disagree with the receipts.
        </p>
      </div>

      {snapshot && snapshot.source !== "database" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface p-4 text-xs font-semibold text-warning-text">
          <Database className="mt-0.5 size-4 shrink-0" />
          {snapshot.source === "sample" ? (
            <span>
              The database is unreachable, so this is the bundled{" "}
              <strong>development sample dataset</strong> — not real spending.
              Run <code className="font-mono">npm run db:push</code> to create
              the tables, then record real expenses here. Edits made now are not
              durable, and the public page is showing a &ldquo;sample
              data&rdquo; banner.
            </span>
          ) : (
            <span>
              The financial ledger could not be read. The public page is showing
              an unavailable notice rather than any figures, and changes cannot
              be saved until the database is reachable.
            </span>
          )}
        </div>
      )}

      {banner && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border p-4 text-xs font-semibold ${
            banner.kind === "success"
              ? "border-success-border bg-success-surface text-success-text "
              : banner.kind === "warning"
                ? "border-warning-border bg-warning-surface text-warning-text "
                : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {banner.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="flex-1">{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-border text-sm font-semibold sm:gap-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 border-b-2 px-1 pb-3 transition-colors ${
              tab === id
                ? "border-primary text-primary-ink"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "expenses" && (
        <ExpensesTab snapshot={snapshot} busy={busy} run={run} />
      )}
      {tab === "impact" && <ImpactTab snapshot={snapshot} busy={busy} run={run} />}
      {tab === "reports" && (
        <ReportsTab snapshot={snapshot} busy={busy} run={run} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

type Runner = (
  operation: () => Promise<{
    success: boolean;
    error?: string;
    persistedTo?: "database" | "memory";
  }>,
  successMessage: string
) => Promise<boolean>;

function ExpensesTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: TransparencySnapshot | null;
  busy: boolean;
  run: Runner;
}) {
  const [form, setForm] = useState(makeEmptyExpense);
  const [localError, setLocalError] = useState<string | null>(null);

  const isEditing = form.id !== "";

  const allocationPreview = useMemo(() => snapshot?.allocation ?? [], [snapshot]);

  const startEdit = (item: ExpenseItemRecord) => {
    setForm({
      id: item.id,
      category: item.category,
      title: item.title,
      amount: (item.amountSen / 100).toFixed(2),
      date: item.date,
      vendorOrClinic: item.vendorOrClinic ?? "",
      petName: item.petName ?? "",
      receiptRef: item.receiptRef ?? "",
      isPublished: item.isPublished,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const amountSen = parseRinggitToSen(form.amount);
    if (amountSen === null) {
      setLocalError("Enter the amount in ringgit, e.g. 1450 or 1450.75");
      return;
    }

    const payload = {
      category: form.category as (typeof EXPENSE_CATEGORIES)[number]["key"],
      title: form.title,
      amountSen,
      date: form.date,
      vendorOrClinic: form.vendorOrClinic || null,
      petName: form.petName || null,
      receiptRef: form.receiptRef || null,
      isPublished: form.isPublished,
    };

    const ok = await run(
      () =>
        isEditing
          ? updateExpenseItemAction(form.id, payload)
          : createExpenseItemAction(payload),
      isEditing ? "Expense updated." : "Expense added to the public ledger."
    );

    if (ok) setForm(makeEmptyExpense());
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">
            {isEditing ? "Edit expense entry" : "Quick-add a major expense"}
          </h2>
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setForm(makeEmptyExpense())}
            >
              Cancel edit
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="exp-category">
              Category
            </label>
            <select
              id="exp-category"
              className={fieldClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="exp-amount">
              Amount (RM)
            </label>
            <input
              id="exp-amount"
              className={fieldClass}
              inputMode="decimal"
              placeholder="1450"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="exp-title">
              What was purchased
            </label>
            <input
              id="exp-title"
              className={fieldClass}
              placeholder="Core vaccines for 20 rescues"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="exp-date">
              Date of expense
            </label>
            <input
              id="exp-date"
              type="date"
              className={fieldClass}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="exp-receipt">
              Invoice / receipt reference
            </label>
            <input
              id="exp-receipt"
              className={fieldClass}
              placeholder="INV-2026-08-441"
              value={form.receiptRef}
              onChange={(e) => setForm({ ...form, receiptRef: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="exp-vendor">
              Vendor or clinic
            </label>
            <input
              id="exp-vendor"
              className={fieldClass}
              placeholder="Vet Central Animal Clinic"
              value={form.vendorOrClinic}
              onChange={(e) => setForm({ ...form, vendorOrClinic: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="exp-pet">
              Pet name (optional)
            </label>
            <input
              id="exp-pet"
              className={fieldClass}
              placeholder="Bruno"
              value={form.petName}
              onChange={(e) => setForm({ ...form, petName: e.target.value })}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          Show on the public transparency page
        </label>

        {localError && (
          <p className="text-xs font-semibold text-destructive">{localError}</p>
        )}

        <Button type="submit" disabled={busy} className="gap-2">
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isEditing ? (
            <Save className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {isEditing ? "Save changes" : "Add expense"}
        </Button>
      </form>

      {/* Live allocation preview: the same computation the public page renders. */}
      {allocationPreview.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/20 p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Live public allocation
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allocationPreview.map((slice) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryVar(slice.key) }}
                  />
                  <span className="truncate text-foreground">{slice.meta.label}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-foreground">
                  {slice.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Ledger ({snapshot?.expenses.length ?? 0} entries)
        </h3>
        <div className="divide-y divide-border rounded-2xl border border-border">
          {(snapshot?.expenses ?? []).map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.title}
                  {!item.isPublished && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.date} · {item.category} ·{" "}
                  <span className="font-semibold tabular-nums">
                    {formatMYR(item.amountSen)}
                  </span>
                  {item.receiptRef ? ` · ${item.receiptRef}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1"
                  onClick={() => startEdit(item)}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1 text-destructive"
                  disabled={busy}
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(`Delete "${item.title}" from the public ledger?`)
                    ) {
                      return;
                    }
                    void run(
                      () => deleteExpenseItemAction(item.id),
                      "Expense removed from the ledger."
                    );
                  }}
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {(snapshot?.expenses.length ?? 0) === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No expenses recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Impact counters                                                             */
/* -------------------------------------------------------------------------- */

function ImpactTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: TransparencySnapshot | null;
  busy: boolean;
  run: Runner;
}) {
  const [form, setForm] = useState(emptyStat);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const startEdit = (stat: ImpactStatRecord) => {
    setEditingKey(stat.key);
    setForm({
      key: stat.key,
      metricValue: stat.metricValue,
      label: stat.label,
      labelMs: stat.labelMs ?? "",
      period: stat.period,
      periodMs: stat.periodMs ?? "",
      displayOrder: stat.displayOrder,
      isPublished: stat.isPublished,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () =>
        saveImpactStatAction({
          key: form.key,
          metricValue: form.metricValue,
          label: form.label,
          labelMs: form.labelMs || null,
          period: form.period,
          periodMs: form.periodMs || null,
          displayOrder: Number(form.displayOrder) || 0,
          isPublished: form.isPublished,
        }),
      editingKey ? "Impact counter updated." : "Impact counter published."
    );
    if (ok) {
      setForm(emptyStat);
      setEditingKey(null);
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">
            {editingKey ? `Edit counter: ${editingKey}` : "Add or update a live counter"}
          </h2>
          {editingKey && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setForm(emptyStat);
                setEditingKey(null);
              }}
            >
              Cancel edit
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="stat-key">
              Key (stable identifier)
            </label>
            <input
              id="stat-key"
              className={fieldClass}
              placeholder="animals_fed_last_month"
              list="stat-key-suggestions"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              disabled={!!editingKey}
              required
            />
            {/*
              The home page's five counters live in this same table under fixed
              keys, and it reads them by exact match — so a typo in one of them
              is silent: the counter simply keeps its built-in figure and
              nothing reports a problem. Suggesting them is what makes the
              feature discoverable. A datalist rather than a select because
              ledger keys are still free-form; this offers without constraining.
            */}
            <datalist id="stat-key-suggestions">
              {HOME_METRIC_BASELINE.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {`Home page — ${metric.labelEn}`}
                </option>
              ))}
            </datalist>
            <p className="mt-1 text-2xs text-muted-foreground">
              Lowercase letters, digits and underscores. Reusing a key overwrites
              that card rather than adding a second one. The suggested{" "}
              <code>home_*</code> keys are the home page&apos;s impact counters —
              they must match exactly, and they never appear on this page or
              /donate.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-value">
              Figure to display
            </label>
            <input
              id="stat-value"
              className={fieldClass}
              placeholder="180"
              value={form.metricValue}
              onChange={(e) => setForm({ ...form, metricValue: e.target.value })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-label">
              Label (English)
            </label>
            <input
              id="stat-label"
              className={fieldClass}
              placeholder="Animals fed last month"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-label-ms">
              Label (Bahasa Malaysia, optional)
            </label>
            <input
              id="stat-label-ms"
              className={fieldClass}
              placeholder="Haiwan diberi makan bulan lalu"
              value={form.labelMs}
              onChange={(e) => setForm({ ...form, labelMs: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-period">
              Period (English)
            </label>
            <input
              id="stat-period"
              className={fieldClass}
              placeholder="August 2026"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-period-ms">
              Period (Bahasa Malaysia, optional)
            </label>
            <input
              id="stat-period-ms"
              className={fieldClass}
              placeholder="Ogos 2026"
              value={form.periodMs}
              onChange={(e) => setForm({ ...form, periodMs: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="stat-order">
              Display order
            </label>
            <input
              id="stat-order"
              type="number"
              min={0}
              className={fieldClass}
              value={form.displayOrder}
              onChange={(e) =>
                setForm({ ...form, displayOrder: Number(e.target.value) })
              }
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          Show on the public transparency page
        </label>

        <Button type="submit" disabled={busy} className="gap-2">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {editingKey ? "Save counter" : "Publish counter"}
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(snapshot?.impactStats ?? []).map((stat) => (
          <div
            key={stat.key}
            className="space-y-3 rounded-2xl border border-border bg-background p-4"
          >
            <div>
              <p className="font-heading text-3xl font-extrabold text-primary-ink">
                {stat.metricValue}
              </p>
              <p className="text-sm font-bold text-foreground">{stat.label}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {stat.period}
              </p>
              {!stat.isPublished && (
                <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                  Hidden
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="gap-1"
                onClick={() => startEdit(stat)}
              >
                <Pencil className="size-3" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="gap-1 text-destructive"
                disabled={busy}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(`Delete the "${stat.label}" counter?`)
                  ) {
                    return;
                  }
                  void run(
                    () => deleteImpactStatAction(stat.key),
                    "Impact counter deleted."
                  );
                }}
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
            </div>
          </div>
        ))}
        {(snapshot?.impactStats.length ?? 0) === 0 && (
          <p className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            No impact counters published yet.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ReportsTab({
  snapshot,
  busy,
  run,
}: {
  snapshot: TransparencySnapshot | null;
  busy: boolean;
  run: Runner;
}) {
  const [form, setForm] = useState(makeEmptyReport);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setUploadError(json.error ?? "Upload failed");
        return;
      }
      setForm((f) => ({ ...f, fileUrl: json.url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () =>
        createFinancialReportAction({
          year: Number(form.year),
          month: form.month === "" ? null : Number(form.month),
          title: form.title,
          fileUrl: form.fileUrl,
          summary: form.summary || null,
          publishedAt: new Date(form.publishedAt).toISOString(),
          isPublished: form.isPublished,
        }),
      "Report published to the transparency page."
    );
    if (ok) setForm(makeEmptyReport());
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <h2 className="font-heading text-base font-bold text-foreground">
          Publish a financial statement
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="rpt-year">
              Financial year
            </label>
            <input
              id="rpt-year"
              type="number"
              min={2000}
              max={2100}
              className={fieldClass}
              value={form.year}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="rpt-month">
              Period
            </label>
            <select
              id="rpt-month"
              className={fieldClass}
              value={form.month}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
            >
              <option value="">Annual report</option>
              {MONTH_OPTIONS.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="rpt-title">
              Document title
            </label>
            <input
              id="rpt-title"
              className={fieldClass}
              placeholder="Annual Audited Financial Statements 2026"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="rpt-url">
              PDF link or path
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="rpt-url"
                className={fieldClass}
                placeholder="/reports/hfs-audited-financials-2026.pdf"
                value={form.fileUrl}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                required
              />
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Upload PDF
              </Button>
            </div>
            {uploadError && (
              <p className="mt-1 text-xs font-semibold text-destructive">{uploadError}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="rpt-summary">
              Summary (optional)
            </label>
            <textarea
              id="rpt-summary"
              rows={3}
              className={fieldClass}
              placeholder="Full audited statement filed with the Registrar of Societies and tabled at the AGM."
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="rpt-published">
              Publication date
            </label>
            <input
              id="rpt-published"
              type="date"
              className={fieldClass}
              value={form.publishedAt}
              onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          Show on the public transparency page
        </label>

        <Button type="submit" disabled={busy} className="gap-2">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Publish report
        </Button>
      </form>

      <div className="divide-y divide-border rounded-2xl border border-border">
        {(snapshot?.reports ?? []).map((report: FinancialReportRecord) => (
          <div
            key={report.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {report.title}
                {!report.isPublished && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                    Hidden
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatReportPeriod(report.year, report.month)} · {report.fileUrl}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0 gap-1 text-destructive"
              disabled={busy}
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm(`Remove "${report.title}" from the public page?`)
                ) {
                  return;
                }
                void run(
                  () => deleteFinancialReportAction(report.id),
                  "Report removed from the transparency page."
                );
              }}
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
          </div>
        ))}
        {(snapshot?.reports.length ?? 0) === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No financial reports published yet.
          </p>
        )}
      </div>
    </div>
  );
}
