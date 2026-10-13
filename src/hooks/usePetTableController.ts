"use client";

import { useState, useMemo } from "react";
import { Pet } from "@/types/pet";
import { PetFormInput } from "@/lib/validations/pet";
import type { PhotoNotificationOptions } from "@/actions/pets";
import { usePetStore } from "@/lib/client/petStore";
import { matchesAdminPetFilters, scopeByArchiveFilter } from "@/lib/presentation/adminPetFilters";
import { buildPetStatusFilterOptions } from "@/lib/presentation/petStatusPresentation";
import { exportPetsToCsv } from "@/lib/presentation/exportCsv";
import {
  createPet as serverCreatePet,
  updatePet as serverUpdatePet,
  toggleArchivePet as serverToggleArchivePet,
  updatePetStatus as serverUpdatePetStatus,
} from "@/actions/pets";
import { SortingState } from "@tanstack/react-table";

export function usePetTableController(initialPets?: (Pet & { applicationCount?: number })[]) {
  const {
    pets: storePets,
    addPet,
    updatePet,
    updatePetStatus,
    replacePet,
    deletePet,
    toggleArchivePet,
    resetToDefaultPets,
  } = usePetStore();

  const [localPets, setLocalPets] = useState<(Pet & { applicationCount?: number })[] | null>(null);
  const pets = localPets || initialPets || storePets;

  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [speciesFilter, setSpeciesFilter] = useState<string>("all");
  const [archiveFilter, setArchiveFilter] = useState<string>("active"); // "all" | "active" | "archived"
  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Modals & Selection
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<{ pet: Pet; archive: boolean } | null>(null);

  // Archive scope is resolved once and reused: the visible rows, the status counts and
  // the "All Statuses" total all read from it, and typing in the search box no longer
  // re-runs the archive pass.
  const archiveScopedPets = useMemo(
    () => scopeByArchiveFilter(pets, archiveFilter),
    [pets, archiveFilter]
  );

  // The row predicate lives in `@/lib/adminPetFilters` so it can be exercised in the node
  // test tier; this hook is only its React binding.
  const filteredData = useMemo(
    () =>
      archiveScopedPets.filter((pet) =>
        matchesAdminPetFilters(pet, { globalFilter, statusFilter, speciesFilter })
      ),
    [archiveScopedPets, statusFilter, speciesFilter, globalFilter]
  );

  // Counts over that same scope rather than a hardcoded "active", so every option total
  // and the header total describe one population — the reconciliation staff actually
  // perform against the table.
  const statusFilterOptions = useMemo(
    () => buildPetStatusFilterOptions(archiveScopedPets),
    [archiveScopedPets]
  );

  // The archive select's own three counts, resolved in one pass rather than three inline
  // scans per render in the toolbar.
  const archiveCounts = useMemo(() => {
    const archived = pets.filter((pet) => pet.isArchived).length;
    return { active: pets.length - archived, archived, all: pets.length };
  }, [pets]);

  const handleOpenCreate = () => {
    setEditingPet(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (pet: Pet) => {
    setEditingPet(pet);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (
    data: PetFormInput,
    notification?: PhotoNotificationOptions
  ) => {
    setStatusError(null);
    if (editingPet) {
      const prevPet = pets.find((p) => p.id === editingPet.id);
      updatePet(editingPet.id, data);
      setLocalPets((prev) => {
        const base = prev || pets;
        return base.map((p) => (p.id === editingPet.id ? { ...p, ...data } : p));
      });

      const rollback = (errorMessage: string) => {
        if (prevPet) {
          replacePet(prevPet);
          setLocalPets((prev) => {
            const base = prev || pets;
            return base.map((p) => (p.id === prevPet.id ? prevPet : p));
          });
        }
        setStatusError(errorMessage);
      };

      serverUpdatePet(editingPet.id, data, notification)
        .then((res) => {
          if (res && !res.success) {
            rollback(res.error || "Failed to update pet.");
          }
        })
        .catch((err) => {
          console.warn("Background server update sync:", err);
          rollback(err instanceof Error ? err.message : "Network error updating pet.");
        });
    } else {
      const created = addPet(data);
      setLocalPets((prev) => [created, ...(prev || pets)]);

      const rollback = (errorMessage: string) => {
        deletePet(created.id);
        setLocalPets((prev) => (prev ? prev.filter((p) => p.id !== created.id) : null));
        setStatusError(errorMessage);
      };

      serverCreatePet(data)
        .then((res) => {
          if (res && !res.success) {
            rollback(res.error || "Failed to create pet.");
          }
        })
        .catch((err) => {
          console.warn("Background server create sync:", err);
          rollback(err instanceof Error ? err.message : "Network error creating pet.");
        });
    }
    setIsFormOpen(false);
    setEditingPet(null);
  };

  const handleConfirmArchive = () => {
    if (archiveCandidate) {
      setStatusError(null);
      const { pet, archive } = archiveCandidate;
      const prevPet = pets.find((p) => p.id === pet.id);

      toggleArchivePet(pet.id, archive);
      setLocalPets((prev) => {
        const base = prev || pets;
        return base.map((p) =>
          p.id === pet.id ? { ...p, isArchived: archive, deletedAt: archive ? new Date().toISOString() : null } : p
        );
      });

      const rollback = (errorMessage: string) => {
        if (prevPet) {
          replacePet(prevPet);
          setLocalPets((prev) => {
            const base = prev || pets;
            return base.map((p) => (p.id === prevPet.id ? prevPet : p));
          });
        }
        setStatusError(errorMessage);
      };

      serverToggleArchivePet(pet.id, archive)
        .then((res) => {
          if (res && !res.success) {
            rollback(res.error || "Failed to update archive status.");
          }
        })
        .catch((err) => {
          console.warn("Background server archive sync:", err);
          rollback(err instanceof Error ? err.message : "Network error updating archive status.");
        });
      setArchiveCandidate(null);
    }
  };

  const handleStatusChange = (id: string, newStatus: Pet["status"]) => {
    setStatusError(null);
    const prevPet = pets.find((p) => p.id === id);

    updatePetStatus(id, newStatus);
    setLocalPets((prev) => {
      const base = prev || pets;
      return base.map((p) => (p.id === id ? { ...p, status: newStatus } : p));
    });

    const rollback = (errorMessage: string) => {
      if (prevPet) {
        replacePet(prevPet);
        setLocalPets((prev) => {
          const base = prev || pets;
          return base.map((p) => (p.id === id ? prevPet : p));
        });
      }
      setStatusError(errorMessage);
    };

    serverUpdatePetStatus(id, newStatus)
      .then((res) => {
        if (res && !res.success) {
          rollback(res.error || "Failed to update pet status.");
        }
      })
      .catch((err) => {
        console.warn("Background server status sync:", err);
        rollback(err instanceof Error ? err.message : "Network error updating pet status.");
      });
  };

  const handleExportCsv = () => {
    exportPetsToCsv(filteredData);
  };

  return {
    state: {
      pets,
      filteredData,
      globalFilter,
      statusFilter,
      speciesFilter,
      archiveFilter,
      statusFilterOptions,
      statusFilterTotal: archiveScopedPets.length,
      archiveCounts,
      sorting,
      isFormOpen,
      editingPet,
      archiveCandidate,
      statusError,
    },
    handlers: {
      setGlobalFilter,
      setStatusFilter,
      setSpeciesFilter,
      setArchiveFilter,
      setSorting,
      setIsFormOpen,
      setEditingPet,
      setArchiveCandidate,
      setStatusError,
      handleOpenCreate,
      handleOpenEdit,
      handleFormSubmit,
      handleConfirmArchive,
      handleStatusChange,
      handleExportCsv,
      resetToDefaultPets,
    },
  };
}
