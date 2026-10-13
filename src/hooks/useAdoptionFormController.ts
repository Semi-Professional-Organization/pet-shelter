"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pet } from "@/types/pet";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { useApplicationStore } from "@/lib/client/applicationStore";
import { submitApplication } from "@/actions/applications";
import {
  adoptionFormSchema,
  toApplicationInput,
  type AdoptionFormValues,
} from "@/lib/validations/application";

export { adoptionFormSchema };
export type { AdoptionFormValues };

/**
 * The wizard, as data.
 *
 * Each step names the fields it owns. That single list drives both what the
 * step renders and what "Next" validates, so a field can never be shown on one
 * step and validated on another. Crucially there is still only ONE Zod schema:
 * per-step validation is `form.trigger(step.fields)`, a partition of the whole
 * contract rather than four schemas that have to be kept summing to it.
 *
 * Adding a field is therefore a two-line change — the schema, and the step that
 * owns it — and TypeScript rejects a name that is not in the schema.
 */
export const ADOPTION_STEPS = [
  {
    id: "contact",
    fields: ["petId", "petName", "applicantName", "email", "phone", "identification", "address"],
  },
  {
    id: "living",
    fields: ["housingType", "hasFencedYard", "landlordApproval"],
  },
  {
    id: "care",
    fields: ["currentPets", "currentPetDetails", "householdExperience", "vetClinic", "dailyAloneHours"],
  },
  {
    id: "agreement",
    fields: ["applicantNotes", "agreeToTerms", "agreeToHomeVisit"],
  },
] as const satisfies readonly {
  id: string;
  fields: readonly (keyof AdoptionFormValues)[];
}[];

export type AdoptionStepId = (typeof ADOPTION_STEPS)[number]["id"];

export const ADOPTION_STEP_COUNT = ADOPTION_STEPS.length;

/**
 * The pet the form opens on. Shared with the dialog wrapper so the title and
 * the form's default selection cannot disagree about which animal this is.
 *
 * `isAdoptable` rather than `status === "Available"`. The two pick the same animal today —
 * `isAdoptable` is true for exactly that one status — but they are different claims, and the
 * gallery's preselect already reads the flag. A new status alias, or a decision that some other
 * status may be applied for, would have split them silently in favour of the raw comparison.
 *
 * No `allPets[0]` last resort. It was taken whatever that animal's status, so a shelter with no
 * adoptable animal opened the form pre-filled for one that cannot be adopted. Returning `null`
 * instead is not a new state for the callers to learn: `allPets` is empty on a cold `/adopt`
 * render and this already returned `null` there, so both consumers — the dialog title in
 * `AdoptionForm` and `defaultPet` in the controller below — have always handled it.
 *
 * ceiling: the form copies a selection into its fields only when it receives a real pet
 * (`if (selectedPet && open)` below). Handed `null` it keeps whatever `petId` the previous
 * opening left, and dropping the last resort makes `null` reachable in one more case — every
 * animal non-adoptable. `submitApplication` is the boundary that now refuses the result; the
 * stale field itself is `tasks/open/adoption-form-keeps-a-stale-pet-id-when-it-opens-on-nobody.md`.
 */
export function resolveDefaultPet(selectedPet: Pet | null, allPets: Pet[]): Pet | null {
  return selectedPet || allPets.find((p) => getPetStatusPresentation(p.status).isAdoptable) || null;
}

export interface UseAdoptionFormControllerProps {
  selectedPet: Pet | null;
  allPets: Pet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function useAdoptionFormController({
  selectedPet,
  allPets,
  open,
  onOpenChange,
}: UseAdoptionFormControllerProps) {
  const { addApplication } = useApplicationStore();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<AdoptionFormValues | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  // Same predicate as `resolveDefaultPet`, so the two cannot disagree about what "adoptable"
  // means. That is the only claim made here: **nothing consumes this list today.** It is returned
  // in `state` and never destructured, and `AdoptionWizard`'s pet `<select>` renders `allPets`,
  // so the form still offers animals the server now refuses — see
  // `tasks/open/the-adoption-form-offers-animals-the-server-will-refuse.md`. Kept rather than
  // deleted because a reviewer calling this dead once cost this file a real defect; see
  // `tasks/lessons/2026-09-16-a-review-calling-code-dead-is-a-claim-to-check-against-its-consumers.md`.
  const availablePets = allPets.filter((p) => getPetStatusPresentation(p.status).isAdoptable);
  const defaultPet = resolveDefaultPet(selectedPet, allPets);

  const form = useForm<AdoptionFormValues>({
    resolver: zodResolver(adoptionFormSchema),
    // Surface a step's errors as the applicant corrects them, rather than only
    // when they press Next a second time.
    mode: "onTouched",
    defaultValues: {
      petId: defaultPet?.id || "",
      petName: defaultPet?.name || "",
      applicantName: "",
      email: "",
      phone: "",
      identification: "",
      address: "",
      housingType: "landed_terrace",
      hasFencedYard: "yes",
      landlordApproval: "owner_occupied",
      currentPets: "none",
      currentPetDetails: "",
      householdExperience: "experienced",
      vetClinic: "",
      dailyAloneHours: "4_to_8",
      applicantNotes: "",
      // Consent is withheld until the applicant gives it. These defaulted to
      // `true`, which pre-accepted the adoption terms on the applicant's behalf.
      agreeToTerms: false,
      agreeToHomeVisit: false,
    },
  });

  const { setValue, control, reset, trigger } = form;

  useEffect(() => {
    if (selectedPet && open) {
      setValue("petId", selectedPet.id);
      setValue("petName", selectedPet.name);
    }
  }, [selectedPet, open, setValue]);

  const activePetId = useWatch({ control, name: "petId" }) || defaultPet?.id;
  const activePet = allPets.find((p) => p.id === activePetId) || selectedPet;

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === ADOPTION_STEPS.length - 1;

  const goToNextStep = useCallback(async (): Promise<boolean> => {
    const valid = await trigger([...ADOPTION_STEPS[stepIndex].fields]);
    if (valid) {
      setStepIndex((i) => Math.min(i + 1, ADOPTION_STEPS.length - 1));
    }
    return valid;
  }, [trigger, stepIndex]);

  const goToPreviousStep = useCallback(() => {
    setSubmissionError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const submit = async (data: AdoptionFormValues) => {
    setSubmissionError(null);
    const input = toApplicationInput(data);

    try {
      const res = await submitApplication(input);

      if (!res.success) {
        setSubmissionError(res.error || "Failed to submit adoption application. Please try again.");
        return;
      }
      setReferenceCode(res.data?.referenceCode ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection error while submitting application.";
      setSubmissionError(msg);
      return;
    }

    addApplication(input);
    setSubmittedData(data);
    setIsSubmitted(true);
  };

  /**
   * The form's only submit handler. On any step but the last it advances
   * instead of submitting, so pressing Enter in a text field moves the wizard
   * forward rather than posting a half-filled application.
   */
  const onSubmit = async (data: AdoptionFormValues) => {
    if (!isLastStep) {
      await goToNextStep();
      return;
    }
    await submit(data);
  };

  const handleClose = () => {
    onOpenChange(false);
    if (isSubmitted) {
      setTimeout(() => {
        setIsSubmitted(false);
        setSubmissionError(null);
        setReferenceCode(null);
        setStepIndex(0);
        reset();
      }, 200);
    } else {
      setSubmissionError(null);
    }
  };

  return {
    state: {
      availablePets,
      defaultPet,
      activePet,
      isSubmitted,
      submittedData,
      submissionError,
      referenceCode,
      stepIndex,
      stepId: ADOPTION_STEPS[stepIndex].id,
      stepCount: ADOPTION_STEPS.length,
      isFirstStep,
      isLastStep,
    },
    form,
    handlers: {
      onSubmit,
      handleClose,
      goToNextStep,
      goToPreviousStep,
      setIsSubmitted,
      setSubmissionError,
    },
  };
}
