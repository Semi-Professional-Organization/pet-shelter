"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Heart,
  Check,
  Lock,
  Stethoscope,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { TierBadge } from "./TierBadge";
import { WallOptInToggle } from "./WallOptInToggle";
import { SponsorLogoutButton } from "./SponsorLogoutButton";
import { tierLabel } from "@/lib/domain/supporterTier";
import { formatMYR, senFromInteger } from "@/lib/domain/money";
import { SponsorDashboardDTO, SponsoredRescueDTO } from "@/types/supporter";

/**
 * Semantic tones, not raw palette classes.
 *
 * The generated utilities already resolve to `var(--tone-*)` per theme, so pairing them
 * with a `dark:` variant is both unnecessary and the drift the token layer exists to
 * remove. See the tokens block at the top of `globals.css`.
 */
const STATUS_STYLES: Record<string, string> = {
  Available: "bg-success-surface text-success-text",
  Pending: "bg-warning-surface text-warning-text",
  Adopted: "bg-info-surface text-info-text",
};

function formatDate(iso: string, isMs: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(isMs ? "ms-MY" : "en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RescueCard({ rescue }: { rescue: SponsoredRescueDTO }) {
  const { isMs } = useLanguage();

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        <Image
          src={rescue.image}
          alt={`${rescue.name}, ${rescue.breed}`}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide ${
            STATUS_STYLES[rescue.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {rescue.status}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-heading text-lg font-bold text-foreground">{rescue.name}</h3>
          <p className="text-xs text-muted-foreground">{rescue.breed}</p>
        </div>

        <p className="inline-flex items-center gap-1.5 rounded-lg bg-primary/8 px-2.5 py-1.5 text-xs font-semibold text-primary-ink">
          <Stethoscope className="size-3.5" aria-hidden />
          {isMs ? rescue.rehabStageMs : rescue.rehabStage}
        </p>

        {rescue.medicalBadges.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {rescue.medicalBadges.map((badge) => (
              <li
                key={badge}
                className="rounded-md border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
              >
                {badge}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="mt-auto space-y-1 border-t border-border pt-3 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              {isMs ? "Sumbangan anda" : "Your contribution"}
            </dt>
            <dd className="font-bold tabular-nums text-foreground">
              {formatMYR(senFromInteger(rescue.totalContributedSen), { withSymbol: true })}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{isMs ? "Terkini" : "Most recent"}</dt>
            <dd className="tabular-nums text-foreground">
              {formatDate(rescue.lastContributionAt, isMs)}
            </dd>
          </div>
        </dl>

        <Link
          href={`/pets/${rescue.petId}`}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          {isMs ? "Lihat profil" : "View profile"}
        </Link>
      </div>
    </article>
  );
}

export function SponsorDashboardView({
  dashboard,
}: {
  dashboard: SponsorDashboardDTO;
}) {
  const { isMs } = useLanguage();

  const billingLabels: Record<SponsorDashboardDTO["billingFrequency"], [string, string]> = {
    monthly: ["Monthly recurring", "Bulanan berulang"],
    one_time: ["One-time pledges", "Sumbangan sekali"],
    mixed: ["Monthly recurring + one-time", "Bulanan berulang + sekali"],
    none: ["No pledges recorded", "Tiada sumbangan direkodkan"],
  };

  const progressPercent = dashboard.amountToNextTierSen === null
    ? 100
    : Math.min(
        100,
        Math.round(
          (dashboard.recognisedSen /
            (dashboard.recognisedSen + dashboard.amountToNextTierSen)) *
            100
        )
      );

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-2xs font-bold uppercase tracking-widest text-primary-ink">
            {isMs ? "Portal penaja" : "Sponsor portal"}
          </p>
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            {isMs ? `Selamat kembali, ${dashboard.name}` : `Welcome back, ${dashboard.name}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMs ? "Penaja sejak " : "Sponsor since "}
            {formatDate(dashboard.memberSince, isMs)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TierBadge tier={dashboard.tier} />
          <SponsorLogoutButton />
        </div>
      </header>

      {/* My Sponsorship Tier */}
      <section aria-labelledby="tier-heading" className="space-y-5">
        <h2 id="tier-heading" className="font-heading text-2xl font-bold text-foreground">
          {isMs ? "Taraf penajaan saya" : "My sponsorship tier"}
        </h2>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isMs ? "Taraf semasa" : "Current standing"}
              </span>
              <TierBadge tier={dashboard.tier} showIcon={false} />
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {isMs ? "Kekerapan bil" : "Billing frequency"}
                </dt>
                <dd className="text-right font-semibold text-foreground">
                  {billingLabels[dashboard.billingFrequency][isMs ? 1 : 0]}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="size-3.5" aria-hidden />
                  {isMs ? "Diiktiraf (12 bulan)" : "Recognised (12 months)"}
                </dt>
                <dd className="text-right font-bold tabular-nums text-foreground">
                  {formatMYR(senFromInteger(dashboard.recognisedSen), { withSymbol: true })}
                </dd>
              </div>
            </dl>

            {dashboard.nextTier && dashboard.amountToNextTierSen !== null ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {isMs
                    ? `${formatMYR(senFromInteger(dashboard.amountToNextTierSen), { withSymbol: true })} lagi untuk mencapai ${tierLabel(dashboard.nextTier, true)}.`
                    : `${formatMYR(senFromInteger(dashboard.amountToNextTierSen), { withSymbol: true })} more to reach ${tierLabel(dashboard.nextTier, false)}.`}
                </p>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={
                    isMs
                      ? `Kemajuan ke taraf ${tierLabel(dashboard.nextTier, true)}`
                      : `Progress to ${tierLabel(dashboard.nextTier, false)} standing`
                  }
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="border-t border-border pt-4 text-xs font-semibold text-primary-ink">
                {isMs
                  ? "Anda berada di taraf tertinggi. Terima kasih."
                  : "You are at the highest standing. Thank you."}
              </p>
            )}
          </div>

          {/* Perks checklist */}
          <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {isMs ? "Senarai semak keistimewaan" : "Active perks checklist"}
            </h3>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {dashboard.perks.map((perk) => (
                <li
                  key={perk.id}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                    perk.unlocked
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {perk.unlocked ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                  ) : (
                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <span className="leading-snug">{isMs ? perk.labelMs : perk.label}</span>
                  <span className="sr-only">
                    {perk.unlocked
                      ? isMs ? "Dibuka" : "Unlocked"
                      : isMs ? "Berkunci" : "Locked"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <WallOptInToggle initialValue={dashboard.displayOnWall} />
      </section>

      {/* My Rescues */}
      <section aria-labelledby="rescues-heading" className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            id="rescues-heading"
            className="font-heading text-2xl font-bold text-foreground"
          >
            {isMs ? "Rescue saya" : "My rescues"}
          </h2>
          <span className="text-sm text-muted-foreground">
            {dashboard.rescues.length}{" "}
            {isMs
              ? "haiwan ditaja"
              : `sponsored animal${dashboard.rescues.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {dashboard.rescues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Heart className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              {isMs
                ? "Anda belum menaja haiwan tertentu. Pilih seekor rescue untuk mula mengikuti pemulihannya."
                : "You are not sponsoring a specific animal yet. Dedicate a pledge to a rescue to start following their recovery."}
            </p>
            <Link
              href="/pets"
              className={buttonVariants({ size: "sm", className: "mt-4" })}
            >
              {isMs ? "Layari rescue" : "Browse rescues"}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.rescues.map((rescue) => (
              <RescueCard key={rescue.petId} rescue={rescue} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
