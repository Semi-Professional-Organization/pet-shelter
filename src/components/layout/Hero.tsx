"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  ArrowRight,
  HeartHandshake,
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
 * "Adopted into Homes" in `danger` red, so every figure takes `text-primary`.
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
      className="border border-border bg-work-panel p-4 rounded-2xl space-y-1.5 shadow-xs"
    >
      <div className="flex items-center justify-between">
        <span
          className="font-heading text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-primary"
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
        <Icon className="size-4 text-muted-foreground opacity-60" />
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
    <section className="flex min-h-[calc(100dvh-4rem)] items-center bg-work-ground">
      <div className="w-full px-6 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 max-w-7xl mx-auto">
          
          {/* Left Text Content */}
          <div className="space-y-6 lg:col-span-7">

            <div className="space-y-2">
              <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.15]">
                {t("hero.tnrmHeadline")}
              </h1>
            </div>

            <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              {isMs
                ? <>
                    <span className="font-bold">Hope for Strays</span> ialah organisasi kebajikan haiwan komuniti yang memberi tumpuan kepada keseimbangan hidup bersama manusia dan haiwan. Kami menjalankan TNRM, pendidikan komuniti, dan pemulihan klinikal demi menstabilkan populasi jalanan dan menambah kesedaran awam.
                  </>
                : <>
                    <span className="font-bold">Hope for Strays</span> is a community-led animal welfare organisation focused on peaceful coexistence between people and animals. We work through TNRM, public education, and clinical rehabilitation to stabilize stray populations and build lasting community understanding.
                  </>}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
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

              <Link
                href="/donate"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "gap-2 px-5 text-sm font-bold tracking-wide rounded-xl",
                })}
              >
                <HeartHandshake className="size-4 text-care-accent" />
                {isMs ? "Sumbang & Taja" : "Donate & Sponsor"}
              </Link>

              <Link
                href="/get-involved"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "gap-2 px-5 text-sm font-bold tracking-wide rounded-xl",
                })}
              >
                <Users2 className="size-4 text-primary" />
                {isMs ? "Jadi Sukarelawan" : "Get Involved"}
              </Link>
            </div>

            {/* Sanctuary Hours & Address Banner */}
            {/* <div className="border-t border-border pt-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-bold text-foreground">{isMs ? "Waktu Santuari PJ:" : "Sanctuary Visiting Hours:"} </span>
                {isMs ? "Selasa – Ahad, 10:00 PG – 5:00 PTG. Walk-in dialu-alukan." : "Tuesday through Sunday, 10:00 AM – 5:00 PM. Walk-ins welcome."}
              </div>
              <div className="font-bold text-foreground">
                Petaling Jaya & UM Campus, Selangor
              </div>
            </div> */}
          </div>

          {/* Right Image */}
          <div className="lg:col-span-5">
            <div className="relative aspect-4/3 w-full overflow-hidden border border-border bg-muted shadow-md rounded-3xl">
              <Image
                src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1000&q=80"
                alt={t("hero.imageAlt")}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw"
              />
            </div>
          </div>
        </div>

        {/* Impact Showcase Strip (FE-02) */}
        <div className="max-w-7xl mx-auto mt-20 sm:mt-24">
          <div className="mb-4">
            <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
              {isMs ? "Kerja yang sedang berjalan" : "Work already underway"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {impactStats.map((stat) => (
              <ImpactStatCard key={stat.key} metric={stat} isMs={isMs} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
