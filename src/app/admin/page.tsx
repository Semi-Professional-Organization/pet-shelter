import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getVerifiedSession } from "@/lib/security/dal";
import { adminHomeFor } from "@/lib/security/adminSections";
import { refuseMissingSession } from "@/lib/security/adminSectionGate";

// The destination depends on the member's live role, so it must never come from
// the full route cache.
export const dynamic = "force-dynamic";

/**
 * The console's front door, and the one place that decides where a member lands.
 *
 * Sign-in, registration and every "Back to Admin" link point here rather than at a
 * section, because no single section opens for every role: this page used to render
 * the pet inventory itself, and sign-in pushed everyone to `/admin/pets`, so a STAFF
 * or Content Editor account's first screen was a page it cannot open.
 *
 * The role is read through the DAL, not from the cookie. The cookie is sealed at
 * sign-in and outlives a role change or a suspension made since, while every
 * section's page gate reads the live row; choosing the landing from the cookie would
 * send a demoted member into a section that then refuses them.
 */
export default async function AdminIndexPage() {
  // The same answer as every section's gate when nobody is verified: the sign-in form
  // for no session, the 401 page for one the DAL will not honour.
  const session = (await getVerifiedSession()) ?? (await refuseMissingSession());

  const home = adminHomeFor(session.role);
  if (home) redirect(home);

  return (
    <div className="max-w-xl border border-border bg-background p-8 space-y-3">
      <ShieldAlert className="size-7 text-destructive" />
      <h1 className="font-heading text-xl font-bold text-foreground">
        Your account has no admin sections yet
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        You are signed in, but your role does not open any part of the staff portal. Ask a
        Super Admin to assign you a role under Staff &amp; Permissions.
      </p>
    </div>
  );
}
