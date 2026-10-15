"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchAuditLogsAction } from "@/actions/audit";
import { fetchDonationReceiptsAction } from "@/actions/donations";
import { AuditEntry } from "@/lib/domain/auditLog";
import { isReceiptAuditRow } from "@/lib/domain/receiptAuditRow";
import { exportReceiptsToCsv, exportAuditLogsToCsv } from "@/lib/presentation/exportCsv";

export type AuditTabFilter = "all" | "receipts" | "adoptions" | "system";

export function useAuditLogController() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<AuditTabFilter>("all");
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchAuditLogsAction(250);
      if (res.success && res.data) {
        setLogs(res.data);
      } else {
        setError(res.error || "Failed to load audit logs");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading audit records";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await fetchAuditLogsAction(250);
        if (!ignore) {
          if (res.success && res.data) {
            setLogs(res.data);
          } else {
            setError(res.error || "Failed to load audit logs");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : "Error loading audit records";
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const receiptLogs = useMemo(() => {
    return logs.filter(isReceiptAuditRow);
  }, [logs]);

  const adoptionLogs = useMemo(() => {
    return logs.filter(
      (log) =>
        log.entity === "AdoptionApplication" ||
        log.action.includes("APPLICATION") ||
        log.entity === "Pet"
    );
  }, [logs]);

  const systemLogs = useMemo(() => {
    return logs.filter(
      (log) =>
        log.entity === "ShelterSettings" ||
        log.entity === "Auth" ||
        log.action.includes("AUTH") ||
        log.action.includes("SETTING")
    );
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let base = logs;

    if (activeTab === "receipts") {
      base = receiptLogs;
    } else if (activeTab === "adoptions") {
      base = adoptionLogs;
    } else if (activeTab === "system") {
      base = systemLogs;
    }

    if (!filter.trim()) return base;
    const q = filter.toLowerCase();

    return base.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.entity.toLowerCase().includes(q) ||
        (log.entityId && log.entityId.toLowerCase().includes(q)) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(q))
    );
  }, [logs, activeTab, receiptLogs, adoptionLogs, systemLogs, filter]);

  /**
   * The LHDN export reads the donation ledger, not the audit trail.
   *
   * Three ways this export can be incomplete, and all three are announced rather
   * than absorbed. Silence is the defect being fixed here; a wrong number was
   * only ever the symptom.
   *
   *  1. **The ledger is younger than the shelter.** The `Donation` model landed
   *     2026-08-29 and nothing backfilled it, so a receipt issued before then
   *     exists only in `AuditLog`. `receiptLogs` is a lower bound on how many the
   *     audit window knows about; when it exceeds what the ledger returned, this
   *     file is missing older receipts. The comparison can only under-warn — the
   *     audit window is itself capped — never raise a false alarm.
   *  2. **The export caps.** Truncation drops the OLDEST rows, because the ledger
   *     reads `issuedAt desc`. That is the wrong end for an annual return.
   *  3. **The ledger read failed.** It now throws rather than returning `[]`, so
   *     a refusal or outage cannot arrive disguised as "no donations". A request
   *     the server refused does not end in a downloaded tax document.
   */
  const handleExportReceiptsCsv = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportNotice(null);

    try {
      const res = await fetchDonationReceiptsAction();

      if (!res.success || !res.data) {
        setExportNotice(
          `Could not read the donation ledger: ${res.error ?? "unknown error"}. Nothing was exported.`
        );
        return;
      }

      const ledger = res.data;
      const auditKnown = receiptLogs.length;

      if (ledger.length === 0) {
        if (auditKnown === 0) {
          setExportNotice("No donation receipt records found to export.");
          setTimeout(() => setExportNotice(null), 4000);
          return;
        }
        exportReceiptsToCsv(receiptLogs);
        setExportNotice(
          `The donation ledger holds no receipts, so ${auditKnown} record(s) were exported from ` +
            `the audit trail instead. That source is a filter over the 250 most recent audit ` +
            `entries of any kind and may be missing older receipts. Verify before filing.`
        );
        return;
      }

      exportReceiptsToCsv(ledger);

      if (auditKnown > ledger.length) {
        setExportNotice(
          `Exported ${ledger.length} receipt(s) from the ledger, but the audit trail shows ` +
            `${auditKnown}. Receipts issued before the ledger existed are not in this file. ` +
            `Do not file it as a complete return.`
        );
        return;
      }

      if (res.truncated) {
        setExportNotice(
          `Exported the ${ledger.length} most recent receipt(s); the ledger holds more. ` +
            `Truncation drops the OLDEST receipts, which is the wrong end for an annual return. ` +
            `Do not file this as a complete return.`
        );
        return;
      }

      setExportNotice(
        `Exported ${ledger.length} donation receipt(s) from the donation ledger for LHDN reporting.`
      );
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setExportNotice(`Export failed: ${msg}. Nothing was downloaded.`);
    } finally {
      setIsExporting(false);
    }
  }, [receiptLogs, isExporting]);

  const handleExportAuditTrailCsv = useCallback(() => {
    setExportNotice(null);
    const targetLogs = filteredLogs.length > 0 ? filteredLogs : logs;
    if (targetLogs.length === 0) {
      setExportNotice("No audit log records available to export.");
      setTimeout(() => setExportNotice(null), 4000);
      return;
    }
    exportAuditLogsToCsv(targetLogs);
    setExportNotice(`Exported ${targetLogs.length} audit log record(s) to CSV.`);
    setTimeout(() => setExportNotice(null), 4000);
  }, [filteredLogs, logs]);

  return {
    state: {
      logs,
      filteredLogs,
      activeTab,
      counts: {
        all: logs.length,
        receipts: receiptLogs.length,
        adoptions: adoptionLogs.length,
        system: systemLogs.length,
      },
      receiptLogsCount: receiptLogs.length,
      isLoading,
      error,
      filter,
      exportNotice,
      isExporting,
    },
    handlers: {
      setFilter,
      setActiveTab,
      loadLogs,
      handleExportReceiptsCsv,
      handleExportAuditTrailCsv,
      setExportNotice,
    },
  };
}
