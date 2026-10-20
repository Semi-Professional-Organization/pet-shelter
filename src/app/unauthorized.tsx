import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Rendered with an HTTP 401 whenever `unauthorized()` is thrown, i.e. the
 * caller has no valid session at all (as opposed to an insufficient one).
 */
export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-card flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center bg-muted text-foreground border border-border">
        <Lock className="size-6" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          401 — Sign in required
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Your session has ended
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sign in again to continue to the shelter staff portal. If this page comes back
          straight after you sign in, ask a Super Admin to check your account under Staff
          &amp; Permissions.
        </p>
      </div>

      <Link
        href="/admin/login"
        className="inline-flex items-center text-xs font-semibold uppercase tracking-wider border border-border bg-background px-3 py-2 hover:bg-muted"
      >
        Go to Sign In
      </Link>
    </div>
  );
}
