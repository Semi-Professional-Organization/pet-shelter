"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { Pet } from "@/types/pet";
import { PetFormDialog } from "@/components/admin/PetFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Edit2,
  Archive,
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Star,
  FileText,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { usePetTableController } from "@/hooks/usePetTableController";
import { getPetStatusPresentation } from "@/lib/presentation/petStatusPresentation";
import { getAllowedPetStatusTransitions, normalizePetStatus } from "@/lib/domain/stateMachine";
import { PetStatusIcon } from "@/components/features/pets/PetStatusIcon";
import { useLanguage } from "@/components/providers/LanguageProvider";

export function PetDataTable({
  initialPets,
}: {
  initialPets?: (Pet & { applicationCount?: number })[];
} = {}) {
  const { t } = useLanguage();
  const { state, handlers } = usePetTableController(initialPets);
  const {
    filteredData,
    globalFilter,
    statusFilter,
    speciesFilter,
    archiveFilter,
    statusFilterOptions,
    statusFilterTotal,
    archiveCounts,
    sorting,
    isFormOpen,
    editingPet,
    archiveCandidate,
    statusError,
  } = state;
  const {
    setGlobalFilter,
    setStatusFilter,
    setSpeciesFilter,
    setArchiveFilter,
    setSorting,
    setIsFormOpen,
    setArchiveCandidate,
    setStatusError,
    handleOpenCreate,
    handleOpenEdit,
    handleFormSubmit,
    handleConfirmArchive,
    handleStatusChange,
    resetToDefaultPets,
  } = handlers;

  const columns = useMemo<ColumnDef<Pet & { applicationCount?: number }>[]>(
    () => [
      {
        accessorKey: "image",
        header: "Photo",
        cell: ({ row }) => (
          <div className="relative size-12 overflow-hidden border border-border bg-muted shrink-0">
            <Image
              src={row.original.image}
              alt={row.original.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
        ),
      },
      {
        accessorKey: "name",
        header: "Name & Bio",
        cell: ({ row }) => {
          const pet = row.original;
          return (
            <div className="space-y-1 max-w-[200px] sm:max-w-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-sm flex items-center gap-1.5">
                  {pet.name}
                  {pet.featured && (
                    <span title="Featured on homepage">
                      <Star className="size-3.5 fill-warning-accent text-warning-accent inline-block" />
                    </span>
                  )}
                </span>
                <span className="text-2xs font-mono px-1.5 py-0.5 bg-muted text-muted-foreground">
                  {pet.id}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {pet.breed} • {pet.age} • {pet.gender}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "age",
        header: "Age & Gender",
        cell: ({ row }) => (
          <div className="text-xs text-foreground font-medium">
            <p>{row.original.gender}</p>
            <p className="text-muted-foreground">{row.original.age}</p>
          </div>
        ),
      },
      {
        accessorKey: "applications",
        header: "Applications",
        cell: ({ row }) => {
          const count = row.original.applicationCount ?? 0;
          return (
            <span
              className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 border ${
                count > 0
                  ? "bg-primary/10 text-primary-ink border-primary/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              <FileText className="size-3" />
              {count} {count === 1 ? "app" : "apps"}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Adoption Status",
        cell: ({ row }) => {
          const status = getPetStatusPresentation(row.original.status);

          return (
            <div className="flex items-center gap-2">
              <span
                className={status.chipClass}
              >
                <PetStatusIcon tone={status.tone} className="size-3" />
                {t(status.labelKey, status.labelFallback)}
              </span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const pet = row.original;
          return (
            <div className="flex items-center gap-1.5 justify-end">
              {/* Quick Status Dropdown */}
              <select
                value={normalizePetStatus(pet.status)}
                onChange={(e) => handleStatusChange(pet.id, e.target.value as Pet["status"])}
                disabled={pet.isArchived}
                className="bg-background border border-input text-xs font-medium px-2 py-1 focus:ring-1 focus:ring-foreground disabled:opacity-50"
                aria-label={`Change status for ${pet.name}`}
              >
                {getAllowedPetStatusTransitions(pet.status).map((status) => {
                  const { labelKey, labelFallback } = getPetStatusPresentation(status);
                  return (
                    <option key={status} value={status}>
                      {t(labelKey, labelFallback)}
                    </option>
                  );
                })}
              </select>

              <Button
                variant="outline"
                size="xs"
                onClick={() => handleOpenEdit(pet)}
                className="text-xs"
                title="Edit pet details"
              >
                <Edit2 className="size-3 mr-1" /> Edit
              </Button>

              {pet.isArchived ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setArchiveCandidate({ pet, archive: false })}
                  className="text-xs text-primary-ink hover:text-primary-ink"
                  title="Restore pet profile"
                >
                  <RotateCcw className="size-3 mr-1" /> Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setArchiveCandidate({ pet, archive: true })}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  title="Archive pet (soft delete)"
                >
                  <Archive className="size-3 mr-1" /> Archive
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [handleStatusChange, handleOpenEdit, setArchiveCandidate, t]
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
        {/* Search & Filters */}
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter by name or breed..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 text-xs sm:text-sm py-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-pet-status"
              className="text-xs font-semibold text-muted-foreground whitespace-nowrap"
            >
              Status:
            </label>
            <select
              id="filter-pet-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-input text-xs font-semibold px-3 py-2 text-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="all">All Statuses ({statusFilterTotal})</option>
              {statusFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey, option.labelFallback)} ({option.count})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-pet-species"
              className="text-xs font-semibold text-muted-foreground whitespace-nowrap"
            >
              Species:
            </label>
            <select
              id="filter-pet-species"
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
              className="bg-background border border-input text-xs font-semibold px-3 py-2 text-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="all">All Species</option>
              <option value="dog">Dogs</option>
              <option value="cat">Cats</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-pet-archive"
              className="text-xs font-semibold text-muted-foreground whitespace-nowrap"
            >
              Archive:
            </label>
            <select
              id="filter-pet-archive"
              value={archiveFilter}
              onChange={(e) => setArchiveFilter(e.target.value)}
              className="bg-background border border-input text-xs font-semibold px-3 py-2 text-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="active">Active Animals ({archiveCounts.active})</option>
              <option value="archived">Archived ({archiveCounts.archived})</option>
              <option value="all">All Records ({archiveCounts.all})</option>
            </select>
          </div>

          {(globalFilter ||
            statusFilter !== "all" ||
            speciesFilter !== "all" ||
            archiveFilter !== "active") && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setGlobalFilter("");
                setStatusFilter("all");
                setSpeciesFilter("all");
                setArchiveFilter("active");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3 mr-1" /> Reset
            </Button>
          )}
        </div>

        {/* Add Pet Button */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs font-semibold uppercase tracking-wider px-4 py-2 gap-1.5"
          >
            <Plus className="size-4" />
            Add New Pet
          </Button>

          <Button
            variant="outline"
            size="xs"
            onClick={resetToDefaultPets}
            title="Reset to 8 default Petaling Jaya rescue animals"
            className="text-xs text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
          </Button>
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
                  <tr
                    key={row.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      row.original.isArchived ? "bg-muted/15 opacity-80" : ""
                    }`}
                  >
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
                    <p className="text-sm font-medium">No animals match the selected filters.</p>
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
            <strong className="text-foreground">{filteredData.length}</strong> total records
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

      {/* Add / Edit Form Modal */}
      <PetFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editingPet={editingPet}
        onSave={handleFormSubmit}
      />

      {/* Soft Delete / Archive Confirmation Modal */}
      <Dialog open={!!archiveCandidate} onOpenChange={(o) => !o && setArchiveCandidate(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              {archiveCandidate?.archive ? "Archive Animal Record" : "Restore Animal Record"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {archiveCandidate?.archive ? (
                <>
                  Are you sure you want to archive <strong>{archiveCandidate?.pet.name}</strong> (
                  {archiveCandidate?.pet.breed})? Archiving will hide the profile from the public adoption
                  catalog while <strong>preserving all adoption application records and medical histories</strong>.
                </>
              ) : (
                <>
                  Are you sure you want to restore <strong>{archiveCandidate?.pet.name}</strong> to the active
                  inventory? It will become visible on the public adoption directory again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveCandidate(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant={archiveCandidate?.archive ? "destructive" : "default"}
              size="sm"
              onClick={handleConfirmArchive}
              className="text-xs font-semibold"
            >
              {archiveCandidate?.archive ? "Yes, Archive Record" : "Yes, Restore Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
