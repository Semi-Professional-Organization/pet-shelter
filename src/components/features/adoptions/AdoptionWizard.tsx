"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, ArrowLeft, ArrowRight, Copy } from "lucide-react";
import { useState } from "react";
import { Pet } from "@/types/pet";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/components/providers/LanguageProvider";
import {
  useAdoptionFormController,
  ADOPTION_STEPS,
  type UseAdoptionFormControllerProps,
} from "@/hooks/useAdoptionFormController";
import {
  Field,
  SELECT_CLASS,
  FIELD_ROW_CLASS,
  HOUSING_TYPE_LABELS,
  FENCED_YARD_LABELS,
  LANDLORD_APPROVAL_LABELS,
  CURRENT_PETS_LABELS,
  EXPERIENCE_LABELS,
  DAILY_ALONE_HOURS_LABELS,
  options,
} from "./AdoptionFormFields";

const STEP_TITLES: Record<(typeof ADOPTION_STEPS)[number]["id"], { en: string; ms: string }> = {
  contact: { en: "Contact & Identification", ms: "Hubungan & Pengenalan" },
  living: { en: "Living Environment", ms: "Persekitaran Kediaman" },
  care: { en: "Experience & Care Plan", ms: "Pengalaman & Pelan Penjagaan" },
  agreement: { en: "Agreement", ms: "Perjanjian" },
};

/**
 * Progress rail. Reads `ADOPTION_STEPS` rather than a hand-written list, so the
 * rail cannot disagree with the wizard about how many steps there are.
 */
function StepRail({ stepIndex, isMs }: { stepIndex: number; isMs: boolean }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label={isMs ? "Kemajuan borang" : "Form progress"}>
      {ADOPTION_STEPS.map((step, index) => {
        const isDone = index < stepIndex;
        const isCurrent = index === stepIndex;
        return (
          <li key={step.id} className="flex-1">
            <div
              aria-current={isCurrent ? "step" : undefined}
              className={
                "h-1.5 rounded-full transition-colors " +
                (isDone || isCurrent ? "bg-primary" : "bg-muted")
              }
            />
            <p
              className={
                "mt-1.5 text-2xs font-semibold uppercase tracking-wide hidden sm:block " +
                (isCurrent ? "text-primary" : "text-muted-foreground")
              }
            >
              {index + 1}. {isMs ? STEP_TITLES[step.id].ms : STEP_TITLES[step.id].en}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export interface AdoptionWizardProps extends UseAdoptionFormControllerProps {
  /** Rendered as a page rather than inside the dialog; hides the Cancel button. */
  standalone?: boolean;
}

export function AdoptionWizard({ standalone = false, ...controllerProps }: AdoptionWizardProps) {
  const { t, isMs } = useLanguage();
  const { state, form, handlers } = useAdoptionFormController(controllerProps);
  const {
    petOptions,
    unavailableSelection,
    isSubmitted,
    submittedData,
    submissionError,
    referenceCode,
    stepIndex,
    stepId,
    stepCount,
    isFirstStep,
    isLastStep,
  } = state;
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { onSubmit, handleClose, goToNextStep, goToPreviousStep } = handlers;
  const [copied, setCopied] = useState(false);

  if (isSubmitted) {
    return (
      <div className="py-6 px-2 text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center tone-soft tone-panel-strong tone-success border rounded-full">
          <CheckCircle2 className="size-8" />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
            {t("adoptionForm.successTitle", "Application Submitted!")}
          </h2>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            {isMs
              ? `Terima kasih, ${submittedData?.applicantName}. Kami telah menerima permohonan anda untuk ${submittedData?.petName}. Penyelaras adopsi sukarelawan kami di Petaling Jaya akan menghubungi anda melalui WhatsApp/Emel dalam tempoh 1–2 hari bekerja.`
              : `Thank you, ${submittedData?.applicantName}. We received your application for ${submittedData?.petName}. Our volunteer adoption team in Petaling Jaya will contact you via WhatsApp/Email within 1–2 business days.`}
          </p>
        </div>

        {referenceCode && (
          <div className="mx-auto max-w-md tone-soft tone-panel-strong tone-success border p-5 rounded-xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider">
              {t("adoptionForm.referenceCodeLabel", "Your reference code")}
            </p>
            <div className="flex items-center justify-center gap-2">
              <code className="font-mono text-lg sm:text-xl font-bold tracking-wider">{referenceCode}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  navigator.clipboard?.writeText(referenceCode).then(
                    () => setCopied(true),
                    () => setCopied(false)
                  );
                }}
              >
                <Copy className="size-3.5 mr-1" />
                {copied ? t("common.copied", "Copied") : t("common.copy", "Copy")}
              </Button>
            </div>
            <p className="text-xs leading-relaxed">
              {t(
                "adoptionForm.referenceCodeHint",
                "Save this code. You will need it, together with your email address, to track your application."
              )}
            </p>
          </div>
        )}

        <div className="bg-muted/40 border border-border p-5 text-left text-sm space-y-2 max-w-md mx-auto text-foreground/90 leading-relaxed rounded-xl">
          <p className="font-bold text-foreground text-sm">
            {t("adoptionForm.nextStepsTitle", "What happens next?")}
          </p>
          <p>1. {t("adoptionForm.nextStep1", "Our adoption team will review your application within 24–48 hours.")}</p>
          <p>2. {t("adoptionForm.nextStep2", "We will contact you via WhatsApp to arrange an in-person Meet & Greet at our sanctuary.")}</p>
          <p>
            3.{" "}
            {t("adoptionForm.nextStep3Prefix", "Track live status anytime at")}{" "}
            <Link href="/applications/track" className="font-semibold underline underline-offset-2">
              /applications/track
            </Link>{" "}
            {t("adoptionForm.nextStep3Suffix", "using your reference code and email.")}
          </p>
        </div>

        <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={
              referenceCode
                ? `/applications/track?ref=${encodeURIComponent(referenceCode)}`
                : "/applications/track"
            }
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "text-sm font-semibold px-6 py-2"
            )}
          >
            {t("adoptionForm.trackNow", "Track my application")}
          </Link>
          <Button onClick={handleClose} size="sm" className="text-sm font-semibold px-6 py-2 cursor-pointer">
            {t("common.backToAllPets", "Back to Pets")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {submissionError && (
        <div className="mb-6 bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive font-medium flex items-center gap-2 rounded-xl">
          <span>⚠️ {submissionError}</span>
        </div>
      )}

      <div className="mb-6 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isMs ? "Langkah" : "Step"} {stepIndex + 1} / {stepCount} —{" "}
          <span className="text-foreground">{isMs ? STEP_TITLES[stepId].ms : STEP_TITLES[stepId].en}</span>
        </p>
        <StepRail stepIndex={stepIndex} isMs={isMs} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {stepId === "contact" && (
          <div className="space-y-4">
            <Field
              id="petId"
              label={t("adoptionForm.selectedPetLabel", "Selected Rescue Animal")}
              error={errors.petId?.message}
              className="bg-muted/40 border border-border p-4 rounded-xl"
            >
              {unavailableSelection && (
                <p role="status" className="mb-2 text-sm text-muted-foreground">
                  {isMs
                    ? `${unavailableSelection.name} tidak menerima permohonan adopsi buat masa ini. Sila pilih haiwan lain.`
                    : `${unavailableSelection.name} is not currently accepting adoption applications. Please choose another animal.`}
                </p>
              )}
              {/* Adoptable animals only (`petOptions`), the ones `submitApplication` accepts. The
                  empty option keeps the control and the field agreeing when the form opens on
                  nobody. */}
              <select
                id="petId"
                {...register("petId")}
                onChange={(e) => {
                  const pet = petOptions.find((p: Pet) => p.id === e.target.value);
                  setValue("petId", pet?.id ?? "");
                  setValue("petName", pet?.name ?? "");
                }}
                className={SELECT_CLASS}
              >
                <option value="">
                  {petOptions.length > 0
                    ? isMs
                      ? "Pilih haiwan"
                      : "Choose an animal"
                    : isMs
                      ? "Tiada haiwan menerima permohonan buat masa ini"
                      : "No animals are accepting applications right now"}
                </option>
                {petOptions.map((p: Pet) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.breed} ({p.status} •{" "}
                    {p.adoptionFee.toLowerCase().includes("free")
                      ? isMs
                        ? "Adopsi Percuma"
                        : "Free Adoption"
                      : p.adoptionFee}
                    )
                  </option>
                ))}
              </select>
            </Field>

            <div className={FIELD_ROW_CLASS}>
              <Field
                id="applicantName"
                label={t("adoptionForm.applicantNameLabel", "Full Name (as per IC / Passport) *")}
                error={errors.applicantName?.message}
              >
                <Input
                  id="applicantName"
                  placeholder={t("adoptionForm.applicantNamePlaceholder", "e.g. Nurul Huda binti Ahmad")}
                  className="text-sm sm:text-base py-2.5 rounded-lg"
                  {...register("applicantName")}
                />
              </Field>

              <Field
                id="email"
                label={t("adoptionForm.emailLabel", "Email Address *")}
                error={errors.email?.message}
              >
                <Input
                  id="email"
                  type="email"
                  placeholder="nurul@example.com"
                  className="text-sm sm:text-base py-2.5 rounded-lg"
                  {...register("email")}
                />
              </Field>
            </div>

            <div className={FIELD_ROW_CLASS}>
              <Field
                id="phone"
                label={t("adoptionForm.phoneLabel", "Contact Phone Number (WhatsApp accessible) *")}
                error={errors.phone?.message}
              >
                <Input
                  id="phone"
                  placeholder="012-345 6789"
                  className="text-sm sm:text-base py-2.5 font-mono rounded-lg"
                  {...register("phone")}
                />
              </Field>

              <Field
                id="identification"
                label={t("adoptionForm.identificationLabel", "NRIC or Passport Number *")}
                error={errors.identification?.message}
                hint={t(
                  "adoptionForm.identificationHint",
                  "Used only to verify your identity at handover. Never shown on the public tracking page."
                )}
              >
                <Input
                  id="identification"
                  placeholder="880101-14-5678"
                  autoComplete="off"
                  className="text-sm sm:text-base py-2.5 font-mono rounded-lg"
                  {...register("identification")}
                />
              </Field>
            </div>

            <Field
              id="address"
              label={t("adoptionForm.addressLabel", "Residential Address (State & Postcode) *")}
              error={errors.address?.message}
            >
              <Input
                id="address"
                placeholder={t(
                  "adoptionForm.addressPlaceholder",
                  "e.g. No. 24, Jalan SS 2/10, 47300 Petaling Jaya, Selangor"
                )}
                className="text-sm sm:text-base py-2.5 rounded-lg"
                {...register("address")}
              />
            </Field>
          </div>
        )}

        {stepId === "living" && (
          <div className="space-y-4">
            <div className={FIELD_ROW_CLASS}>
              <Field
                id="housingType"
                label={t("adoptionForm.housingTypeLabel", "Housing & Accommodation Type *")}
                error={errors.housingType?.message}
              >
                <select id="housingType" {...register("housingType")} className={SELECT_CLASS}>
                  {options(HOUSING_TYPE_LABELS, isMs)}
                </select>
              </Field>

              <Field
                id="hasFencedYard"
                label={t("adoptionForm.fencedYardLabel", "Perimeter Fencing & Gate Security *")}
                error={errors.hasFencedYard?.message}
              >
                <select id="hasFencedYard" {...register("hasFencedYard")} className={SELECT_CLASS}>
                  {options(FENCED_YARD_LABELS, isMs)}
                </select>
              </Field>
            </div>

            <Field
              id="landlordApproval"
              label={t("adoptionForm.landlordApprovalLabel", "Landlord Approval *")}
              error={errors.landlordApproval?.message}
              hint={t(
                "adoptionForm.landlordApprovalHint",
                "Tenancy agreements in Malaysia often restrict pets. We ask so nobody has to return an animal later."
              )}
            >
              <select id="landlordApproval" {...register("landlordApproval")} className={SELECT_CLASS}>
                {options(LANDLORD_APPROVAL_LABELS, isMs)}
              </select>
            </Field>
          </div>
        )}

        {stepId === "care" && (
          <div className="space-y-4">
            <div className={FIELD_ROW_CLASS}>
              <Field
                id="currentPets"
                label={t("adoptionForm.currentPetsLabel", "Current Resident Household Pets *")}
                error={errors.currentPets?.message}
              >
                <select id="currentPets" {...register("currentPets")} className={SELECT_CLASS}>
                  {options(CURRENT_PETS_LABELS, isMs)}
                </select>
              </Field>

              <Field
                id="householdExperience"
                label={t("adoptionForm.householdExperienceLabel", "Pet Ownership Experience *")}
                error={errors.householdExperience?.message}
              >
                <select id="householdExperience" {...register("householdExperience")} className={SELECT_CLASS}>
                  {options(EXPERIENCE_LABELS, isMs)}
                </select>
              </Field>
            </div>

            <Field
              id="currentPetDetails"
              label={t(
                "adoptionForm.currentPetDetailsLabel",
                "Resident Pets Details (Breeds, Ages, Neutered Status)"
              )}
              error={errors.currentPetDetails?.message}
            >
              <Input
                id="currentPetDetails"
                placeholder={t(
                  "adoptionForm.currentPetDetailsPlaceholder",
                  "e.g. 1 spayed female local cat (3 yrs), vaccinated."
                )}
                className="text-sm sm:text-base py-2.5 rounded-lg"
                {...register("currentPetDetails")}
              />
            </Field>

            <div className={FIELD_ROW_CLASS}>
              <Field
                id="vetClinic"
                label={t("adoptionForm.vetClinicLabel", "Preferred Veterinary Clinic *")}
                error={errors.vetClinic?.message}
              >
                <Input
                  id="vetClinic"
                  placeholder={t("adoptionForm.vetClinicPlaceholder", "e.g. Klinik Haiwan SS2, Petaling Jaya")}
                  className="text-sm sm:text-base py-2.5 rounded-lg"
                  {...register("vetClinic")}
                />
              </Field>

              <Field
                id="dailyAloneHours"
                label={t("adoptionForm.dailyAloneHoursLabel", "Hours Alone on a Normal Weekday *")}
                error={errors.dailyAloneHours?.message}
              >
                <select id="dailyAloneHours" {...register("dailyAloneHours")} className={SELECT_CLASS}>
                  {options(DAILY_ALONE_HOURS_LABELS, isMs)}
                </select>
              </Field>
            </div>
          </div>
        )}

        {stepId === "agreement" && (
          <div className="space-y-5">
            <Field
              id="applicantNotes"
              label={t("adoptionForm.notesLabel", "Household Daily Routine & Living Notes (Optional)")}
              error={errors.applicantNotes?.message}
            >
              <Textarea
                id="applicantNotes"
                rows={3}
                placeholder={t(
                  "adoptionForm.notesPlaceholder",
                  "Share details about daily schedule, exercise arrangements, and who will look after the pet during work hours..."
                )}
                className="text-sm sm:text-base py-2 rounded-lg"
                {...register("applicantNotes")}
              />
            </Field>

            <div className="border-t border-border pt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="agreeToTerms"
                    {...register("agreeToTerms")}
                    className="mt-1 size-4.5 accent-foreground shrink-0 cursor-pointer"
                  />
                  <label
                    htmlFor="agreeToTerms"
                    className="text-sm text-foreground/90 leading-relaxed cursor-pointer"
                  >
                    {t(
                      "adoptionForm.termsAgreement",
                      "I agree to the Shelter Adoption Terms, confirm all household members consent, and promise never to abandon or commercially breed this animal."
                    )}
                  </label>
                </div>
                {errors.agreeToTerms && (
                  <p className="text-sm font-medium text-destructive">{errors.agreeToTerms.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="agreeToHomeVisit"
                    {...register("agreeToHomeVisit")}
                    className="mt-1 size-4.5 accent-foreground shrink-0 cursor-pointer"
                  />
                  <label
                    htmlFor="agreeToHomeVisit"
                    className="text-sm text-foreground/90 leading-relaxed cursor-pointer"
                  >
                    {t(
                      "adoptionForm.homeVisitAgreement",
                      "I consent to a pre-adoption home check and a follow-up visit by a shelter volunteer."
                    )}
                  </label>
                </div>
                {errors.agreeToHomeVisit && (
                  <p className="text-sm font-medium text-destructive">{errors.agreeToHomeVisit.message}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-border pt-5 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto">
            {isFirstStep ? (
              !standalone && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="w-full sm:w-auto text-sm font-semibold px-5 py-2.5 cursor-pointer"
                >
                  {t("common.close", "Cancel")}
                </Button>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={goToPreviousStep}
                className="w-full sm:w-auto text-sm font-semibold px-5 py-2.5 cursor-pointer"
              >
                <ArrowLeft className="size-4 mr-1.5" />
                {t("common.back", "Back")}
              </Button>
            )}
          </div>

          {isLastStep ? (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto text-sm font-semibold px-7 py-2.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4.5 animate-spin mr-1.5" />
                  {t("common.submitting", "Submitting...")}
                </>
              ) : (
                t("adoptionForm.submitButton", "Submit 100% Free Adoption Application")
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goToNextStep}
              className="w-full sm:w-auto text-sm font-semibold px-7 py-2.5 cursor-pointer"
            >
              {t("common.next", "Next")}
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
