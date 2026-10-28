"use client";

import React from "react";
import { ImpactStatRecord } from "@/lib/domain/transparency";
import { useLanguage } from "@/components/providers/LanguageProvider";

/**
 * Headline impact counters. These are stat tiles, not a chart: a handful of
 * unrelated headline numbers ("180", "42", "100%") share no scale, so plotting
 * them together would invent a comparison that does not exist.
 *
 * Each tile is a `<dt>` term followed by its `<dd>` description, in that order —
 * assistive technology pairs them by document order, so putting the value first
 * in the markup would announce the number before anything says what it counts.
 * `flex-col-reverse` puts the figure on top visually without disturbing that.
 */
export function ImpactStatHighlights({ stats }: { stats: ImpactStatRecord[] }) {
  const { isMs } = useLanguage();

  if (stats.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {isMs
            ? "Statistik impak akan diterbitkan sebaik sahaja angka bulan ini disahkan."
            : "Impact statistics will appear here once this month's figures are verified."}
        </p>
      </div>
    );
  }

  return (
    <dl
      className={`grid grid-cols-1 gap-5 ${
        stats.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
      }`}
    >
      {stats.map((stat) => (
        <div
          key={stat.key}
          className="flex flex-col-reverse justify-end rounded-2xl border border-border bg-background p-6 shadow-xs"
        >
          <dt className="mt-3 space-y-1.5">
            <span className="block font-heading text-sm font-bold leading-snug text-foreground">
              {isMs && stat.labelMs ? stat.labelMs : stat.label}
            </span>
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isMs && stat.periodMs ? stat.periodMs : stat.period}
            </span>
          </dt>
          <dd className="m-0 font-heading text-4xl font-extrabold tracking-tight text-primary-ink sm:text-5xl">
            {stat.metricValue}
          </dd>
        </div>
      ))}
    </dl>
  );
}
