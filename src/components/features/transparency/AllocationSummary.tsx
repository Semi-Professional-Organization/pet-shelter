"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  AllocationSlice,
  ImpactStatRecord,
  TransparencySource,
  formatMYR,
} from "@/lib/domain/transparency";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { categoryVar } from "./palette";

/**
 * Compact allocation + impact summary for pages other than /transparency.
 *
 * This exists so the donate page stops carrying its own hand-written split. It
 * previously hard-coded 45/30/20/5 while the ledger said something else — on a
 * page about financial honesty, two different answers is the actual bug.
 *
 * Presentational by design: the figures arrive as props from a Server
 * Component. An earlier version fetched them itself on mount, which cost the
 * donate page its server-rendered content, its first paint and its
 * crawlability for no benefit.
 */
export function AllocationSummary({
  allocation,
  impactStats,
  totalSen,
  source,
}: {
  allocation: AllocationSlice[];
  impactStats: ImpactStatRecord[];
  totalSen: number;
  /** Provenance, so this surface can state it too rather than only /transparency. */
  source: TransparencySource;
}) {
  const { isMs } = useLanguage();

  if (allocation.length === 0) {
    // "Nothing published yet" and "we could not read the ledger" are different
    // statements, and only one of them is true at a time. Saying the first when
    // the second happened is a false claim about the shelter's spending.
    const unavailable = source === "unavailable";

    return (
      <div className="rounded-3xl border border-border bg-work-panel p-6 text-center shadow-xs sm:p-7">
        <p className="text-sm text-muted-foreground">
          {unavailable
            ? isMs
              ? "Pecahan perbelanjaan tidak dapat dimuatkan buat masa ini. Sila cuba sebentar lagi."
              : "The expense breakdown could not be loaded right now. Please check back shortly."
            : isMs
              ? "Pecahan perbelanjaan akan dipaparkan sebaik sahaja lejar dikemas kini."
              : "The expense breakdown will appear here once the ledger is updated."}
        </p>
        <Link
          href="/transparency"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary-ink hover:underline"
        >
          {isMs ? "Lihat halaman ketelusan" : "Open the transparency page"}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-8`}>

      {/* Provenance travels with the figures. Without this the donate page would
          present the development sample split under "computed live from our
          verified expense ledger" while /transparency showed a warning. */}
      {source === "sample" && (
        <p
          role="status"
          className="rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5 text-center text-xs font-semibold text-warning-text"
        >
          {isMs
            ? "Data contoh pembangunan — angka ini bukan rekod perbelanjaan sebenar."
            : "Development sample data — these figures are not real spending records."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {allocation.map((slice) => (
          <div
            key={slice.key}
            className="flex flex-col justify-between gap-6 rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7"
          >
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-heading text-3xl font-bold tracking-tight tabular-nums text-foreground">
                  {slice.percent}%
                </span>
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ backgroundColor: categoryVar(slice.key) }}
                />
              </div>
              <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
                {isMs ? slice.meta.labelMs : slice.meta.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {isMs ? slice.meta.blurbMs : slice.meta.blurb}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold tabular-nums text-muted-foreground">
                {formatMYR(slice.totalSen)}
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-full"
                  style={{
                    width: `${slice.percent}%`,
                    backgroundColor: categoryVar(slice.key),
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {impactStats.length > 0 && (
        <dl className="grid grid-cols-1 gap-6 rounded-3xl border border-border bg-muted/30 p-6 sm:grid-cols-3 sm:p-7">
          {impactStats.slice(0, 3).map((stat) => (
            <div key={stat.key} className="flex flex-col-reverse justify-end gap-1">
              <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isMs && stat.labelMs ? stat.labelMs : stat.label}
              </dt>
              <dd className="m-0 font-heading text-3xl font-bold text-primary-ink sm:text-4xl">
                {stat.metricValue}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-xs text-muted-foreground">
          {isMs
            ? `Dikira daripada ${formatMYR(totalSen)} perbelanjaan yang disahkan.`
            : `Computed from ${formatMYR(totalSen)} of verified expenses.`}
        </p>
        <Link
          href="/transparency"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-ink hover:underline"
        >
          {isMs
            ? "Lihat setiap resit dan laporan teraudit"
            : "See every receipt and audited report"}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
