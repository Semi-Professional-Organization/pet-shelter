"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, PawPrint, ShieldCheck } from "lucide-react";
import { acceptInvitation } from "@/actions/members";
import { enterAdminConsole } from "@/lib/client/adminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Staff invitation redemption.
 *
 * Reached from the emailed link by someone who has no session yet, so the
 * admin layout deliberately exempts this route from its sign-in redirect. The
 * token in the query string is the only credential; it is verified server-side
 * against a stored scrypt hash.
 */
function AcceptInvitationForm() {
  const searchParams = useSearchParams();

  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const linkIsComplete = token.length > 0 && email.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    setIsSubmitting(true);
    const result = await acceptInvitation({ email, token, password, confirmPassword });

    if (result.success) {
      setDone(true);
      // acceptInvitation signs the new member in, so land them in the console:
      // whichever section the invited role opens, by a fresh document load.
      enterAdminConsole();
      return;
    }

    setError(result.error || "This invitation could not be activated.");
    setIsSubmitting(false);
  };

  if (!linkIsComplete) {
    return (
      <div className="border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-2">
        <AlertCircle className="size-4 shrink-0 mt-0.5" />
        <span>
          This invitation link is incomplete. Open the link exactly as it appears in
          your email, or ask a Super Admin to resend the invitation.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {done && (
        <div className="border border-success-border bg-success-surface p-3.5 text-xs text-success-text flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Account activated. Taking you to the staff portal...</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wider">Staff Email</Label>
        <Input value={email} readOnly disabled className="text-sm py-2 font-mono bg-muted/40" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password" className="text-xs font-bold uppercase tracking-wider">
          Choose a Password (min 8)
        </Label>
        <Input
          id="invite-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="text-sm py-2 font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="invite-confirm-password"
          className="text-xs font-bold uppercase tracking-wider"
        >
          Confirm Password
        </Label>
        <Input
          id="invite-confirm-password"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className="text-sm py-2 font-mono"
        />
      </div>

      <Button type="submit" disabled={isSubmitting || done} className="w-full gap-1.5">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        Activate Staff Account
      </Button>

      <p className="text-2xs text-muted-foreground text-center leading-relaxed">
        Already activated?{" "}
        <Link href="/admin/login" className="underline hover:text-foreground">
          Sign in instead
        </Link>
        .
      </p>
    </form>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen bg-card flex flex-col justify-center py-10 px-6 sm:px-8 lg:px-10">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex size-10 items-center justify-center bg-primary text-primary-foreground">
            <PawPrint className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground leading-tight">
              Hope for Strays
            </h1>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Activate Your Staff Account
            </p>
          </div>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-border bg-background shadow-xs p-6 sm:p-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            }
          >
            <AcceptInvitationForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
