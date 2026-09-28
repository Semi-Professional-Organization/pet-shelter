"use client";

import React, { useMemo } from "react";
import { Pet, MedicalTimelineCategory } from "@/types/pet";
import { getPetMedicalTimeline } from "@/lib/domain/medicalTimeline";
import { getCategoryBadgeClasses } from "@/lib/presentation/medicalTimelinePresentation";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  ShieldCheck,
  Stethoscope,
  Syringe,
  Scissors,
  Activity,
  CheckCircle2,
  FileCheck2,
  Check,
} from "lucide-react";

interface MedicalTimelineProps {
  pet: Pet;
  compact?: boolean;
}

export function MedicalTimeline({ pet, compact = false }: MedicalTimelineProps) {
  const { language, t, isMs } = useLanguage();
  const timelineEvents = useMemo(() => {
    return getPetMedicalTimeline(pet, language);
  }, [pet, language]);

  const getCategoryIcon = (category: MedicalTimelineCategory) => {
    switch (category) {
      case "intake":
        return <Activity className="size-3.5 sm:size-4 text-info-text " />;
      case "diagnostic":
        return <Stethoscope className="size-3.5 sm:size-4 text-highlight-text" />;
      case "treatment":
        return <CheckCircle2 className="size-3.5 sm:size-4 text-warning-text " />;
      case "vaccination":
        return <Syringe className="size-3.5 sm:size-4 text-success-text " />;
      case "surgery":
        return <Scissors className="size-3.5 sm:size-4 text-danger-text " />;
      case "clearance":
        return <FileCheck2 className="size-3.5 sm:size-4 text-success-text " />;
      default:
        return <ShieldCheck className="size-3.5 sm:size-4 text-foreground" />;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return new Intl.DateTimeFormat(isMs ? "ms-MY" : "en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`space-y-4 ${compact ? "p-3 bg-muted/20 rounded-xl" : "pt-2"}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-border pb-2.5">
        <div>
          <h3 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="size-5 text-success-text " />
            {t("medicalTimeline.title", "Rescue & Veterinary Care Timeline")}
          </h3>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("medicalTimeline.subtitle", "Verified chronological clinical history, diagnostic screenings, treatments, and veterinary clearances.")}
            </p>
          )}
        </div>

        {/* Verification Tag */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 tone-soft tone-success border text-2xs font-bold rounded-full shrink-0">
          <Check className="size-3 text-success-accent stroke-[3]" />
          <span>{isMs ? "Rekod Sahih Veterinar" : "Shelter Vet Certified"}</span>
        </div>
      </div>

      {/* Timeline Stream */}
      {timelineEvents.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 border border-border p-4 rounded-xl">
          {t("medicalTimeline.noRecords", "No veterinary records yet.")}
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-4 pt-2">
          {/* Vertical Connecting Guide */}
          <div
            className="absolute left-2.75 sm:left-3.75 top-3 bottom-3 w-0.5 bg-neutral-border "
            aria-hidden="true"
          />

          {timelineEvents.map((event, index) => (
            <div key={event.id || index} className="relative group">
              {/* Timeline Node Dot */}
              <div
                className="absolute -left-6 sm:-left-8 top-1.5 size-6 sm:size-7 rounded-full bg-background border-2 border-border flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform"
                aria-hidden="true"
              >
                {getCategoryIcon(event.category)}
              </div>

              {/* Event Card */}
              <div className="bg-background border border-border rounded-xl p-3.5 sm:p-4 shadow-xs space-y-1.5 transition-colors hover:border-foreground/30">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                    {formatDate(event.date)}
                  </span>
                  {event.badge && (
                    <span
                      className={`text-3xs font-bold px-2 py-0.5 rounded-full border ${getCategoryBadgeClasses(
                        event.category
                      )}`}
                    >
                      {event.badge}
                    </span>
                  )}
                </div>

                <h4 className="font-heading text-sm sm:text-base font-bold text-foreground">
                  {event.title}
                </h4>

                <p className="text-xs text-foreground/85 leading-relaxed">
                  {event.description}
                </p>

                {event.veterinarian && (
                  <div className="pt-1 text-2xs text-muted-foreground flex items-center gap-1.5">
                    <Stethoscope className="size-3 text-primary shrink-0" />
                    <span>
                      {t("medicalTimeline.verifiedBy", "Verified by")} <strong>{event.veterinarian}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
