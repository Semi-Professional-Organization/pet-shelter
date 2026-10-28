"use client";

import React, { useRef, useEffect } from "react";
import Image from "next/image";
import { Pet } from "@/types/pet";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { genderLabelArgs } from "@/lib/presentation/petLabels";
import { PetStatusIcon } from "@/components/features/pets/PetStatusIcon";

interface PetChooserCarouselProps {
  pets: Pet[];
  selectedPetId?: string | null;
  onSelectPet: (pet: Pet | null) => void;
}

export function PetChooserCarousel({
  pets,
  selectedPetId,
  onSelectPet,
}: PetChooserCarouselProps) {
  const { t, isMs } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isGeneralSelected = !selectedPetId || selectedPetId === "general";

  // Auto-scroll selected pet card into view
  useEffect(() => {
    if (selectedPetId && selectedPetId !== "general" && scrollContainerRef.current) {
      const targetCard = scrollContainerRef.current.querySelector<HTMLElement>(
        `[data-pet-id="${selectedPetId}"]`
      );
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [selectedPetId]);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 280;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header & Carousel Scroll Buttons */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-foreground block">
            {t("donations.choosePetTitle", "Dedicate Sponsorship to a Specific Animal")}
          </label>
          <p className="text-2xs text-muted-foreground mt-0.5">
            {t("donations.choosePetSubtitle", "Select an animal under sanctuary care or sponsor our general rescue fund")}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleScroll("left")}
            className="size-7 p-0 rounded-lg cursor-pointer"
            aria-label="Scroll Left"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleScroll("right")}
            className="size-7 p-0 rounded-lg cursor-pointer"
            aria-label="Scroll Right"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Horizontal Carousel Track */}
      <div
        ref={scrollContainerRef}
        className="flex gap-3 overflow-x-auto pb-3 pt-1 scroll-smooth snap-x snap-mandatory focus:outline-hidden"
        tabIndex={0}
        role="region"
        aria-label="Pet Selection Carousel"
      >
        {/* 1. General Sanctuary Fund Card */}
        <button
          type="button"
          onClick={() => onSelectPet(null)}
          aria-pressed={isGeneralSelected}
          className={`shrink-0 w-52 sm:w-56 p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all snap-start cursor-pointer ${
            isGeneralSelected
              ? "border-primary bg-primary/10 ring-2 ring-primary shadow-xs"
              : "border-border bg-card hover:bg-muted/50"
          }`}
        >
          <div className="space-y-2">
            <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-primary/15 border border-primary/20 flex flex-col items-center justify-center text-primary-ink">
              <Building2 className="size-8 mb-1 text-primary-ink" />
              <span className="text-3xs font-bold uppercase tracking-wider text-primary-ink">
                {isMs ? "Seluruh Santuari" : "Whole Shelter"}
              </span>
              {isGeneralSelected && (
                <div className="absolute top-2 right-2 bg-primary text-primary-foreground size-5 rounded-full flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="size-3.5" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1 font-heading text-sm font-bold text-foreground">
                <Sparkles className="size-3.5 text-primary-ink shrink-0" />
                <span>{t("donations.generalSanctuaryFund", "General Sanctuary Fund")}</span>
              </div>
              <p className="text-2xs text-muted-foreground mt-1 leading-tight line-clamp-2">
                {t(
                  "donations.generalSanctuaryFundDesc",
                  "Allocates funds flexibly where urgently needed most across all animals"
                )}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-border text-3xs font-semibold text-primary-ink">
            🐾 {isMs ? "Semua Haiwan Reskue" : "All Rescue Animals"}
          </div>
        </button>

        {/* 2. Individual Public Animals */}
        {pets.map((pet) => {
          const isSelected = selectedPetId === pet.id;
          const statusPres = getPetStatusPresentation(pet.status);

          return (
            <button
              key={pet.id}
              data-pet-id={pet.id}
              type="button"
              onClick={() => onSelectPet(pet)}
              aria-pressed={isSelected}
              className={`shrink-0 w-52 sm:w-56 p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all snap-start cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary shadow-xs"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className="space-y-2">
                <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden bg-muted border border-border">
                  <Image
                    src={pet.image}
                    alt={pet.name}
                    fill
                    className="object-cover"
                    sizes="220px"
                  />
                  <div className="absolute top-2 left-2">
                    <span className={`${statusPres.badgeClass} text-3xs px-2 py-0.5 shadow-xs`}>
                      <PetStatusIcon tone={statusPres.tone} className="size-2.5" />
                      {t(statusPres.labelKey, statusPres.labelFallback)}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground size-5 rounded-full flex items-center justify-center shadow-xs">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  )}

                  <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 text-3xs font-semibold text-white rounded-md">
                    {t(...genderLabelArgs(pet.gender))} • {pet.age}
                  </div>
                </div>

                <div>
                  <div className="font-heading text-sm font-bold text-foreground">
                    {pet.name}
                  </div>
                  <p className="text-2xs text-muted-foreground line-clamp-1">
                    {pet.breed} • {pet.weight}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-3xs text-muted-foreground">
                <span className="font-medium text-foreground">{pet.species}</span>
                <span className="text-primary-ink font-bold">
                  {statusPres.isInRehabilitation
                    ? isMs
                      ? "Program Rawatan"
                      : "In Rehab"
                    : isMs
                      ? "Sedia Diadopsi"
                      : "Adoptable"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
