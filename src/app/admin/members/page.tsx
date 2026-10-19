import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { listMembers } from "@/actions/members";
import { MemberDataTable } from "@/components/admin/MemberDataTable";

// The roster reflects live role and status changes, so it must never be
// served from the full route cache.
export const dynamic = "force-dynamic";

/**
 * Staff & Permissions console.
 *
 * The authorization check runs before anything is rendered, so an
 * under-privileged request gets a genuine HTTP 403 with the `forbidden.tsx`
 * body rather than a 200 carrying an error message. The surrounding admin
 * layout is a client component whose redirect is a convenience, not a security
 * boundary; this check is the boundary.
 *
 * This is also the only read path for the roster. Each member action
 * revalidates this route, so Next re-renders it here and hands the fresh rows
 * to the table as a prop — the client never fetches the list itself.
 */
export default async function AdminMembersPage() {
  const session = await requireAdminSection("/admin/members");

  // Reuses the guarded action rather than reaching for the store directly, so
  // there is one authorized read path. Its permission check resolves from the
  // request-scoped cache populated above, so it costs no extra query.
  const result = await listMembers();

  // Member administration talks to Postgres directly and has no in-memory
  // fallback: showing an empty roster as though it were the truth could get an
  // administrator to re-invite people who already exist.
  const loadError = result.success
    ? null
    : "Could not reach the staff database. The roster below may be incomplete — refresh before making changes.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Staff &amp; Permissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Invite shelter staff, assign the access level their work requires, and suspend
          accounts that should no longer reach the admin console.
        </p>
      </div>

      {loadError && (
        <div className="border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          {loadError}
        </div>
      )}

      <MemberDataTable members={result.data ?? []} currentUserId={session.id} />
    </div>
  );
}
