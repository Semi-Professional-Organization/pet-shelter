"use client";

import { useState, useEffect, useEffectEvent, useCallback } from "react";
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

function isAdoptable(pet: Pet): boolean {
  return getPetStatusPresentation(pet.status).isAdoptable;
}

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
 * A selected animal is returned even when it is not adoptable, so the title names the page that
 * opened the form. The form's pet *field* does not follow it there: see `fieldPetFor`.
 */
export function resolveDefaultPet(selectedPet: Pet | null, allPets: Pet[]): Pet | null {
  return selectedPet || allPets.find(isAdoptable) || null;
}

/**
 * The animal the pet field holds when the form opens: the default animal if it can be applied
 * for, otherwise nobody. The select offers adoptable animals only, so a non-adoptable default in
 * the field would leave the value and the control disagreeing.
 */
function fieldPetFor(defaultPet: Pet | null): Pet | null {
  return defaultPet && isAdoptable(defaultPet) ? defaultPet : null;
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
  // means.
  const availablePets = allPets.filter(isAdoptable);
  const defaultPet = resolveDefaultPet(selectedPet, allPets);
  const fieldPet = fieldPetFor(defaultPet);
  // What `AdoptionWizard`'s pet `<select>` offers: the adoptable animals, plus the field's own
  // animal when a caller passed one that `allPets` does not list, so the control can always show
  // the value the field holds.
  const petOptions =
    fieldPet && !availablePets.some((p) => p.id === fieldPet.id)
      ? [fieldPet, ...availablePets]
      : availablePets;
  // Opened from an animal that cannot be applied for (`/adopt?petId=` names any public animal):
  // the wizard says so at the point of choice instead of at the end of four steps.
  const unavailableSelection = selectedPet && !isAdoptable(selectedPet) ? selectedPet : null;

  const form = useForm<AdoptionFormValues>({
    resolver: zodResolver(adoptionFormSchema),
    // Surface a step's errors as the applicant corrects them, rather than only
    // when they press Next a second time.
    mode: "onTouched",
    defaultValues: {
      petId: fieldPet?.id || "",
      petName: fieldPet?.name || "",
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

  // Every opening sets the pet field from the animal the title names, including nobody. It used to
  // run only when handed a real pet, so an opening with `selectedPet = null` kept whatever the
  // previous one left (the dialog resets on a 200ms timer after close, and only after a
  // submission) and the form could name one animal while submitting for another. Only the pet
  // fields are touched, so the applicant's other answers survive a reopen.
  //
  // Keyed on the opening (and an explicit change of `selectedPet`), not on `fieldPet`: a refresh
  // of `allPets` while the form is open must not overwrite an animal the applicant picked.
  const applyFieldPet = useEffectEvent(() => {
    setValue("petId", fieldPet?.id ?? "");
    setValue("petName", fieldPet?.name ?? "");
  });
  const selectedPetId = selectedPet?.id;
  useEffect(() => {
    if (open) applyFieldPet();
  }, [open, selectedPetId]);

  const activePetId = useWatch({ control, name: "petId" }) || fieldPet?.id;
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

    let written: Awaited<ReturnType<typeof submitApplication>>["data"];
    try {
      const res = await submitApplication(input);

      if (!res.success) {
        setSubmissionError(res.error || "Failed to submit adoption application. Please try again.");
        return;
      }
      written = res.data;
      setReferenceCode(written?.referenceCode ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection error while submitting application.";
      setSubmissionError(msg);
      return;
    }

    // The animal the server verified and recorded, not the one posted: they differ when the posted
    // id carried whitespace or staff renamed the animal since the page rendered, and the
    // reference code points at the written record.
    const recordedPet = {
      petId: written?.petId ?? input.petId,
      petName: written?.petName ?? input.petName,
    };
    addApplication({ ...input, ...recordedPet });
    setSubmittedData({ ...data, ...recordedPet });
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
      petOptions,
      defaultPet,
      unavailableSelection,
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
