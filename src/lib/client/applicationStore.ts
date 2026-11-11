"use client";

import { useState, useEffect, useCallback } from "react";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import initialApplicationsData from "@/data/applications.json";
import { ApplicationFormInput } from "@/lib/validations/application";
import { validateApplicationTransition } from "@/lib/domain/stateMachine";

const STORAGE_KEY = "hope_for_strays_applications_v1";

export function useApplicationStore() {
  const [applications, setApplications] = useState<AdoptionApplicationRecord[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.error("Failed to load applications from storage", e);
      }
    }
    return initialApplicationsData as AdoptionApplicationRecord[];
  });

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setApplications(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoaded(true);
  }, []);

  const saveApplications = useCallback((newApps: AdoptionApplicationRecord[]) => {
    setApplications(newApps);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newApps));
      } catch (e) {
        console.error("Failed to persist applications to storage", e);
      }
    }
  }, []);

  const addApplication = useCallback(
    (input: ApplicationFormInput): AdoptionApplicationRecord => {
      const today = new Date().toISOString().split("T")[0];
      const newApp: AdoptionApplicationRecord = {
        // A local id, deliberately not the server's: the tracking portal accepts an application
        // id with its email, so storing both here would turn this localStorage copy into a
        // credential on a shared device. Random rather than `Date.now()` (#201), and from
        // `getRandomValues` rather than `randomUUID`, which is undefined outside a secure context
        // (plain-HTTP LAN hosts) and would throw after the application was already saved.
        id: `app-local-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("")}`,
        petId: input.petId,
        petName: input.petName,
        applicantName: input.applicantName,
        email: input.email,
        phone: input.phone,
        address: input.address,
        housingType: input.housingType,
        hasFencedYard: input.hasFencedYard,
        currentPets: input.currentPets,
        currentPetDetails: input.currentPetDetails,
        householdExperience: input.householdExperience,
        applicantNotes: input.applicantNotes,
        status: "SUBMITTED",
        adminReviewNotes: "",
        createdAt: today,
        updatedAt: today,
      };

      const updated = [newApp, ...applications];
      saveApplications(updated);
      return newApp;
    },
    [applications, saveApplications]
  );

  const updateApplicationStatus = useCallback(
    (id: string, status: ApplicationStatus, notes?: string): { success: boolean; error?: string } => {
      const index = applications.findIndex((a) => a.id === id);
      if (index === -1) return { success: false, error: "Application not found" };

      const current = applications[index];

      // Enforce Finite State Machine rules
      try {
        validateApplicationTransition(current.status, status);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid state transition";
        return { success: false, error: msg };
      }

      const today = new Date().toISOString().split("T")[0];
      let updated = [...applications];

      // If approved, automatically close other applications for the same pet
      if (status === "APPROVED") {
        updated = updated.map((other) => {
          if (
            other.id !== id &&
            (other.petId === current.petId || other.petName.toLowerCase() === current.petName.toLowerCase()) &&
            (other.status === "SUBMITTED" || other.status === "UNDER_REVIEW")
          ) {
            return {
              ...other,
              status: "REJECTED" as ApplicationStatus,
              adminReviewNotes: `Auto-closed: ${current.petName} was adopted on ${today}.`,
              updatedAt: today,
            };
          }
          return other;
        });
      }

      const targetIdx = updated.findIndex((a) => a.id === id);
      if (targetIdx !== -1) {
        updated[targetIdx] = {
          ...updated[targetIdx],
          status,
          adminReviewNotes: notes !== undefined ? notes : updated[targetIdx].adminReviewNotes,
          updatedAt: today,
        };
      }

      saveApplications(updated);
      return { success: true };
    },
    [applications, saveApplications]
  );

  const deleteApplication = useCallback(
    (id: string): boolean => {
      const updated = applications.filter((a) => a.id !== id);
      saveApplications(updated);
      return true;
    },
    [applications, saveApplications]
  );

  const resetToDefaultApplications = useCallback(() => {
    saveApplications(initialApplicationsData as AdoptionApplicationRecord[]);
  }, [saveApplications]);

  return {
    applications,
    isLoaded,
    addApplication,
    updateApplicationStatus,
    deleteApplication,
    resetToDefaultApplications,
  };
}
