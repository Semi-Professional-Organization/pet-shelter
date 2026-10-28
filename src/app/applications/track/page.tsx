"use client";

import { SHELTER_WHATSAPP_URL, SHELTER_PHONE_TEL, SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { lookupApplicationStatusAction } from "@/actions/applications";
import { PublicApplicationTrackingDTO } from "@/lib/validations/applicationTracking";
import { Button, buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/layout/Section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  MapPin,
  Video,
  Heart,
  Phone,
  MessageCircle,
  AlertCircle,
  Loader2,
  FileCheck2,
  ChevronRight,
  Home,
  type LucideIcon,
} from "lucide-react";
import {
  APPLICATION_MILESTONES,
  type ApplicationMilestone,
} from "@/lib/domain/applicationWorkflow";

/**
 * Presentation for each milestone, keyed by the domain's own list.
 *
 * A total `Record` over `ApplicationMilestone`, so adding a milestone to the
 * workflow without giving it a card is a compile error rather than a silently
 * missing step. The rail's numbering comes from the array position, which is
 * why the labels themselves carry no numbers.
 */
const MILESTONE_CARDS: Record<
  ApplicationMilestone,
  { icon: LucideIcon; titleKey: string; titleFallback: string; subKey: string; subFallback: string }
> = {
  RECEIVED: {
    icon: CheckCircle2,
    titleKey: "tracking.step1",
    titleFallback: "Received",
    subKey: "tracking.step1Sub",
    subFallback: "In Queue",
  },
  REVIEW: {
    icon: Clock,
    titleKey: "tracking.step2",
    titleFallback: "Review",
    subKey: "tracking.step2Sub",
    subFallback: "Coordinator Screen",
  },
  INTERVIEW: {
    icon: Calendar,
    titleKey: "tracking.step3",
    titleFallback: "Meet & Greet",
    subKey: "tracking.step3Sub",
    subFallback: "Interaction",
  },
  HOME_VISIT: {
    icon: Home,
    titleKey: "tracking.step4",
    titleFallback: "Home Visit",
    subKey: "tracking.step4Sub",
    subFallback: "Safety Check",
  },
  DECISION: {
    icon: Heart,
    titleKey: "tracking.step5",
    titleFallback: "Decision",
    subKey: "tracking.step5Sub",
    subFallback: "Homebound",
  },
};

function ApplicationTrackerContent() {
  const searchParams = useSearchParams();
  const { t, isMs } = useLanguage();
  const initialRef = searchParams.get("ref") || "";
  const initialEmail = searchParams.get("email") || "";

  const [referenceId, setReferenceId] = useState(initialRef);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicApplicationTrackingDTO | null>(null);

  const handleLookup = useCallback(async (lookupRef: string, lookupEmail: string) => {
    if (!lookupRef.trim() || !lookupEmail.trim()) {
      setError(isMs ? "Sila masukkan kedua-dua Nombor Rujukan Permohonan dan Alamat E-mel anda." : "Please enter both your Application Reference ID and Email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await lookupApplicationStatusAction({
        referenceId: lookupRef.trim(),
        email: lookupEmail.trim(),
      });

      if (!res.success || !res.data) {
        setError(res.error || (isMs ? "Tiada permohonan ditemui. Sila semak butiran anda." : "No matching application found. Please verify your details."));
        setResult(null);
      } else {
        setResult(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isMs ? "Gagal menyemak status permohonan." : "Failed to query application status."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [isMs]);

  useEffect(() => {
    let isMounted = true;
    if (initialRef && initialEmail) {
      lookupApplicationStatusAction({
        referenceId: initialRef.trim(),
        email: initialEmail.trim(),
      })
        .then((res) => {
          if (!isMounted) return;
          if (res.success && res.data) {
            setResult(res.data);
          } else {
            setError(res.error || (isMs ? "Tiada permohonan ditemui." : "No matching application found."));
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err instanceof Error ? err.message : (isMs ? "Gagal menyemak status permohonan." : "Failed to query application status."));
        });
    }
    return () => {
      isMounted = false;
    };
  }, [initialRef, initialEmail, isMs]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(referenceId, email);
  };

  // Milestone progress is derived server-side by `deriveApplicationProgress`,
  // so the portal shows the same answer as the shelter's own tooling rather
  // than re-deriving it here from a status string.
  const currentStep = result?.milestoneIndex ?? 0;

  return (
    <Section className="min-h-screen">
      <div className="space-y-12">

        {/* Header */}
        <div className="space-y-6">
          <h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("tracking.title", "Track Application Status")}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("tracking.subtitle", "Enter your reference ID to see where your application stands.")}
          </p>
        </div>

        {/* Lookup Card */}
        <div className="rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="referenceId" className="text-xs font-semibold">
                  {t("tracking.refLabel", "Application Reference ID *")}
                </Label>
                <Input
                  id="referenceId"
                  placeholder={t("tracking.refPlaceholder", "e.g. HFS-APP-202609-K7QM")}
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold">
                  {t("tracking.emailLabel", "Applicant Email Address *")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("tracking.emailPlaceholder", "your.email@example.com")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t("tracking.loadingButton", "Querying Records...")}
                </>
              ) : (
                <>
                  <Search className="size-4" /> {t("tracking.button", "Check Application Status")}
                </>
              )}
            </Button>
          </form>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-start gap-2.5 animate-in">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Result & Progress Stepper */}
        {result && (
          <div className="space-y-6 animate-in">
            
            {/* Target Rescue Summary Card */}
            <div className="flex flex-col items-start gap-5 rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:flex-row sm:items-center sm:p-7">
              {result.petImage ? (
                <div className="relative size-20 sm:size-24 rounded-xl overflow-hidden shrink-0 border border-border">
                  <Image
                    src={result.petImage}
                    alt={result.petName}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="size-20 sm:size-24 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Heart className="size-8 text-muted-foreground" />
                </div>
              )}

              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-xl font-bold text-foreground">
                    {result.petName}
                  </h2>
                  {result.petBreed && (
                    <span className="text-xs text-muted-foreground font-medium">
                      &bull; {result.petBreed}
                    </span>
                  )}
                  <span className="tone-soft tone-success border text-3xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {t("common.freeAdoption", "100% Free Adoption")}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {isMs ? "Pemohon" : "Applicant"}: <strong>{result.applicantName}</strong> &bull; {isMs ? "Rujukan" : "Reference"}:{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-2xs">
                    {result.id}
                  </code>
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMs ? "Dihantar pada" : "Submitted on"}: <strong>{result.createdAt}</strong> &bull; {isMs ? "Kemaskini Terakhir" : "Last Updated"}:{" "}
                  <strong>{result.updatedAt}</strong>
                </p>
              </div>

              {result.petId && (
                <Link
                  href={`/pets/${result.petId}`}
                  className="text-xs font-semibold text-primary-ink hover:underline flex items-center gap-1 shrink-0"
                >
                  {isMs ? "Lihat Profil" : "View Profile"} <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>

            {/* Stepper Timeline (if not rejected) */}
            {result.status !== "REJECTED" ? (
              <div className="space-y-6 rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7">
                <h3 className="border-b border-border pb-3 font-heading text-xl font-bold tracking-tight text-foreground">
                  {t("tracking.timelineTitle", "Adoption Review Timeline")}
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 relative">
                  {APPLICATION_MILESTONES.map((milestone, index) => {
                    const card = MILESTONE_CARDS[milestone];
                    const Icon = card.icon;
                    const reached = currentStep >= index;
                    const isDecision = milestone === "DECISION";

                    return (
                      <div
                        key={milestone}
                        aria-current={currentStep === index ? "step" : undefined}
                        className={`p-4 rounded-xl border text-center space-y-1.5 transition-colors ${
                          reached
                            ? isDecision
                              ? "tone-soft tone-success"
                              : "bg-primary/5 border-primary/40 text-primary-ink"
                            : "bg-muted/30 border-border text-muted-foreground"
                        }`}
                      >
                        <Icon
                          className={`size-5 mx-auto ${
                            reached
                              ? isDecision
                                ? "text-success-accent"
                                : "text-primary-ink"
                              : "text-muted-foreground"
                          }`}
                        />
                        <p className="text-xs font-bold uppercase">
                          {index + 1}. {t(card.titleKey, card.titleFallback)}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {t(card.subKey, card.subFallback)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Scheduled Interview Card */}
                {result.interviewDetails && (
                  <div className="p-5 rounded-xl tone-soft tone-info border space-y-3 animate-in">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-info-accent " />
                      <h4 className="text-xs font-bold uppercase tracking-wider">
                        {t("tracking.meetGreetTitle", "Scheduled Meet & Greet Appointment")}
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">{t("tracking.dateTimeLabel", "Date & Time:")}</span>
                        <p className="font-semibold">
                          📅 {result.interviewDetails.interviewDate} at {result.interviewDetails.interviewTime}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("tracking.formatLabel", "Format:")}</span>
                        <p className="font-semibold">
                          📍 {result.interviewDetails.meetingType === "video_call" ? t("tracking.virtualMeeting", "Virtual Video Call") : t("tracking.inPersonMeeting", "In-Person Shelter Visit")}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">{t("tracking.locationLabel", "Location / Link:")}</span>
                        <p className="font-semibold">{result.interviewDetails.location}</p>
                      </div>
                    </div>

                    {result.interviewDetails.coordinatorNotes && (
                      <div className="bg-background/80 p-3 rounded-lg text-xs border border-info-border ">
                        <strong>{t("tracking.coordinatorNote", "Coordinator Note:")}</strong> {result.interviewDetails.coordinatorNotes}
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap gap-3">
                      {result.interviewDetails.meetingType === "video_call" ? (
                        <a
                          href={
                            result.interviewDetails.location.startsWith("http")
                              ? result.interviewDetails.location
                              : `https://${result.interviewDetails.location}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 bg-info-solid text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-info-solid transition"
                        >
                          <Video className="size-3.5" /> {t("tracking.joinMeetingBtn", "Join Video Meeting →")}
                        </a>
                      ) : (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            result.interviewDetails.location
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 bg-info-solid text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-info-solid transition"
                        >
                          <MapPin className="size-3.5" /> {t("tracking.viewMapBtn", "View Location on Google Maps")}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Approved State Celebration Card */}
                {result.status === "APPROVED" && (
                  <div className="p-5 rounded-xl tone-soft tone-success border space-y-3 animate-in">
                    <div className="flex items-center gap-2 text-success-text ">
                      <FileCheck2 className="size-5" />
                      <h4 className="text-sm font-bold">
                        🎉 {t("tracking.approvedTitle", "Congratulations! Your Adoption is Approved!")}
                      </h4>
                    </div>
                    <p className="text-xs leading-relaxed">
                      {isMs
                        ? `Penyelaras adopsi kami telah meluluskan permohonan anda untuk ${result.petName}. Anda dijemput hadir ke pusat perlindungan untuk melengkapkan urusan Adopsi 100% Percuma dan mengambil pasport perubatan ${result.petName}.`
                        : `Our adoption coordinator has officially approved your application for ${result.petName}. You are welcome to come to the shelter to complete the 100% Free Adoption formalities and collect ${result.petName}'s medical passport.`}
                    </p>
                    <div className="text-xs space-y-1 bg-background/80 p-3 rounded-lg border border-success-border ">
                      <strong>{t("tracking.checklistTitle", "Checklist for Adoption Day:")}</strong>
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                        <li>{t("tracking.checklistItem1", "Original IC or Passport for adoption charter signing.")}</li>
                        <li>{t("tracking.checklistItem2", "Pet carrier (for cats) or secure collar/leash (for dogs).")}</li>
                        <li>{t("tracking.checklistItem3", "Complete free vaccination & microchip registration transfer.")}</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Under Review Guidance Card */}
                {result.status === "UNDER_REVIEW" && !result.interviewDetails && (
                  <div className="p-4 rounded-xl tone-soft tone-warning border text-xs space-y-1">
                    <p className="font-semibold">⏳ {t("tracking.reviewTitle", "Review Currently in Progress")}</p>
                    <p className="text-muted-foreground leading-relaxed">
                      {t("tracking.reviewDesc", "Our team is reviewing your household profile. We will reach out via WhatsApp or email to confirm a Meet & Greet time slot.")}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Rejected State Closure Card */
              <div className="space-y-4 rounded-3xl border border-border bg-work-panel p-6 shadow-xs sm:p-7">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="size-5 text-warning-accent" />
                  <h3 className="font-heading text-xl font-bold tracking-tight text-foreground">
                    {t("tracking.closedTitle", "Application Status: Closed")}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("tracking.closedDesc", "Thank you for your interest. After evaluating all submissions and the specific temperament requirements of this rescue, we were unable to proceed with this match.")}
                </p>
                <div className="pt-2">
                  <Link
                    href="/pets"
                    className={buttonVariants({ className: "gap-2" })}
                  >
                    <Heart className="size-3.5" /> {t("tracking.viewOtherPetsBtn", "View Other Available Rescues")}
                  </Link>
                </div>
              </div>
            )}

            {/* Direct Support & Shelter Contact Card */}
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-muted/30 p-6 sm:flex-row sm:items-center sm:p-7">
              <div className="space-y-2">
                <h4 className="font-heading text-xl font-bold tracking-tight text-foreground">
                  {t("tracking.helplineTitle", "Hope for Strays Sanctuary & Helpline")}
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("tracking.helplineHours", "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Hours: Tue – Sun 10am – 5pm")}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 shrink-0">
                <a
                  href={SHELTER_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-control bg-brand-whatsapp px-6 text-xs font-semibold uppercase tracking-widest text-white shadow-brand-xs transition-colors hover:bg-brand-whatsapp-hover"
                >
                  <MessageCircle className="size-3.5" /> {t("tracking.whatsAppBtn", "WhatsApp Coordinator")}
                </a>
                <a
                  href={`tel:${SHELTER_PHONE_TEL}`}
                  className={buttonVariants({ variant: "outline", className: "gap-2" })}
                >
                  <Phone className="size-3.5" /> {t("tracking.callBtn", SHELTER_PHONE_DISPLAY)}
                </a>
              </div>
            </div>

          </div>
        )}

      </div>
    </Section>
  );
}

export default function TrackApplicationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-8">
          <Loader2 className="size-6 animate-spin text-primary-ink" />
        </div>
      }
    >
      <ApplicationTrackerContent />
    </Suspense>
  );
}
