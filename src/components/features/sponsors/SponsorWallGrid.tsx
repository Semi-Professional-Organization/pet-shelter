"use client";

import { Award } from "lucide-react";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { tierLabel } from "@/lib/domain/supporterTier";
import { SupporterTier, SponsorWallEntryDTO } from "@/types/supporter";

/** The same standing tones as `TierBadge`, softened for a list surface. */
const TIER_ACCENTS: Record<SupporterTier, string> = {
  GOLD: "border-standing-gold-line/50 bg-standing-gold/60",
  SILVER: "border-standing-silver-line/50 bg-standing-silver/60",
  BRONZE: "border-standing-bronze-line/50 bg-standing-bronze/60",
};

function formatYear(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : String(date.getFullYear());
}

/**
 * One standing's section of the public wall.
 *
 * Receives only `SponsorWallEntryDTO` values, which carry a name, a tier and a join year
 * and nothing else — there is no amount or contact detail available to render by mistake.
 */
export function SponsorWallGrid({
  tier,
  entries,
}: {
  tier: SupporterTier;
  entries: SponsorWallEntryDTO[];
}) {
  const { isMs } = useLanguage();

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby={`wall-${tier}`} className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2
          id={`wall-${tier}`}
          className="inline-flex items-center gap-2 font-heading text-2xl font-bold text-foreground"
        >
          <Award className="size-5 text-primary-ink" aria-hidden />
          {isMs
            ? `Penaja ${tierLabel(tier, true)}`
            : `${tierLabel(tier, false)} sponsors`}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {entries.length}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <li
            key={`${entry.name}-${entry.memberSince}`}
            className={`rounded-xl border px-4 py-3 ${TIER_ACCENTS[tier]}`}
          >
            <p className="font-semibold leading-snug text-foreground">{entry.name}</p>
            <p className="text-xs text-muted-foreground">
              {isMs ? "Penaja sejak " : "Sponsor since "}
              {formatYear(entry.memberSince)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
