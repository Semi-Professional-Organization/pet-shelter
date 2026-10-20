"use client";

import { useState } from "react";
import Image from "next/image";
import { Info, Heart } from "lucide-react";
import { Pet } from "@/types/pet";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  getPetStatusPresentation,
  getPlacementOptions,
  getRehabStageLabel,
  getRehabProgressPercent,
} from "@/lib/presentation/petStatusPresentation";
import { genderLabelArgs } from "@/lib/presentation/petLabels";
import { PetStatusIcon } from "./PetStatusIcon";

interface PetCardProps {
  pet: Pet;
  onSelectPet: (pet: Pet) => void;
  onAdoptPet?: (pet: Pet) => void;
  onSponsorPet?: (pet: Pet) => void;
}

const FALLBACK_PET_IMAGE = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80";

export function PetCard({ pet, onSelectPet, onAdoptPet, onSponsorPet }: PetCardProps) {
  const { t, isMs } = useLanguage();
  const [imgSrc, setImgSrc] = useState(pet.image || FALLBACK_PET_IMAGE);
  const status = getPetStatusPresentation(pet.status);
  const placement = getPlacementOptions(pet);
  const isAvailable = status.isAdoptable;
  // An animal who has gone home is not a support target: neither adoption nor sponsorship
  // applies. The card used to render a disabled button reading "Adopted" here — the dead
  // button the comment below says this footer was shaped to avoid.
  const isAlumni = status.track === "alumni";
  const rehabStage = status.isInRehabilitation ? getRehabStageLabel(pet, isMs) : undefined;
  const rehabProgress = status.isInRehabilitation ? getRehabProgressPercent(pet) : undefined;

  return (
    <Card className="group flex h-full flex-col justify-between gap-0 py-0 ring-0 overflow-hidden border border-border bg-work-panel shadow-xs transition-colors duration-200 hover:border-primary/40 rounded-3xl">
      <div>
        {/* Pet Image Container */}
        <div className="relative aspect-4/3 w-full overflow-hidden bg-work-ground">
          <Image
            src={imgSrc}
            alt={`${pet.name}, ${pet.breed}`}
            fill
            onError={() => setImgSrc(FALLBACK_PET_IMAGE)}
            className="object-cover transition-transform duration-300 group-hover:scale-102"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          
          {/* Status Badge - WCAG AAA Compliant */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span
              className={`${status.badgeClass} gap-1.5 px-3 py-1 text-xs`}
            >
              <PetStatusIcon tone={status.tone} className="size-3.5" />
              {t(status.labelKey, status.labelFallback)}
            </span>
          </div>

          {/* Gender Pill */}
          <div className="absolute top-3 right-3 bg-black/85 px-3 py-1 text-xs font-semibold text-white rounded-full">
            {t(...genderLabelArgs(pet.gender))}
          </div>
        </div>

        {/* Pet Name & Breed */}
        <CardHeader className="p-6 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {pet.name}
            </h3>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">
              {pet.age}
            </span>
          </div>
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            {pet.breed}
          </p>
        </CardHeader>

        {/* Description & Characteristic Tags */}
        <CardContent className="px-6 pt-1 pb-4 space-y-3">
          {/* Rehabilitation stage & recovery progress — only meaningful while under care. */}
          {rehabStage && (
            <div className="border border-care-accent/30 bg-care-surface p-3 space-y-2 rounded-lg">
              <div className="flex items-start gap-1.5">
                <PetStatusIcon tone={status.tone} className="size-3.5 mt-0.5 shrink-0 text-care-text " />
                <div className="min-w-0">
                  <p className="text-3xs font-bold uppercase tracking-wider text-care-text ">
                    {t("common.rehabStage", "Rehabilitation Stage")}
                  </p>
                  <p className="text-xs font-semibold text-foreground leading-snug mt-0.5">
                    {rehabStage}
                  </p>
                </div>
              </div>

              {rehabProgress !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-3xs font-semibold text-muted-foreground">
                    <span>{t("common.rehabProgress", "Recovery Progress")}</span>
                    <span className="font-mono text-foreground">{rehabProgress}%</span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden bg-muted rounded-full"
                    role="progressbar"
                    aria-valuenow={rehabProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${pet.name} — ${t("common.rehabProgress", "Recovery Progress")}`}
                  >
                    <div
                      className="h-full bg-care-accent transition-all duration-300"
                      style={{ width: `${rehabProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2">
            {pet.description}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {pet.tags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground border border-border rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        </CardContent>
      </div>

      {/* Footer Actions */}
      <CardFooter className="px-6 pb-6 pt-4 [.border-t]:pt-4 border-t border-border/60 flex flex-col-reverse gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSelectPet(pet)}
          className="w-full text-xs font-semibold uppercase tracking-wider px-5 py-2.5 focus-visible:ring-2 cursor-pointer rounded-xl"
        >
          <Info className="size-3.5" />
          {t("common.details", "Details")}
        </Button>

        {/* Three cases, and they are not the same case:
            - In rehabilitation: cannot be adopted out directly, so sponsorship is a real action
              offered in place of an adopt button that would do nothing.
            - Alumni: no action exists at all — neither adoption nor sponsorship applies to an
              animal who has gone home — so there is no second button.
            - Pending: an application is already in review. The button stays, disabled, showing
              the status. That *is* a dead button, deliberately: it reports where the animal is
              in the queue, and removing it would make Pending indistinguishable from Available
              at a glance. Change it here if that call is ever revisited.
            - Needs socialising: offered for foster (getPlacementOptions). Interim, a WhatsApp
              message, because applications cannot record "foster" until the type field exists. */}
        {isAlumni ? null : status.isInRehabilitation ? (
          <Button
            size="sm"
            onClick={() => (onSponsorPet ? onSponsorPet(pet) : onSelectPet(pet))}
            className="w-full text-xs font-semibold uppercase tracking-wider px-5 py-2.5 focus-visible:ring-2 cursor-pointer rounded-xl"
          >
            {t("common.sponsorMe", "Sponsor Me")}
          </Button>
        ) : placement.foster ? (
          <a
            href={`${SHELTER_WHATSAPP_URL}?text=${encodeURIComponent(
              `Hi Hope for Strays, I would like to foster ${pet.name}.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "sm" }),
              "w-full text-xs font-semibold uppercase tracking-wider px-5 py-2.5 focus-visible:ring-2 cursor-pointer rounded-xl"
            )}
          >
            <Heart className="size-3.5" />
            {t("petDetail.applyToFoster", "Apply to Foster")}
          </a>
        ) : (
          <Button
            size="sm"
            disabled={!isAvailable}
            onClick={() => {
              if (onAdoptPet) {
                onAdoptPet(pet);
              } else {
                onSelectPet(pet);
              }
            }}
            className="w-full text-xs font-semibold uppercase tracking-wider px-5 py-2.5 focus-visible:ring-2 cursor-pointer rounded-xl"
          >
            <Heart className="size-3.5 fill-current" />
            {isAvailable ? t("common.apply", "Adopt") : t(status.labelKey, status.labelFallback)}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
