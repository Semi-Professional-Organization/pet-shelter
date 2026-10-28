"use client";

import Link from "next/link";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { SupporterTier } from "@/types/supporter";
import { tierLabel } from "@/lib/domain/supporterTier";

interface UpgradeNudgeProps {
  requiredTier: SupporterTier;
  currentTier: SupporterTier | null;
  petName?: string;
  perkDescription?: string;
  perkDescriptionMs?: string;
  /** Rendered under the headline, e.g. "3 video updates are waiting." */
  lockedCount?: number;
}

/**
 * The locked state of a tier gate.
 *
 * Carries no privileged data by construction — only the standing required, the standing
 * held, and a count — so it is safe to render for signed-out visitors.
 */
export function UpgradeNudge({
  requiredTier,
  currentTier,
  petName,
  perkDescription,
  perkDescriptionMs,
  lockedCount,
}: UpgradeNudgeProps) {
  const { isMs } = useLanguage();

  const required = tierLabel(requiredTier, isMs);
  const perk = isMs
    ? perkDescriptionMs || perkDescription || "kandungan eksklusif"
    : perkDescription || "exclusive content";

  const headline = petName
    ? isMs
      ? `Naik taraf ke ${required} untuk membuka ${perk} ${petName}.`
      : `Upgrade to ${required} to unlock ${petName}'s ${perk}.`
    : isMs
      ? `Naik taraf ke ${required} untuk membuka ${perk}.`
      : `Upgrade to ${required} to unlock ${perk}.`;

  const standing = currentTier
    ? isMs
      ? `Taraf semasa anda: ${tierLabel(currentTier, true)}.`
      : `Your current standing: ${tierLabel(currentTier, false)}.`
    : isMs
      ? "Anda belum mempunyai taraf penaja aktif."
      : "You do not hold an active sponsor standing yet.";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-linear-to-br from-primary/5 via-card to-card p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
          <Lock className="size-5" aria-hidden />
        </div>

        <div className="flex-1 space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-primary-ink">
            <Sparkles className="size-3" aria-hidden />
            {isMs ? `Keistimewaan ${required}` : `${required} privilege`}
          </p>

          <h3 className="font-heading text-lg font-bold leading-snug text-foreground">
            {headline}
          </h3>

          <p className="text-sm text-muted-foreground">
            {standing}
            {typeof lockedCount === "number" && lockedCount > 0 ? (
              <>
                {" "}
                {isMs
                  ? `${lockedCount} kemas kini sedang menunggu.`
                  : `${lockedCount} update${lockedCount === 1 ? "" : "s"} waiting for you.`}
              </>
            ) : null}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {/* To the rescues, where a sponsorship starts. A standing is derived from pet
                sponsorships alone (`getSponsorContext`), so this used to send a sponsor to
                the general-gift form, which can never raise one. */}
            <Link
              href="/pets"
              className={buttonVariants({ size: "sm", className: "gap-2" })}
            >
              {isMs ? `Naik taraf ke ${required}` : `Become a ${required} sponsor`}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/sponsor/dashboard"
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              {isMs ? "Portal penaja" : "Sponsor portal"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
