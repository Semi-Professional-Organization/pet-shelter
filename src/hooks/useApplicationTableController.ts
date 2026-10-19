"use client";

import { useState, useMemo } from "react";
import { SortingState } from "@tanstack/react-table";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import { useApplicationStore } from "@/lib/client/applicationStore";
import { exportApplicationsToCsv } from "@/lib/presentation/exportCsv";
import {
  updateApplicationStatus as serverUpdateStatus,
  deleteApplication as serverDeleteApplication,
} from "@/actions/applications";

export function useApplicationTableController(initialApplications?: AdoptionApplicationRecord[]) {
  const {
    applications: storeApplications,
    updateApplicationStatus,
    deleteApplication,
  } = useApplicationStore();

  const [localApplications, setLocalApplications] = useState<AdoptionApplicationRecord[] | null>(null);
  const applications = localApplications || initialApplications || storeApplications;

  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([]);

  // Modals & Selection
  const [activeAppForDetail, setActiveAppForDetail] = useState<AdoptionApplicationRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AdoptionApplicationRecord | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    return applications.filter((app) => {
      if (statusFilter !== "all" && app.status !== statusFilter) return false;
      if (globalFilter.trim() !== "") {
        const q = globalFilter.toLowerCase();
        const matchApplicant = app.applicantName.toLowerCase().includes(q);
        const matchPet = app.petName.toLowerCase().includes(q);
        const matchEmail = app.email.toLowerCase().includes(q);
        if (!matchApplicant && !matchPet && !matchEmail) return false;
      }
      return true;
    });
  }, [applications, statusFilter, globalFilter]);

  const handleQuickStatus = (id: string, nextStatus: ApplicationStatus) => {
    setStatusError(null);
    const prevApplications = applications;
    const res = updateApplicationStatus(id, nextStatus);
    if (res && !res.success) {
      setStatusError(res.error || "Failed to update application status.");
    } else {
      setLocalApplications((prev) =>
        (prev || applications).map((app) => (app.id === id ? { ...app, status: nextStatus } : app))
      );
      serverUpdateStatus({ id, status: nextStatus })
        .then((serverRes) => {
          if (serverRes && !serverRes.success) {
            setLocalApplications(prevApplications);
            setStatusError(serverRes.error || "Failed to update application status.");
          }
        })
        .catch((err) => {
          console.warn("Background server action sync:", err);
          setLocalApplications(prevApplications);
          setStatusError(err instanceof Error ? err.message : "Failed to update application status.");
        });
    }
  };

  const handleUpdateStatusWithNotes = (
    id: string,
    status: ApplicationStatus,
    notes: string,
    notifyApplicant = true
  ) => {
    setStatusError(null);
    const prevApplications = applications;
    const res = updateApplicationStatus(id, status, notes);
    if (res && res.success) {
      setLocalApplications((prev) =>
        (prev || applications).map((app) =>
          app.id === id ? { ...app, status, adminReviewNotes: notes } : app
        )
      );
      serverUpdateStatus({ id, status, adminReviewNotes: notes, notifyApplicant })
        .then((serverRes) => {
          if (serverRes && !serverRes.success) {
            setLocalApplications(prevApplications);
            setStatusError(serverRes.error || "Failed to update application status.");
          }
        })
        .catch((err) => {
          console.warn("Background server update sync:", err);
          setLocalApplications(prevApplications);
          setStatusError(err instanceof Error ? err.message : "Failed to update application status.");
        });
    }
    return res;
  };

  const confirmDelete = async () => {
    if (deleteCandidate) {
      setStatusError(null);
      const candidateId = deleteCandidate.id;
      const prevApplications = applications;

      deleteApplication(candidateId);
      setLocalApplications((prev) => (prev || applications).filter((app) => app.id !== candidateId));
      setDeleteCandidate(null);

      try {
        const res = await serverDeleteApplication(candidateId);
        if (res && !res.success) {
          setLocalApplications(prevApplications);
          setStatusError(res.error || "Failed to delete application.");
        }
      } catch (err) {
        setLocalApplications(prevApplications);
        setStatusError(err instanceof Error ? err.message : "Failed to delete application.");
      }
    }
  };

  const handleExportCsv = () => {
    exportApplicationsToCsv(filteredData);
  };

  return {
    state: {
      applications,
      filteredData,
      globalFilter,
      statusFilter,
      sorting,
      activeAppForDetail,
      isDetailOpen,
      deleteCandidate,
      statusError,
    },
    handlers: {
      setGlobalFilter,
      setStatusFilter,
      setSorting,
      setActiveAppForDetail,
      setIsDetailOpen,
      setDeleteCandidate,
      setStatusError,
      handleQuickStatus,
      handleUpdateStatusWithNotes,
      confirmDelete,
      handleExportCsv,
    },
  };
}
