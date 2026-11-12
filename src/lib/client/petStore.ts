"use client";

import { useState, useEffect, useCallback } from "react";
import { Pet } from "@/types/pet";
import initialPetsData from "@/data/pets.json";
import { withDerivedAge } from "@/lib/domain/petAge";
import type { PetFormInput } from "@/lib/validations/pet";
import { buildNewPet, mergePetEdit } from "@/lib/domain/petEdit";

const STORAGE_KEY = "hope_for_strays_pets_v1";

export function usePetStore() {
  const [pets, setPets] = useState<Pet[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          // A browser's saved copy is older than the fixture and rots the same way (PS-114).
          return (JSON.parse(saved) as Pet[]).map((pet) => withDerivedAge(pet));
        }
      } catch (e) {
        console.error("Failed to load pets from storage", e);
      }
    }
    return (initialPetsData as Pet[]).map((pet) => withDerivedAge(pet));
  });

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPets(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoaded(true);
  }, []);

  const savePets = useCallback((newPets: Pet[]) => {
    setPets(newPets);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPets));
      } catch (e) {
        console.error("Failed to persist pets to storage", e);
      }
    }
  }, []);

  const addPet = useCallback(
    (input: PetFormInput): Pet => {
      // The same builder `createPet` uses, so a new record gets the same defaults and keeps its
      // gallery and QR on both sides (#212).
      const newPet = buildNewPet(`pet-${Date.now()}`, input);
      const updated = [newPet, ...pets];
      savePets(updated);
      return newPet;
    },
    [pets, savePets]
  );

  const updatePet = useCallback(
    (id: string, input: PetFormInput): Pet | null => {
      const index = pets.findIndex((p) => p.id === id);
      if (index === -1) return null;

      // The server action's merge, not a copy of it: an absent key keeps the stored value, and a
      // submitted gallery or QR replaces it (#212).
      const updatedPet = mergePetEdit(pets[index], input);

      const updated = [...pets];
      updated[index] = updatedPet;
      savePets(updated);
      return updatedPet;
    },
    [pets, savePets]
  );

  const updatePetStatus = useCallback(
    (id: string, status: Pet["status"]): boolean => {
      const index = pets.findIndex((p) => p.id === id);
      if (index === -1) return false;

      const updated = [...pets];
      updated[index] = { ...updated[index], status };
      savePets(updated);
      return true;
    },
    [pets, savePets]
  );

  const deletePet = useCallback(
    (id: string): boolean => {
      const updated = pets.filter((p) => p.id !== id);
      savePets(updated);
      return true;
    },
    [pets, savePets]
  );

  const toggleArchivePet = useCallback(
    (id: string, isArchived: boolean): boolean => {
      const index = pets.findIndex((p) => p.id === id);
      if (index === -1) return false;

      const updated = [...pets];
      updated[index] = {
        ...updated[index],
        isArchived,
        deletedAt: isArchived ? new Date().toISOString() : null,
      };
      savePets(updated);
      return true;
    },
    [pets, savePets]
  );

  const replacePet = useCallback(
    (pet: Pet): boolean => {
      const index = pets.findIndex((p) => p.id === pet.id);
      if (index === -1) return false;

      const updated = [...pets];
      updated[index] = pet;
      savePets(updated);
      return true;
    },
    [pets, savePets]
  );

  const resetToDefaultPets = useCallback(() => {
    savePets(initialPetsData as Pet[]);
  }, [savePets]);

  return {
    pets,
    isLoaded,
    addPet,
    updatePet,
    updatePetStatus,
    replacePet,
    deletePet,
    toggleArchivePet,
    resetToDefaultPets,
  };
}
