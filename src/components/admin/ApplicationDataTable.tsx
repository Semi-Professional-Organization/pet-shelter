"use client";

import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { AdoptionApplicationRecord, ApplicationStatus } from "@/types/application";
import { ApplicationDetailDialog } from "@/components/admin/ApplicationDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  XCircle,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { useApplicationTableController } from "@/hooks/useApplicationTableController";
import {
  APPLICATION_STATUS_SEQUENCE,
  buildApplicationStatusFilterOptions,
  getApplicationStatusPresentation,
} from "@/lib/presentation/applicationStatusPresentation";
import { ApplicationStatusIcon } from "@/components/admin/ApplicationStatusIcon";

export function ApplicationDataTable({
  initialApplications,
  canReview,
  canDelete,
}: {
  initialApplications?: AdoptionApplicationRecord[];
  /** REVIEW_APPLICATIONS: change a status, record a decision, schedule a meet and greet. */
  canReview: boolean;
  /** DELETE_APPLICATIONS: remove a record. */
  canDelete: boolean;
}) {
  const { state, handlers } = useApplicationTableController(initialApplications);
  const {
    applications,
    filteredData,
    globalFilter,
    statusFilter,
    sorting,
    activeAppForDetail,
    isDetailOpen,
    deleteCandidate,
    statusError,
  } = state;
  const {
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
  } = handlers;

  const columns = useMemo<ColumnDef<AdoptionApplicationRecord>[]>(
    () => [
      {
        accessorKey: "applicantName",
        header: "Applicant",
        cell: ({ row }) => {
          const app = row.original;
          return (
            <div>
              <p className="font-heading text-base font-bold text-foreground">{app.applicantName}</p>
              <p className="text-xs text-muted-foreground">{app.email}</p>
              <p className="text-xs font-mono text-muted-foreground">{app.phone}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "petName",
        header: "Animal Requested",
        cell: ({ row }) => (
          <div>
            <span className="font-heading text-sm font-bold text-foreground">
              {row.original.petName}
            </span>
            {row.original.petBreed && (
              <p className="text-xs text-muted-foreground">{row.original.petBreed}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "housingType",
        header: "Housing & Yard",
        cell: ({ row }) => {
          const app = row.original;
          return (
            <div className="text-xs text-foreground capitalize">
              <p className="font-semibold">{app.housingType.replace("_", " ")}</p>
              <p className="text-muted-foreground">Fenced: {app.hasFencedYard}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Applied Date",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground font-medium">
            {row.original.createdAt}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = getApplicationStatusPresentation(row.original.status);

          return (
            <span className={status.chipClass}>
              <ApplicationStatusIcon tone={status.tone} className="size-3" />
              {status.label}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Review Actions",
        cell: ({ row }) => {
          const app = row.original;
          return (
            <div className="flex items-center gap-1.5 justify-end">
              {canReview && (
                <select
                  value={app.status}
                  onChange={(e) => handleQuickStatus(app.id, e.target.value as ApplicationStatus)}
                  className="bg-background border border-input text-xs font-medium px-2 py-1 focus:ring-1 focus:ring-foreground"
                  aria-label={`Change status for application from ${app.applicantName}`}
                >
                  {APPLICATION_STATUS_SEQUENCE.map((status) => (
                    <option key={status} value={status}>
                      {getApplicationStatusPresentation(status).label}
                    </option>
                  ))}
                </select>
              )}

              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setActiveAppForDetail(app);
                  setIsDetailOpen(true);
                }}
                className="text-xs font-medium gap-1"
                title="View full questionnaire"
              >
                <Eye className="size-3" /> View
              </Button>

              {canDelete && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setDeleteCandidate(app)}
                  className="text-xs text-destructive hover:text-destructive"
                  title="Archive / Delete application"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [canReview, canDelete, handleQuickStatus, setActiveAppForDetail, setIsDetailOpen, setDeleteCandidate]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 8 },
    },
  });

  return (
    <div className="space-y-6">
      {statusError && (
        <div className="bg-destructive/10 border border-destructive/30 p-3.5 text-xs text-destructive flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 shrink-0" />
            <span>{statusError}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={() => setStatusError(null)} className="text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="border border-border bg-card p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        
        {/* Search & Status Filter */}
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search applicant or pet..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 text-xs sm:text-sm py-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-app-status" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Status:
            </label>
            <select
              id="filter-app-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-input text-xs font-semibold px-3 py-2 text-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="all">All Applications ({applications.length})</option>
              {buildApplicationStatusFilterOptions(applications).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </div>

          {(globalFilter || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setGlobalFilter("");
                setStatusFilter("all");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3 mr-1" /> Reset
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={handleExportCsv}
            title="Export filtered records to RFC-4180 CSV"
            className="text-xs font-semibold gap-1 text-foreground"
          >
            <Download className="size-3" /> Export CSV ({filteredData.length})
          </Button>
          {/* No "Reset Sample Data" here. It rewrote the browser's copy of the board,
              which the board no longer shows (the page always passes the server's
              applications), so it changed nothing anyone could see. */}
        </div>
      </div>

      {/* TanStack Table Container */}
      <div className="border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="border-b border-border bg-muted/40 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="p-3.5 sm:p-4">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/60">
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-3.5 sm:p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                    <SlidersHorizontal className="size-6 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No adoption applications found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="border-t border-border p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground bg-background">
          <div>
            Showing <strong className="text-foreground">{table.getRowModel().rows.length}</strong> of{" "}
            <strong className="text-foreground">{filteredData.length}</strong> applications
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="text-xs"
            >
              <ChevronLeft className="size-3.5 mr-0.5" /> Previous
            </Button>
            <span className="font-mono px-2">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="text-xs"
            >
              Next <ChevronRight className="size-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Review Dialog */}
      <ApplicationDetailDialog
        application={activeAppForDetail}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdateStatus={handleUpdateStatusWithNotes}
        canReview={canReview}
      />

      {/* Delete / Archive Confirmation */}
      <Dialog open={!!deleteCandidate} onOpenChange={(o) => !o && setDeleteCandidate(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">
              Delete Adoption Application
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Are you sure you want to remove the application for <strong>{deleteCandidate?.petName}</strong> submitted by <strong>{deleteCandidate?.applicantName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteCandidate(null)} className="text-xs">
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} className="text-xs font-semibold">
              Yes, Remove Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
