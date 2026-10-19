import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Rendered with an HTTP 403 whenever `forbidden()` is thrown.
 *
 * Deliberately says nothing about what lives behind the boundary, so a
 * lower-privileged staff member learns only that they lack access.
 */
export default function Forbidden() {
  return (
    <div className="min-h-screen bg-card flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center bg-destructive/10 text-destructive border border-destructive/30">
        <ShieldAlert className="size-6" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <p className="text-xs font-bold uppercase tracking-widest text-destructive">
          403 — Forbidden
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          You do not have access to this area
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your staff account does not carry the permission required for this page.
          If you believe this is a mistake, ask a Super Admin to review your role
          under Staff &amp; Permissions.
        </p>
      </div>

      <div className="flex items-center gap-2.5 pt-1">
        {/* /admin, not a section: it sends each role to the first section it can
            open, where a fixed section would refuse most of the people sent here. */}
        <Link
          href="/admin"
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider border border-border bg-background px-3 py-2 hover:bg-muted"
        >
          Back to Admin
        </Link>
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground px-3 py-2"
        >
          Public Site
        </Link>
      </div>
    </div>
  );
}
