"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
 * Placement for the hero cut-outs: three sizes ringing the centred copy, the larger animals
 * lower and nearer the reader.
 *
 * Coordinates are inline styles, not `lg:left-[2%]` classes. Tailwind scanned that class
 * string and emitted every other utility in it — size, rotate, absolute, block — but not the
 * arbitrary-percentage insets, so all eight elements landed on the same auto position and
 * stacked. Inline styles do not depend on the scanner. They are unconditional, which is
 * harmless: below `lg` these elements are `hidden` and statically positioned, so left/top
 * apply to nothing.
 *
 * These files live in `public/cutouts/` and are caught by the `*.png` rule in `.gitignore`,
 * so they are present locally and absent from a fresh clone. Replace them with real Hope for
 * Strays cut-outs, and commit those, before this ships.
 */
const CUTOUTS = [
  { src: "/cutouts/cat-png-17.png", box: "lg:size-52 lg:-rotate-6", pos: { left: "2%", top: "12%" } },
  { src: "/cutouts/dog-png-2.png", box: "lg:size-60 lg:rotate-3", pos: { left: "12%", bottom: "8%" } },
  { src: "/cutouts/cat-png-9.png", box: "lg:size-36 lg:rotate-6", pos: { left: "24%", top: "4%" } },
  { src: "/cutouts/dog-png-14.png", box: "lg:size-40 lg:rotate-2", pos: { left: "1%", top: "48%" } },
  { src: "/cutouts/dog-png-30.png", box: "lg:size-56 lg:rotate-6", pos: { right: "2%", top: "10%" } },
  { src: "/cutouts/cat-png-20.png", box: "lg:size-60 lg:-rotate-3", pos: { right: "12%", bottom: "8%" } },
  { src: "/cutouts/dog-png-18.png", box: "lg:size-36 lg:-rotate-6", pos: { right: "24%", top: "4%" } },
  { src: "/cutouts/cat-png-28.png", box: "lg:size-40 lg:-rotate-2", pos: { right: "1%", top: "48%" } },
];

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
    <>
      <section className="relative flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden bg-work-ground">
        {/* Transparent-background cut-outs, not framed photographs: a frame reads as a picture
            of an animal, the cut-out reads as the animal. No border or radius for the same
            reason. Eight at three sizes so the ring has depth rather than a flat border,
            object-contain so silhouettes are never cropped, and a drop shadow that follows the
            alpha edge instead of a rectangle. */}
        {CUTOUTS.map((cutout) => (
          <div
            key={cutout.src}
            style={cutout.pos}
            className={`pointer-events-none hidden lg:absolute lg:block ${cutout.box}`}
          >
            <Image src={cutout.src} alt="" width={320} height={320} className="size-full object-contain drop-shadow-xl" />
          </div>
        ))}

        <div className="relative w-full px-6 py-12 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-2xl space-y-6 text-center">
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

            {/* Below lg the scatter is meaningless — absolute placement at 375px is a stack with
                extra steps — so the same cut-outs become an honest row. */}
            <div className="grid grid-cols-4 gap-3 pt-8 lg:hidden">
              {CUTOUTS.slice(0, 4).map((cutout) => (
                <Image key={cutout.src} src={cutout.src} alt="" width={160} height={160} className="aspect-square w-full object-contain" />
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Impact Showcase Strip (FE-02). Staff edit these figures at /admin/transparency, so
          they sit in a band of their own beneath the hero rather than inside the cut-out ring,
          where the composition has no room for a five-card row. */}
      <div className="bg-work-ground px-6 pb-16 sm:px-8 sm:pb-20 lg:px-12">
        <div className="max-w-7xl mx-auto">
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
    </>
  );
}
