"use client";

import { useState } from "react";
import Image from "next/image";
import { 
  Heart, 
  Calendar, 
  Activity, 
  Baby, 
  Dog, 
  Cat 
} from "lucide-react";
import { Pet } from "@/types/pet";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { genderLabelArgs } from "@/lib/presentation/petLabels";
import { PetStatusIcon } from "./PetStatusIcon";
import { PetTraining } from "./PetTraining";
import { tagsWithoutTraining } from "@/lib/domain/petTraining";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MedicalTimeline } from "./MedicalTimeline";
import { useLanguage } from "@/components/providers/LanguageProvider";

interface PetDetailDialogProps {
  pet: Pet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartAdoption: (pet: Pet) => void;
}

const FALLBACK_PET_IMAGE = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80";

export function PetDetailDialog({
  pet,
  open,
  onOpenChange,
  onStartAdoption,
}: PetDetailDialogProps) {
  const { t, isMs } = useLanguage();
  const [imgSrc, setImgSrc] = useState(pet?.image || FALLBACK_PET_IMAGE);
  if (!pet) return null;
  const chipTags = tagsWithoutTraining(pet.tags);

  const status = getPetStatusPresentation(pet.status);
  const isAvailable = status.isAdoptable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 border border-border bg-card">
        {/* Accessible Dialog Header */}
        <DialogHeader className="sr-only">
          <DialogTitle>{pet.name} ({pet.breed})</DialogTitle>
          <DialogDescription>{pet.description}</DialogDescription>
        </DialogHeader>

        {/* Photo Banner */}
        <div className="relative aspect-16/9 w-full bg-muted">
          <Image
            src={imgSrc || pet.image}
            alt={`${pet.name} - ${pet.breed}`}
            fill
            onError={() => setImgSrc(FALLBACK_PET_IMAGE)}
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 700px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"></div>
          
          <div className="absolute bottom-5 left-6 right-6 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className={`${status.badgeClass} gap-1.5 px-3 py-1 text-xs`}
                >
                  <PetStatusIcon tone={status.tone} className="size-3.5" />
                  {t(status.labelKey, status.labelFallback)}
                </span>
                <span className="bg-black/85 px-3 py-1 text-xs font-semibold text-white">
                  {t(...genderLabelArgs(pet.gender))} • {pet.age}
                </span>
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {pet.name}
              </h2>
              <p className="text-sm sm:text-base font-medium text-white/90 mt-0.5">
                {pet.breed} • <span className="font-mono">{pet.weight}</span>
              </p>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/80 block">
                {t("petDetail.adoptionFee", "Adoption Fee")}
              </span>
              <p className="font-heading text-2xl font-bold text-white mt-0.5">
                {pet.adoptionFee.toLowerCase().includes("free") ? (isMs ? "Percuma (RM 0)" : "Free (RM 0)") : pet.adoptionFee}
              </p>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 sm:p-7 space-y-6">
          
          {/* Tags */}
          {chipTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chipTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground border border-border rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Rescue Story / Background */}
          <div className="space-y-2 border-t border-border pt-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {t("petDetail.rescueNarrative", "Rescue Narrative & Background")}
            </h3>
            <p className="text-base text-foreground/90 leading-relaxed">
              {pet.rescueStory}
            </p>
          </div>

          {/* Clinical Medical Care Timeline */}
          <div className="border-t border-border pt-5">
            <MedicalTimeline pet={pet} compact={true} />
          </div>

          {/* Compatibility */}
          <div className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {t("petDetail.compatibilityTitle", "Household Compatibility & Temperament")}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-border bg-background p-3.5 text-center rounded-xl">
                <Dog className="size-4.5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("petDetail.goodWithDogs", "Dogs")}
                </p>
                <p className={`text-sm font-bold mt-1 ${pet.compatibility.goodWithDogs ? "text-success-text " : "text-destructive"}`}>
                  {pet.compatibility.goodWithDogs ? t("petDetail.good", "Good") : t("petDetail.noDogs", "No Dogs")}
                </p>
              </div>

              <div className="border border-border bg-background p-3.5 text-center rounded-xl">
                <Cat className="size-4.5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("petDetail.goodWithCats", "Cats")}
                </p>
                <p className={`text-sm font-bold mt-1 ${pet.compatibility.goodWithCats ? "text-success-text " : "text-destructive"}`}>
                  {pet.compatibility.goodWithCats ? t("petDetail.good", "Good") : t("petDetail.noCats", "No Cats")}
                </p>
              </div>

              <div className="border border-border bg-background p-3.5 text-center rounded-xl">
                <Baby className="size-4.5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("petDetail.goodWithKids", "Children")}
                </p>
                <p className={`text-sm font-bold mt-1 ${pet.compatibility.goodWithKids ? "text-success-text " : "text-destructive"}`}>
                  {pet.compatibility.goodWithKids ? t("petDetail.kidSafe", "Kid-Safe") : t("petDetail.adultsOnly", "Adults Only")}
                </p>
              </div>

              <div className="border border-border bg-background p-3.5 text-center rounded-xl">
                <Activity className="size-4.5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("petDetail.energyLevel", "Energy Level")}
                </p>
                <p className="text-sm font-bold text-foreground mt-1">
                  {pet.compatibility.energyLevel === "Low" ? t("common.low", "Low") : pet.compatibility.energyLevel === "High" ? t("common.high", "High") : t("common.moderate", "Moderate")}
                </p>
              </div>
            </div>
          </div>

          <PetTraining tags={pet.tags} variant="dialog" />

          {/* Intake Date & Fee for mobile */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium">
              <Calendar className="size-4" />
              <span>{t("petDetail.intakeDate", "Rescue Intake Date")}: {pet.intakeDate}</span>
            </div>
            <div className="font-bold text-foreground text-sm sm:hidden">
              {t("petDetail.adoptionFee", "Adoption Fee")}: <span className="font-semibold text-success-accent ">{pet.adoptionFee.toLowerCase().includes("free") ? (isMs ? "Percuma (RM 0)" : "Free (RM 0)") : pet.adoptionFee}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-border pt-5 flex flex-col sm:flex-row gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-sm font-medium px-5 py-2.5 focus-visible:ring-2 cursor-pointer"
            >
              {t("common.close", "Close")}
            </Button>

            <Button
              disabled={!isAvailable}
              onClick={() => {
                onOpenChange(false);
                onStartAdoption(pet);
              }}
              className="text-sm font-semibold px-6 py-2.5 focus-visible:ring-2 cursor-pointer"
            >
              <Heart className="size-4 fill-current mr-1.5" />
              {isAvailable
                ? `${t("petDetail.applyToAdopt", "Apply to Adopt")} (${pet.name})`
                : t(status.labelKey, status.labelFallback)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
