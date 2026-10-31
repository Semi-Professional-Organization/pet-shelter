"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Info,
  Heart,
  Dog,
  Baby,
  Sofa,
  Volleyball,
  Zap,
  Fence,
  Ban,
  Cat,
  PawPrint,
  Users,
  Armchair,
  User,
  Building2,
  Hourglass,
  Feather,
  BatteryLow,
  HandHeart,
  Stethoscope,
  HeartHandshake,
  ShieldCheck,
  VolumeX,
  Sprout,
  type LucideIcon,
} from "lucide-react";
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
import { ICON_BY_TRAINING } from "@/components/icons/pet-icons";
import { trainingKindFor } from "@/lib/domain/petTraining";
import { PetStatusIcon } from "./PetStatusIcon";

interface PetCardProps {
  pet: Pet;
  onSelectPet: (pet: Pet) => void;
  onAdoptPet?: (pet: Pet) => void;
  onSponsorPet?: (pet: Pet) => void;
}

const FALLBACK_PET_IMAGE = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80";

/**
 * Icons for the characteristic tags staff use today, matched case-insensitively. Tags are free
 * text (`tags: z.array(z.string())`), so any tag not listed here keeps its text chip.
 * ceiling: a hand-kept list; a new tag gets an icon only when someone adds it here.
 * Training tags are not listed: they go through `trainingKindFor` and `ICON_BY_TRAINING`, so a
 * card shows the same icon, for the same spellings, as the Training row in the views it opens.
 */
const TAG_ICONS: Record<string, LucideIcon> = {
  "good with dogs": Dog,
  "good with cats": Cat,
  "good with kids": Baby,
  "indoor only": Sofa,
  "quiet indoors": Armchair,
  playful: Volleyball,
  "high energy": Zap,
  "low energy": BatteryLow,
  "needs fenced compound": Fence,
  "no cats": Ban,
  kitten: PawPrint,
  puppy: PawPrint,
  senior: Hourglass,
  social: Users,
  independent: User,
  quiet: VolumeX,
  gentle: Feather,
  "apartment friendly": Building2,
  "in foster care": HandHeart,
  "needs socialising": Sprout,
  "under veterinary care": Stethoscope,
  "sponsor needed": HeartHandshake,
  "tnrm intake": ShieldCheck,
};

/**
 * One icon tag, with its name in a label centred above the icon while the pointer is on it.
 *
 * The label is portalled to `body` at fixed coordinates, so the card's `overflow-hidden` cannot
 * clip it at either edge. WCAG 1.4.13 asks hover content to be hoverable, dismissible and
 * persistent: leaving the icon closes it only after a short grace, which the label's own hover
 * cancels, so the pointer can cross onto it; Escape closes it; nothing else does. It is
 * `aria-hidden` because the `sr-only` name already gives screen readers the tag. Touch screens
 * (`pointer-coarse`) show the name inline instead and never open it.
 */
function TagIcon({ tag, Icon }: { tag: string; Icon: LucideIcon }) {
  const ref = useRef<HTMLLIElement>(null);
  const closing = useRef<number | undefined>(undefined);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const open = () => {
    window.clearTimeout(closing.current);
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left + r.width / 2, y: r.top });
  };
  const close = () => {
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setAt(null), 150);
  };

  useEffect(() => {
    if (!at) return;
    const dismiss = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    const hide = () => setAt(null);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", hide);
    };
  }, [at]);
  useEffect(() => () => window.clearTimeout(closing.current), []);

  return (
    <li
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={close}
      className="flex items-center gap-1.5 rounded-md bg-primary-panel p-1.5 text-primary-ink pointer-coarse:px-2.5"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only pointer-coarse:not-sr-only pointer-coarse:text-xs pointer-coarse:font-semibold">
        {tag}
      </span>
      {at &&
        createPortal(
          <span
            aria-hidden="true"
            onMouseEnter={open}
            onMouseLeave={close}
            style={{ left: at.x, top: at.y }}
            className="fixed z-50 -translate-x-1/2 -translate-y-full pb-1.5"
          >
            <span className="block whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-semibold text-background shadow-brand-sm">
              {tag}
            </span>
          </span>,
          document.body
        )}
    </li>
  );
}

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
    <Card className="group flex h-full flex-col justify-between gap-0 py-0 ring-0 overflow-hidden bg-work-panel transition-colors duration-200 hover:bg-accent-subtle-strong">
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

          <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4">
            {pet.description}
          </p>

          {/* A known tag is its icon, named on hover by a label centred above it; touch
              screens have no hover, so there the name shows beside the icon. Screen readers always get
              the name. See `TagIcon` for the hover label. */}
          <ul className="flex flex-wrap items-center gap-1.5 pt-1">
            {pet.tags.map((tag, idx) => {
              const training = trainingKindFor(tag);
              // Object.hasOwn: a tag such as "constructor" would otherwise find Object.prototype's.
              const key = tag.trim().toLowerCase();
              const Icon = training
                ? ICON_BY_TRAINING[training]
                : Object.hasOwn(TAG_ICONS, key)
                  ? TAG_ICONS[key]
                  : undefined;
              if (!Icon) {
                return (
                  <li
                    key={idx}
                    className="bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground border border-border rounded-md"
                  >
                    {tag}
                  </li>
                );
              }
              // A training tag is named as the Training row names it, in the current language.
              const label = training ? t(`petDetail.${training}`) : tag;
              return <TagIcon key={idx} tag={label} Icon={Icon} />;
            })}
          </ul>
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
