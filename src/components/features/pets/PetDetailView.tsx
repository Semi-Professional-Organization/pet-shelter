"use client";

import Image from "next/image";
import Link from "next/link";
import { Pet } from "@/types/pet";
import { AdoptionForm } from "@/components/features/adoptions/AdoptionForm";
import { SponsorshipModal } from "./SponsorshipModal";
import { MedicalTimeline } from "./MedicalTimeline";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHELTER_WHATSAPP_URL } from "@/lib/domain/shelterIdentity";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  Heart,
  ShieldCheck,
  Check,
  X,
  Activity,
  Baby,
  Dog,
  Cat,
  Share2,
  MessageCircle,
  ArrowLeft,
  HeartHandshake,
  CheckCircle2,
  Users,
  Star,
  MapPin,
  CalendarDays,
  User,
  Sparkles,
  ArrowRight,
  Gift,
  Clock,
} from "lucide-react";
import { getRehabStageLabel, getRehabProgressPercent, getPlacementOptions } from "@/lib/presentation/petStatusPresentation";
import { genderLabelArgs } from "@/lib/presentation/petLabels";
import { PetStatusIcon } from "./PetStatusIcon";
import { ICON_BY_TRAINING, trainingKindsIn, type TrainingKind } from "./petTraining";
import { usePetDetailViewController, PetDetailTab } from "@/hooks/usePetDetailViewController";
import { formatMYR } from "@/lib/domain/money";

interface PetDetailViewProps {
  initialPet: Pet;
  initialTab?: PetDetailTab;
}

export function PetDetailView(props: PetDetailViewProps) {
  const { t, isMs } = useLanguage();
  const { state, handlers } = usePetDetailViewController(props);
  const {
  pet,
  pets,
  isAvailable,
  statusPresentation,
  activeTab,
  isAdoptionOpen,
  isSponsorshipOpen,
  copiedLink,
  waUrl,
  sponsorshipSummary,
  showSocialProof,
  isFullySponsored,
  } = state;
  const {
    setActiveTab,
    setIsAdoptionOpen,
    setIsSponsorshipOpen,
    handleShare,
    refreshSponsorship,
  } = handlers;

  const isInRehabilitation = statusPresentation.isInRehabilitation;
  const placement = getPlacementOptions(pet);
  const training = trainingKindsIn(pet.tags);
  const trainingLabel: Record<TrainingKind, string> = {
    houseTrained: t("petDetail.houseTrained", "House Trained"),
    litterBoxTrained: t("petDetail.litterBoxTrained", "Litter Box Trained"),
    leashTrained: t("petDetail.leashTrained", "Leash Trained"),
  };
  const rehabStage = isInRehabilitation ? getRehabStageLabel(pet, isMs) : undefined;
  const rehabProgress = isInRehabilitation ? getRehabProgressPercent(pet) : undefined;
  // Newest first, and never mutate the array the store handed us.
  const updates = [...(pet.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const tabItems: { id: PetDetailTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: "about", label: t("petDetail.tabAbout", "About Me"), icon: User },
    { id: "status", label: t("petDetail.tabStatus", "Status & Health"), icon: ShieldCheck },
    { id: "updates", label: t("petDetail.tabUpdates", "Updates Feed"), icon: CalendarDays, count: updates.length },
    { id: "support", label: t("petDetail.tabSupport", "Support & Inquiry"), icon: HeartHandshake },
  ];

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabItems.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabItems.length) % tabItems.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = tabItems.length - 1;
    } else {
      return;
    }

    const nextTab = tabItems[nextIndex];
    setActiveTab(nextTab.id);
    const el = document.getElementById(`tab-${nextTab.id}`);
    el?.focus();
  };

  return (
    <div className="min-h-screen bg-card pb-20">
      {/* Top Breadcrumbs & Back */}
      <div className="border-b border-border bg-muted/20">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 py-4 flex items-center justify-between">
          <Link
            href="/pets"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t("common.backToAllPets", "Back to All Pets")}
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="text-xs gap-1.5 h-8 px-3 cursor-pointer"
            >
              {copiedLink ? <CheckCircle2 className="size-3.5 text-success-accent" /> : <Share2 className="size-3.5" />}
              {copiedLink ? t("common.linkCopied", "Link Copied!") : t("common.sharePet", "Share Pet")}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 pt-8 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 max-w-7xl mx-auto">
          
          {/* Left Column: Pet Portrait & Quick Facts */}
          <div className="lg:col-span-5 space-y-4">
            <div className="relative aspect-4/3 w-full overflow-hidden border border-border bg-muted shadow-xs rounded-2xl">
              <Image
                src={pet.image}
                alt={`${pet.name} - ${pet.breed}`}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
              <div className="absolute top-4 left-4 flex gap-2">
                <span
                  className={`${statusPresentation.badgeClass} gap-1.5 px-3 py-1 text-xs shadow-sm`}
                >
                  <PetStatusIcon tone={statusPresentation.tone} className="size-3.5" />
                  {t(statusPresentation.labelKey, statusPresentation.labelFallback)}
                </span>
                {pet.featured && (
                  <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-warning-solid text-white flex items-center gap-1 shadow-sm rounded-md">
                    <Star className="size-3 fill-current" /> {isMs ? "Pilihan Utama" : "Featured"}
                  </span>
                )}
              </div>
              <div className="absolute bottom-4 right-4 bg-black/85 px-3 py-1 text-xs font-semibold text-white rounded-md backdrop-blur-xs">
                {t(...genderLabelArgs(pet.gender))} • {pet.age}
              </div>
            </div>

            {/* Quick Location & Visiting Note */}
            <div className="border border-border bg-muted/30 p-4 text-xs space-y-1.5 rounded-xl">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary-ink" />
                {t("petDetail.sanctuaryLocationHours", "Sanctuary Location & Visiting Hours")}
              </div>
              <p className="text-muted-foreground">
                {t("petDetail.sanctuaryAddress", "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Open Tue–Sun: 10:00 AM – 5:00 PM")}
              </p>
            </div>
          </div>

          {/* Right Column: Narrative, 4-Part Tabs, and Actions */}
          <div className="lg:col-span-7 space-y-6">
            {/* Header: Name, Breed, Intake, and Status Metric */}
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                  {pet.name}
                </h1>
                {!isInRehabilitation ? (
                  <div className="text-right">
                    <span className="text-3xs font-bold uppercase tracking-wider text-success-accent block">
                      {t("petDetail.adoptionFee", "Adoption Fee")}
                    </span>
                    <span className="font-heading text-2xl font-bold text-success-text ">
                      {pet.adoptionFee.toLowerCase().includes("free")
                        ? isMs
                          ? "Percuma (RM 0)"
                          : "Free (RM 0)"
                        : pet.adoptionFee}
                    </span>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-3xs font-bold uppercase tracking-wider text-care-accent block">
                      {t("petDetail.careProgram", "Care Program")}
                    </span>
                    <span className="font-heading text-lg font-bold text-care-text ">
                      {t("petDetail.sponsorSupported", "Sponsor Supported")}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-base text-muted-foreground mt-1">
                {pet.breed} • <span className="font-mono font-medium">{pet.weight}</span> • {t("petDetail.intakeDate", "Rescue Intake Date")}: {pet.intakeDate}
              </p>
            </div>

            {/* Quick Action Bar */}
            <div
            className={`grid grid-cols-1 gap-3 border-y border-border py-4 ${
            isInRehabilitation ? "sm:grid-cols-2" : "sm:grid-cols-3"
              }`}
            >
              {/* An animal that needs socialising is offered for foster instead of adoption
                  (getPlacementOptions). Interim: a WhatsApp message until applications can record
                  "foster". Animals under care get neither — sponsorship below. */}
              {placement.foster && (
                <a
                  href={`${SHELTER_WHATSAPP_URL}?text=${encodeURIComponent(
                    `Hi Hope for Strays, I would like to foster ${pet.name}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants(),
                    "w-full text-xs sm:text-sm font-bold uppercase tracking-wider gap-1.5 py-3 cursor-pointer rounded-xl"
                  )}
                >
                  <Heart className="size-4" />
                  {t("petDetail.applyToFoster", "Apply to Foster")}
                </a>
              )}

              {!isInRehabilitation && !placement.foster && (
                <Button
                disabled={!isAvailable}
                onClick={() => setIsAdoptionOpen(true)}
                className="w-full text-xs sm:text-sm font-bold uppercase tracking-wider gap-1.5 py-3 cursor-pointer rounded-xl"
                >
                  <Heart className="size-4 fill-current" />
                  {isAvailable
                    ? t("petDetail.applyToAdopt", "Apply to Adopt")
                    : t("petDetail.adoptionPending", "Adoption Pending")}
                </Button>
              )}

              <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
              variant: "outline",
              className: "w-full text-xs font-bold gap-1.5 py-3 text-success-text border-success-accent/30 hover:bg-success-surface rounded-xl",
                })}
              >
                <MessageCircle className="size-4" />
                {t("petDetail.whatsAppUs", "WhatsApp Us")}
              </a>

              {/* Once the care programme is funded the primary action points
                  visitors at animals who still need one. Giving is never blocked
                  outright, only de-emphasised — see "sponsor anyway" below. */}
              {isFullySponsored ? (
                <Link
                  href="/pets"
                  className={buttonVariants({
                    variant: "outline",
                    className:
                      "w-full text-xs font-bold uppercase tracking-wider gap-1.5 py-3 rounded-xl",
                  })}
                >
                  <CheckCircle2 className="size-4" />
                  {t("petDetail.fullySponsored", "Fully Sponsored — View Others")}
                </Link>
              ) : (
                <Button
                  onClick={() => setIsSponsorshipOpen(true)}
                  className="w-full text-xs sm:text-sm font-bold uppercase tracking-wider gap-1.5 py-3 cursor-pointer rounded-xl bg-care-solid text-care-on-solid hover:bg-care-accent"
                >
                  <HeartHandshake className="size-4" />
                  {t("petDetail.sponsorCare", "Sponsor Care")}
                </Button>
              )}
            </div>

            {/* Social proof. Shown only once a payment has been reconciled:
                "sponsored by 0 supporters" is worse than silence, and an
                unreconciled pledge is a stranger's claim on a public form. */}
            {sponsorshipSummary && (showSocialProof || isFullySponsored) && (
              <div className="space-y-2 pb-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {showSocialProof && (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                      <Users className="size-3.5 text-care-accent" />
                      {sponsorshipSummary.supporterCount === 1
                        ? t(
                            "petDetail.sponsoredByOneSupporter",
                            "Currently sponsored by 1 supporter"
                          )
                        : t(
                            "petDetail.sponsoredBySupporters",
                            "Currently sponsored by {count} supporters",
                            { count: sponsorshipSummary.supporterCount }
                          )}
                    </span>
                  )}

                  <span className="text-muted-foreground">
                    {t("petDetail.fundingProgress", "{funded} of {goal} raised for care", {
                      funded: formatMYR(sponsorshipSummary.fundedSen),
                      goal: formatMYR(sponsorshipSummary.goalSen),
                    })}
                  </span>

                  {isFullySponsored && (
                    <button
                      type="button"
                      onClick={() => setIsSponsorshipOpen(true)}
                      className="underline underline-offset-2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {t("petDetail.sponsorAnyway", "Sponsor anyway")}
                    </button>
                  )}
                </div>

                <div
                  className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={sponsorshipSummary.progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(
                    "petDetail.fundingProgressLabel",
                    "{percent}% of care costs funded",
                    { percent: sponsorshipSummary.progressPercent }
                  )}
                >
                  <div
                    className={`h-full rounded-full ${isFullySponsored ? "bg-success-accent" : "bg-care-accent"}`}
                    style={{ width: `${sponsorshipSummary.progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* 4-Part Tabbed Navigation Bar (FE-05) */}
            <div className="border-b border-border">
              <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-1" aria-label="Pet Profile Tabs" role="tablist">
                {tabItems.map((tab, idx) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      id={`tab-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      aria-selected={isActive}
                      aria-controls={`panel-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className={`inline-flex items-center gap-2 py-3 px-3.5 sm:px-4 text-xs sm:text-sm font-bold tracking-tight border-b-2 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                        isActive
                          ? "border-primary text-foreground font-extrabold"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                    >
                      <Icon className={`size-4 ${isActive ? "text-primary-ink" : "text-muted-foreground"}`} />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className="px-1.5 py-0.5 text-3xs font-mono font-bold bg-muted text-muted-foreground rounded-full">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab 1: About Me */}
            {activeTab === "about" && (
              <div id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="space-y-6">
                {/* Characteristic Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {pet.tags.map((tag, idx) => (
                    <span
                  key={idx}
                  className="bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground border border-border rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Rescue Story & Description */}
                <div className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {t("petDetail.rescueNarrative", "Rescue Narrative & Background")}
                  </h2>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {pet.rescueStory}
                  </p>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {pet.description}
                  </p>
                </div>

                {/* Household Compatibility Matrix */}
                <div className="space-y-3 pt-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {t("petDetail.compatibilityTitle", "Household Compatibility & Temperament")}
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="border border-border bg-background p-3 rounded-xl">
                      <Dog className="size-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="eyebrow">{t("petDetail.goodWithDogs", "Dogs")}</div>
                      <div className={`text-xs font-bold mt-0.5 ${pet.compatibility.goodWithDogs ? "text-success-text " : "text-destructive"}`}>
                        {pet.compatibility.goodWithDogs ? t("petDetail.good", "Good") : t("petDetail.noDogs", "No Dogs")}
                      </div>
                    </div>

                    <div className="border border-border bg-background p-3 rounded-xl">
                      <Cat className="size-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="eyebrow">{t("petDetail.goodWithCats", "Cats")}</div>
                      <div className={`text-xs font-bold mt-0.5 ${pet.compatibility.goodWithCats ? "text-success-text " : "text-destructive"}`}>
                        {pet.compatibility.goodWithCats ? t("petDetail.good", "Good") : t("petDetail.noCats", "No Cats")}
                      </div>
                    </div>

                    <div className="border border-border bg-background p-3 rounded-xl">
                      <Baby className="size-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="eyebrow">{t("petDetail.goodWithKids", "Children")}</div>
                      <div className={`text-xs font-bold mt-0.5 ${pet.compatibility.goodWithKids ? "text-success-text " : "text-destructive"}`}>
                        {pet.compatibility.goodWithKids ? t("petDetail.kidSafe", "Kid-Safe") : t("petDetail.adultsOnly", "Adults Only")}
                      </div>
                    </div>

                    <div className="border border-border bg-background p-3 rounded-xl">
                      <Activity className="size-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="eyebrow">{t("petDetail.energyLevel", "Energy")}</div>
                      <div className="text-xs font-bold text-foreground mt-0.5">
                        {pet.compatibility.energyLevel === "Low" ? t("common.low", "Low") : pet.compatibility.energyLevel === "High" ? t("common.high", "High") : t("common.moderate", "Moderate")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Training: positive only. A missing tag means unknown, not untrained, so nothing says "No". */}
                {training.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {t("petDetail.trainingTitle", "Training")}
                    </h2>

                    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                      {training.map((kind) => {
                        const Icon = ICON_BY_TRAINING[kind];
                        return (
                          <li key={kind} className="border border-border bg-background p-3 rounded-xl">
                            <Icon className="size-4 mx-auto mb-1 text-muted-foreground" aria-hidden="true" />
                            <div className="text-xs font-bold text-success-text">{trainingLabel[kind]}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Status & Health */}
            {activeTab === "status" && (
              <div id="panel-status" role="tabpanel" aria-labelledby="tab-status" className="space-y-6">
                {/* Rehabilitation status banner */}
                {isInRehabilitation && (
                  <div className="border border-care-accent/30 bg-care-surface p-4 space-y-3 rounded-xl">
                    <div className="flex items-start gap-2">
                      <PetStatusIcon tone={statusPresentation.tone} className="size-5 shrink-0 text-care-text " />
                      <div className="min-w-0 space-y-1">
                        <span className={statusPresentation.badgeClass}>
                          {t(statusPresentation.labelKey, statusPresentation.labelFallback)}
                        </span>
                        {rehabStage && (
                          <p className="font-heading text-lg font-bold text-foreground leading-snug">
                            {rehabStage}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                        "petDetail.underCareNotice",
                        "Under veterinary care — not yet available for adoption. Sponsorship funds this animal's treatment."
                          )}
                        </p>
                      </div>
                    </div>

                    {rehabProgress !== undefined && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-2xs font-semibold">
                          <span className="uppercase tracking-wider text-muted-foreground">
                            {t("common.rehabProgress", "Recovery Progress")}
                          </span>
                          <span className="font-mono text-foreground">{rehabProgress}%</span>
                        </div>
                        <div
                      className="h-2 w-full overflow-hidden bg-muted rounded-full"
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

                {/* Veterinary Clearance Checklist */}
                <div className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="size-4 text-success-text " />
                    {t("petDetail.vetClearanceTitle", "Veterinary Clearance & Medical Status")}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="border border-border bg-background p-3 flex items-center gap-2 rounded-xl">
                      <div className={`p-1 border rounded-md ${pet.medical.vaccinated ? "border-success-accent/40 bg-success-surface text-success-text " : "border-destructive text-destructive"}`}>
                        {pet.medical.vaccinated ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{t("petDetail.vaccinatedTitle", "Core Vaccinated")}</div>
                        <div className="text-3xs text-muted-foreground">{t("petDetail.vaccinatedSub", "DHPPi / FVRCP series")}</div>
                      </div>
                    </div>

                    <div className="border border-border bg-background p-3 flex items-center gap-2 rounded-xl">
                      <div className={`p-1 border rounded-md ${pet.medical.spayedNeutered ? "border-success-accent/40 bg-success-surface text-success-text " : "border-destructive text-destructive"}`}>
                        {pet.medical.spayedNeutered ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{t("petDetail.spayedTitle", "Spayed / Neutered")}</div>
                        <div className="text-3xs text-muted-foreground">{t("petDetail.spayedSub", "Certified sterile")}</div>
                      </div>
                    </div>

                    <div className="border border-border bg-background p-3 flex items-center gap-2 rounded-xl">
                      <div className={`p-1 border rounded-md ${pet.medical.microchipped ? "border-success-accent/40 bg-success-surface text-success-text " : "border-destructive text-destructive"}`}>
                        {pet.medical.microchipped ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{t("petDetail.chippedTitle", "Microchipped")}</div>
                        <div className="text-3xs text-muted-foreground">{t("petDetail.chippedSub", "Registered ISO ID")}</div>
                      </div>
                    </div>
                  </div>

                  {pet.medical.specialNeeds && (
                    <div className="bg-warning-surface border border-warning-accent/30 p-3 text-xs text-warning-text rounded-xl">
                      <strong>{t("petDetail.specialCareTitle", "Special Care Note")}: </strong> {pet.medical.specialNeeds}
                    </div>
                  )}
                </div>

                {/* Medical Timeline */}
                <div className="border border-border bg-background p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
                  <MedicalTimeline pet={pet} compact={false} />
                </div>
              </div>
            )}

            {/* Tab 3: Updates Feed */}
            {activeTab === "updates" && (
              <div id="panel-updates" role="tabpanel" aria-labelledby="tab-updates" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <CalendarDays className="size-4" />
                    {t("petDetail.updatesTitle", "Progress Updates")}
                  </h2>
                  <span className="text-xs text-muted-foreground font-mono">
                    {updates.length} {isMs ? "catatan" : "entries"}
                  </span>
                </div>

                {updates.length > 0 ? (
                  <ol className="space-y-4">
                    {updates.map((update) => (
                      <li
                      key={update.id}
                      className="border border-border bg-background p-5 rounded-2xl shadow-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                          <time
                          dateTime={update.date}
                          className="font-mono text-xs font-semibold text-muted-foreground flex items-center gap-1"
                          >
                            <Clock className="size-3" />
                            {update.date}
                          </time>
                          {update.category && (
                            <span className="bg-secondary px-2.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-secondary-foreground border border-border rounded-md">
                              {update.category}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug">
                          {(isMs && update.titleMs) || update.title}
                        </h3>
                        <p className="text-sm text-foreground/85 leading-relaxed">
                          {(isMs && update.contentMs) || update.content}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="border border-border bg-muted/20 p-8 rounded-2xl text-center text-sm text-muted-foreground space-y-2">
                    <CalendarDays className="size-8 mx-auto text-muted-foreground/60" />
                    <p>{t("petDetail.noUpdates", "No progress updates have been recorded yet.")}</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Support & Inquiry */}
            {activeTab === "support" && (
              <div id="panel-support" role="tabpanel" aria-labelledby="tab-support" className="space-y-6">
                {/* Personalized Sponsorship Highlight (FE-06) */}
                <div className="border-2 border-primary/40 bg-primary/5 p-6 rounded-2xl space-y-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-primary text-primary-foreground text-3xs font-extrabold uppercase tracking-wider rounded-md">
                        <Sparkles className="size-3" />
                        {isMs ? "Penajaan Diutamakan" : "Featured Program"}
                      </div>
                      <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                        {t("petDetail.sponsorPetPerksTitle", `Monthly Rescue Companion (RM 30/mo)`)}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("petDetail.sponsorPetPerksDesc", `Sponsor ${pet.name} monthly to receive personalized updates and help fund ongoing care.`)}
                      </p>
                    </div>
                    <span className="font-heading text-2xl font-black text-primary-ink font-mono shrink-0">
                      RM 30<span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                  </div>

                  {/* 3 Signature Perks */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-primary/20 text-xs">
                    <div className="p-3 bg-background/80 border border-primary/20 rounded-xl space-y-1">
                      <div className="font-bold text-foreground flex items-center gap-1 text-2xs">
                        📸 {isMs ? "Kemas Kini Bulanan" : "Monthly Care Reports"}
                      </div>
                      <p className="text-3xs text-muted-foreground leading-tight">
                        {t("donations.perkMonthlyUpdates", "Monthly Photo & Video Progress Report via WhatsApp/Email")}
                      </p>
                    </div>

                    <div className="p-3 bg-background/80 border border-primary/20 rounded-xl space-y-1">
                      <div className="font-bold text-foreground flex items-center gap-1 text-2xs">
                        🏅 {isMs ? "Sijil Digital" : "Digital Certificate"}
                      </div>
                      <p className="text-3xs text-muted-foreground leading-tight">
                        {t("donations.perkDigitalCertificate", "Personalized Digital Sponsorship Certificate")}
                      </p>
                    </div>

                    <div className="p-3 bg-background/80 border border-primary/20 rounded-xl space-y-1">
                      <div className="font-bold text-foreground flex items-center gap-1 text-2xs">
                        🐾 {isMs ? "Lawatan Santuari" : "Sanctuary Visits"}
                      </div>
                      <p className="text-3xs text-muted-foreground leading-tight">
                        {t("donations.perkSanctuaryVisits", "Invitation to arrange occasional sanctuary visits")}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <Link
                    href={`/donate?pet=${encodeURIComponent(pet.name)}&sponsorPetId=${encodeURIComponent(pet.id)}&tier=kibble`}
                    className={buttonVariants({
                    size: "sm",
                    className: "font-bold text-xs uppercase tracking-wider gap-1.5 px-5 py-2.5 rounded-xl cursor-pointer shadow-xs",
                      })}
                    >
                      <Gift className="size-3.5" />
                      {isMs ? `Taja ${pet.name} Sekarang` : `Sponsor ${pet.name} Today`}
                      <ArrowRight className="size-3.5" />
                    </Link>

                    <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSponsorshipOpen(true)}
                    className="font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl cursor-pointer"
                    >
                      {isMs ? "Pilihan Sumbangan Lain" : "Other Giving Options"}
                    </Button>
                  </div>
                </div>

                {/* Foster or Adoption Pathway */}
                {isInRehabilitation ? (
                  <div className="border border-border bg-background p-5 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-care-text font-bold text-xs uppercase tracking-wider">
                      <ShieldCheck className="size-4" />
                      {t("petDetail.fosterInquiryTitle", "Foster-to-Adopt & Care Inquiry")}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {t("petDetail.fosterInquiryDesc", `${pet.name} is currently undergoing clinical rehabilitation. Inquire about temporary fostering or meet-and-greet sessions once veterinary recovery clearance is granted.`)}
                    </p>
                    <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "font-bold text-xs gap-1.5 text-success-text border-success-accent/30 hover:bg-success-surface rounded-xl",
                      })}
                    >
                      <MessageCircle className="size-3.5" />
                      {t("petDetail.fosterWhatsAppBtn", "Inquire via WhatsApp")}
                    </a>
                  </div>
                ) : (
                  <div className="border border-border bg-background p-5 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-success-text font-bold text-xs uppercase tracking-wider">
                      <Heart className="size-4 fill-current" />
                      {t("petDetail.applyToAdopt", "Apply to Adopt")}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {isMs
                        ? `${pet.name} telah disahkan sihat sepenuhnya oleh doktor veterinar dan bersedia untuk memulakan kehidupan bersama keluarga penyayang.`
                        : `${pet.name} is medically cleared and ready to join a loving permanent household.`}
                    </p>
                    <Button
                    disabled={!isAvailable}
                    onClick={() => setIsAdoptionOpen(true)}
                    size="sm"
                    className="font-bold text-xs uppercase tracking-wider gap-1.5 rounded-xl cursor-pointer"
                    >
                      <Heart className="size-3.5 fill-current" />
                      {isAvailable ? t("petDetail.applyToAdopt", "Apply to Adopt") : t("petDetail.adoptionPending", "Adoption Pending")}
                    </Button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Adoption Form Modal */}
      <AdoptionForm
        open={isAdoptionOpen}
        onOpenChange={setIsAdoptionOpen}
        selectedPet={pet}
        allPets={pets}
      />

      {/* Sponsorship Modal */}
      <SponsorshipModal
        open={isSponsorshipOpen}
        onOpenChange={(open) => {
          setIsSponsorshipOpen(open);
          // A commitment made in this session is still pending, so the counter
          // will not move for it — but another coordinator may have reconciled
          // one meanwhile, and this is the only refresh point short of a reload.
          if (!open) refreshSponsorship();
        }}
        targetPet={pet}
      />
    </div>
  );
}
