"use client";

import { useState, useMemo } from "react";
import { SortingState } from "@tanstack/react-table";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import { exportApplicationsToCsv } from "@/lib/presentation/exportCsv";
import {
  updateApplicationStatus as serverUpdateStatus,
  deleteApplication as serverDeleteApplication,
} from "@/actions/applications";

/**
 * State and handlers for the applications board, over the server's applications.
 *
 * Decisions go straight to the server, which enforces the status state machine and the
 * reviewer's permission. They used to be checked against the browser's application store
 * first, which holds only the three bundled samples and what this browser created, so for
 * every real application the check answered "Application not found" and the server was
 * never asked: no role, Super Admin included, could record a decision on one. The board no
 * longer reads that store at all: given no server list, it used to show the samples as
 * though they were the shelter's applicants.
 */
export function useApplicationTableController(initialApplications: AdoptionApplicationRecord[]) {
  const [localApplications, setLocalApplications] = useState<AdoptionApplicationRecord[] | null>(null);
  const applications = localApplications || initialApplications;

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
  };

  /**
   * The decision dialog's save. Applied on screen at once, but the answer is the
   * server's: the dialog waits for it, so a refused transition is reported where it was
   * made rather than after the dialog has said it worked.
   */
  const handleUpdateStatusWithNotes = async (
    id: string,
    status: ApplicationStatus,
    notes: string,
    notifyApplicant = true
  ): Promise<{ success: boolean; error?: string }> => {
    setStatusError(null);
    const prevApplications = applications;
    setLocalApplications((prev) =>
      (prev || applications).map((app) =>
        app.id === id ? { ...app, status, adminReviewNotes: notes } : app
      )
    );
    try {
      const serverRes = await serverUpdateStatus({ id, status, adminReviewNotes: notes, notifyApplicant });
      if (serverRes && !serverRes.success) {
        setLocalApplications(prevApplications);
        return { success: false, error: serverRes.error || "Failed to update application status." };
      }
      return { success: true };
    } catch (err) {
      console.warn("Background server update sync:", err);
      setLocalApplications(prevApplications);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to update application status.",
      };
    }
  };

  /**
   * Shows on the board the status and notes `scheduleApplicationInterview` wrote. Not a
   * write of its own: the dialog used to follow a schedule with a status save, which
   * replaced the meeting's notes, sent a second email and reopened decided applications.
   */
  const handleInterviewScheduled = (
    id: string,
    written: { status: ApplicationStatus; adminReviewNotes: string }
  ) => {
    setLocalApplications((prev) =>
      (prev || applications).map((app) => (app.id === id ? { ...app, ...written } : app))
    );
  };

  const confirmDelete = async () => {
    if (deleteCandidate) {
      setStatusError(null);
      const candidateId = deleteCandidate.id;
      const prevApplications = applications;

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
      handleInterviewScheduled,
      confirmDelete,
      handleExportCsv,
    },
  };
}
