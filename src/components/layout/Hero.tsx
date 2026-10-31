"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Heart,
  ArrowRight,
  ShieldCheck,
  Award,
  Users2,
  Stethoscope,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useTypedTranslation } from "@/components/providers/LanguageProvider";
import {
  formatFigureFrame,
  HOME_METRIC_BASELINE,
  metricLabel,
  splitFigure,
  type HomeMetric,
  type HomeMetricIcon,
} from "@/lib/domain/metrics";

/**
 * Presentation for the five counters. Kept here rather than in the domain module
 * so `metrics.ts` stays React-free and testable in the node tier. There is no
 * per-counter tone: tones were picked by hue rather than meaning, which had
 * "Adopted into Homes" in `danger` red, so every figure takes `text-primary-ink`.
 */
const METRIC_PRESENTATION: Record<HomeMetricIcon, { icon: typeof ShieldCheck }> = {
  neutered: { icon: ShieldCheck },
  rehabilitated: { icon: Stethoscope },
  adopted: { icon: Heart },
  volunteers: { icon: Users2 },
  collaborations: { icon: Award },
};

const COUNT_UP_MS = 1100;

/**
 * Counts a figure up from zero, as progressive enhancement.
 *
 * Initial state is the *settled* figure, so the server-rendered HTML and the
 * pre-hydration paint both carry the real number — a reader with JS disabled,
 * or a crawler, sees "520+" rather than "0+". The climb only starts once the
 * effect runs, and `prefers-reduced-motion` skips it entirely.
 */
function useCountUp(value: string): string {
  // The frame is tagged with the figure it belongs to, so a climb left over
  // from a previous `value` is ignored rather than frozen on screen. Clearing
  // it in the effect body or its cleanup instead would be a cascading render,
  // which the React Compiler lint rejects — hence tagging over resetting.
  const [climb, setClimb] = useState<{ of: string; text: string } | null>(null);

  useEffect(() => {
    const parsed = splitFigure(value);
    if (!parsed || parsed.num === 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      if (progress >= 1) {
        setClimb(null);
        return;
      }
      const eased = 1 - Math.pow(1 - progress, 3);
      setClimb({
        of: value,
        text: formatFigureFrame(parsed, Math.round(parsed.num * eased)),
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return climb?.of === value ? climb.text : value;
}

/** One card, so the count-up hook has a component of its own to live in. */
function ImpactStatCard({ metric, isMs }: { metric: HomeMetric; isMs: boolean }) {
  const { icon: Icon } = METRIC_PRESENTATION[metric.icon];
  const display = useCountUp(metric.value);

  return (
    <div
      data-testid={`impact-stat-${metric.key}`}
      className="rounded-card bg-work-panel p-4 space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span
          className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-primary-ink"
        >
          {/*
            The climbing digits are decoration, so they are hidden and the
            settled figure is exposed as real text alongside them. An
            `aria-label` here would have been dropped on the floor: a bare
            `span` maps to role=generic, which prohibits naming, so the
            hidden-digits-plus-label version announced no number at all.
          */}
          <span aria-hidden="true">{display}</span>
          <span className="sr-only">{metric.value}</span>
        </span>
        <Icon className="size-4 text-primary-ink opacity-70" />
      </div>
      <p className="text-xs font-semibold text-foreground leading-tight">
        {metricLabel(metric, isMs)}
      </p>
    </div>
  );
}

export interface HeroProps {
  /**
   * Resolved by the server component from the `ImpactStat` table. Omitted — in
   * tests, or if the read fails — the curated FE-02 figures render instead, so
   * this section never shows an empty grid or a database-shaped zero.
   */
  metrics?: HomeMetric[];
}

export function Hero({ metrics }: HeroProps = {}) {
  const { isMs, t } = useTypedTranslation();

  const impactStats =
    metrics && metrics.length > 0 ? metrics : [...HOME_METRIC_BASELINE];

  return (
    <>
      {/* The first screen holds the hero and the impact strip together, so the figures are seen
          without scrolling. The ring of animal cut-outs is gone again, as in 3835a0c: its PNGs are
          kept out of git by `*.png`, so a deploy served them as 404s, and the shelter has no rights
          to them. Hero images return through an admin editor once the shelter has its own. */}
      <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-work-ground">
        <div className="relative flex flex-1 items-center">
          <div className="relative w-full px-6 py-12 sm:px-8 lg:px-12">
            <div className="relative z-10 mx-auto max-w-2xl space-y-6 text-center">
              <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.15]">
                {t("hero.tnrmHeadline")}
              </h1>

              <p className="mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
                {isMs
                  ? "Hope for Strays ialah organisasi kebajikan haiwan komuniti yang memberi tumpuan kepada keseimbangan hidup bersama manusia dan haiwan. Kami menjalankan TNRM, pendidikan komuniti, dan pemulihan klinikal."
                  : "Hope for Strays is a community-led animal welfare organisation focused on peaceful coexistence between people and animals. We work through TNRM, public education, and clinical rehabilitation."}
              </p>

              <div className="flex justify-center pt-1">
                <Link
                  href="/pets"
                  className={buttonVariants({
                    size: "lg",
                    className: "gap-2 px-6 text-sm font-bold tracking-wide rounded-xl shadow-xs focus-visible:ring-2",
                  })}
                >
                  <Heart className="size-4 fill-current" />
                  {isMs ? "Lihat Haiwan Reskue" : "Meet Our Animals"}
                  <ArrowRight className="size-4 ml-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Impact Showcase Strip (FE-02). Staff edit these figures at /admin/transparency. */}
        <div className="relative z-10 px-6 pb-10 sm:px-8 lg:px-12">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {impactStats.map((stat) => (
              <ImpactStatCard key={stat.key} metric={stat} isMs={isMs} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
