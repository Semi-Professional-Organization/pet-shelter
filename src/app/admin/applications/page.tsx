import { ApplicationDataTable } from "@/components/admin/ApplicationDataTable";
import { getApplications } from "@/actions/applications";
import { requireAdminSection } from "@/lib/security/adminSectionGate";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";

export default async function AdminApplicationsPage() {
  // Refuses a role without VIEW_APPLICATIONS with the 403 page. The data load
  // below used to be the only check, and its refusal was swallowed, so such a role
  // got the browser's sample applications with every review control live.
  const session = await requireAdminSection("/admin/applications");

  // getApplications re-checks the same capability. Anything else it throws still
  // falls through to the client board's local data, as before the gate.
  let applications;
  try {
    applications = await getApplications();
  } catch {
    applications = undefined;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Adoption Applications Board
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Review incoming adoption questionnaires, perform reference checks, and approve adoption meet-and-greets.
        </p>
      </div>

      {/* Reading applications and deciding them are separate permissions: STAFF and
          Animal Managers may read but not decide, and only a Super Admin may delete.
          The board offers each member only the review controls the server will accept. */}
      <ApplicationDataTable
        initialApplications={applications}
        canReview={hasPermission(session, PERMISSIONS.REVIEW_APPLICATIONS)}
        canDelete={hasPermission(session, PERMISSIONS.DELETE_APPLICATIONS)}
      />
    </div>
  );
}
