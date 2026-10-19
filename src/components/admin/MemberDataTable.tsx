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
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MailWarning,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InviteMemberDialog } from "@/components/admin/InviteMemberDialog";
import { useMemberTableController } from "@/hooks/useMemberTableController";
import type { MemberRecord } from "@/lib/domain/member";
import {
  CANONICAL_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_STATUSES,
  type CanonicalRole,
  type UserStatus,
} from "@/lib/security/permissions";

/** Role badge colours. Super Admin reads as elevated, the rest as neutral tiers. */
const ROLE_BADGE: Record<CanonicalRole, string> = {
  SUPER_ADMIN: "bg-highlight-surface text-highlight-text border-highlight-border",
  ANIMAL_MANAGER: "bg-info-surface text-info-text border-info-border",
  CONTENT_EDITOR: "bg-care-surface text-care-text border-care-border",
  VOLUNTEER_COORDINATOR: "bg-warning-surface text-warning-text border-warning-border",
  STAFF: "bg-muted text-muted-foreground border-border",
};

const STATUS_BADGE: Record<UserStatus, string> = {
  ACTIVE: "bg-success-surface text-success-text border-success-border",
  INVITED: "bg-warning-surface text-warning-text border-warning-border",
  SUSPENDED: "bg-danger-surface text-danger-text border-danger-border",
};

function formatLastLogin(iso: string | null): { label: string; muted: boolean } {
  if (!iso) return { label: "Never signed in", muted: true };

  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);

  if (minutes < 1) return { label: "Just now", muted: false };
  if (minutes < 60) return { label: `${minutes}m ago`, muted: false };
  if (minutes < 1440) return { label: `${Math.floor(minutes / 60)}h ago`, muted: false };
  if (minutes < 43200) return { label: `${Math.floor(minutes / 1440)}d ago`, muted: false };

  return {
    label: then.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }),
    muted: true,
  };
}

export function MemberDataTable({
  members,
  currentUserId,
}: {
  /**
   * The roster as the server last rendered it. Not copied into client state:
   * each mutation revalidates the route, so Next re-renders it server-side and
   * delivers the updated rows through this prop in the same response.
   */
  members: MemberRecord[];
  currentUserId: string;
}) {
  const { state, handlers } = useMemberTableController(members, currentUserId);
  const {
    filteredMembers,
    counts,
    globalFilter,
    statusFilter,
    sorting,
    isInviteOpen,
    inviteDraft,
    roleEditTarget,
    pendingRole,
    suspendTarget,
    busyMemberId,
    isSubmitting,
    error,
    notice,
  } = state;
  const {
    setGlobalFilter,
    setStatusFilter,
    setSorting,
    setIsInviteOpen,
    setInviteDraft,
    setRoleEditTarget,
    setPendingRole,
    setSuspendTarget,
    handleOpenInvite,
    handleOpenRoleEdit,
    handleInviteSubmit,
    handleRoleSubmit,
    handleStatusChange,
    handleResendInvite,
  } = handlers;

  const columns = useMemo<ColumnDef<MemberRecord>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name & Email",
        cell: ({ row }) => {
          const member = row.original;
          const isSelf = member.id === currentUserId;
          return (
            <div>
              <div className="flex items-center gap-1.5 font-heading text-base font-bold text-foreground">
                <span className={member.status === "SUSPENDED" ? "text-muted-foreground" : ""}>
                  {member.name}
                </span>
                {isSelf && (
                  <span className="text-2xs uppercase font-bold tracking-wider px-1.5 py-0.5 bg-muted text-muted-foreground border border-border">
                    You
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{member.email}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const role = row.original.role;
          return (
            <span
              title={ROLE_DESCRIPTIONS[role]}
              className={`inline-flex items-center border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}
            >
              {ROLE_LABELS[role]}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const member = row.original;
          const expired =
            member.status === "INVITED" &&
            member.inviteExpiresAt !== null &&
            new Date(member.inviteExpiresAt).getTime() < Date.now();

          return (
            <div className="space-y-1">
              <span
                className={`inline-flex items-center border px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ${STATUS_BADGE[member.status]}`}
              >
                {member.status}
              </span>
              {expired && (
                <p className="flex items-center gap-1 text-2xs font-semibold text-destructive">
                  <MailWarning className="size-3" />
                  Invitation expired
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "lastLoginAt",
        header: "Last Login",
        cell: ({ row }) => {
          const { label, muted } = formatLastLogin(row.original.lastLoginAt);
          return (
            <span className={`text-xs ${muted ? "text-muted-foreground" : "text-foreground font-medium"}`}>
              {label}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const member = row.original;
          const isSelf = member.id === currentUserId;
          const isBusy = busyMemberId === member.id;

          return (
            <div className="flex items-center gap-1.5">
              {isBusy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

              {/* A disabled button takes no pointer events, so its title would never
                  show; the reason it is disabled sits on this wrapper instead. */}
              <span className="inline-flex" title={isSelf ? "You cannot change your own role" : undefined}>
                <Button
                  variant="outline"
                  size="xs"
                  // Only a Super Admin reaches this table, and on their own row the server
                  // refuses every role but Super Admin, which they already hold. The dialog
                  // offered all five.
                  disabled={isBusy || isSelf}
                  onClick={() => handleOpenRoleEdit(member)}
                  className="text-xs gap-1 disabled:opacity-40"
                  title="Change this member's access level"
                >
                  <UserCog className="size-3" />
                  Edit Role
                </Button>
              </span>

              {member.status === USER_STATUSES.INVITED && (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isBusy}
                  onClick={() => handleResendInvite(member)}
                  className="text-xs gap-1"
                  title="Issue a new invitation link and email it again"
                >
                  <Send className="size-3" />
                  Resend
                </Button>
              )}

              {member.status === USER_STATUSES.SUSPENDED ? (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isBusy}
                  onClick={() => handleStatusChange(member, USER_STATUSES.ACTIVE)}
                  className="text-xs gap-1 text-success-text"
                >
                  <ShieldCheck className="size-3" />
                  Reactivate
                </Button>
              ) : (
                <span className="inline-flex" title={isSelf ? "You cannot suspend your own account" : undefined}>
                  <Button
                    variant="outline"
                    size="xs"
                    // Self-suspension would lock the operator out of the console
                    // they are standing in; the server refuses it too.
                    disabled={isBusy || isSelf}
                    onClick={() => setSuspendTarget(member)}
                    className="text-xs gap-1 text-destructive hover:text-destructive disabled:opacity-40"
                    title="Suspend this account"
                  >
                    <ShieldOff className="size-3" />
                    Suspend
                  </Button>
                </span>
              )}
            </div>
          );
        },
      },
    ],
    [currentUserId, busyMemberId, handleOpenRoleEdit, handleResendInvite, handleStatusChange, setSuspendTarget]
  );

  const table = useReactTable({
    data: filteredMembers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="border border-border bg-card p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter by name, email or role..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 text-xs sm:text-sm py-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="filter-member-status"
              className="text-xs font-semibold text-muted-foreground whitespace-nowrap"
            >
              Status:
            </label>
            <select
              id="filter-member-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="bg-background border border-input text-xs font-semibold px-3 py-2 text-foreground focus:ring-1 focus:ring-foreground"
            >
              <option value="all">All Members ({counts.all})</option>
              <option value={USER_STATUSES.ACTIVE}>Active ({counts.ACTIVE})</option>
              <option value={USER_STATUSES.INVITED}>Invited ({counts.INVITED})</option>
              <option value={USER_STATUSES.SUSPENDED}>Suspended ({counts.SUSPENDED})</option>
            </select>
          </div>
        </div>

        <Button size="sm" onClick={handleOpenInvite} className="gap-1.5 text-xs font-semibold">
          <UserPlus className="size-3.5" />
          Invite Staff Member
        </Button>
      </div>

      {notice && (
        <div className="border border-success-border bg-success-surface p-3.5 text-xs text-success-text flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Roster */}
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
                      row.original.status === "SUSPENDED" ? "bg-muted/15 opacity-80" : ""
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
                    <Users className="size-6 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No staff members match the selected filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground bg-background">
          <div>
            Showing <strong className="text-foreground">{table.getRowModel().rows.length}</strong> of{" "}
            <strong className="text-foreground">{filteredMembers.length}</strong> staff accounts
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

      <InviteMemberDialog
        open={isInviteOpen}
        draft={inviteDraft}
        isSubmitting={isSubmitting}
        onOpenChange={setIsInviteOpen}
        onChange={setInviteDraft}
        onSubmit={handleInviteSubmit}
      />

      {/* Edit Role */}
      <Dialog
        open={roleEditTarget !== null}
        onOpenChange={(open) => !open && setRoleEditTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Access Level</DialogTitle>
            <DialogDescription>
              {roleEditTarget
                ? `Set what ${roleEditTarget.name} can reach in the admin console.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {CANONICAL_ROLES.map((role) => (
              <label
                key={role}
                className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors ${
                  pendingRole === role
                    ? "border-foreground bg-muted/50"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="member-role"
                  value={role}
                  checked={pendingRole === role}
                  onChange={() => setPendingRole(role)}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-bold text-foreground">{ROLE_LABELS[role]}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ROLE_DESCRIPTIONS[role]}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRoleEditTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRoleSubmit}
              disabled={isSubmitting || pendingRole === roleEditTarget?.role}
              className="gap-1.5"
            >
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend confirmation */}
      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.name}?</DialogTitle>
            <DialogDescription>
              They will be signed out of the admin console on their next request and
              will not be able to sign in again until reactivated. Their records and
              audit history are kept.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busyMemberId === suspendTarget?.id}
              onClick={() =>
                suspendTarget && handleStatusChange(suspendTarget, USER_STATUSES.SUSPENDED)
              }
              className="gap-1.5"
            >
              {busyMemberId === suspendTarget?.id && <Loader2 className="size-3.5 animate-spin" />}
              Suspend Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
