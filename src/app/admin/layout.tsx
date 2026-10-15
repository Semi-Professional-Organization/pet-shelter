"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdminAuth } from "@/lib/client/adminAuth";
import { PERMISSIONS, roleHasPermission } from "@/lib/security/permissions";
import { getVolunteerFormLinks } from "@/actions/settings";
import { isUsableFormUrl } from "@/lib/volunteerFormUrl";
import {
  PawPrint,
  Dog,
  FileText,
  Settings,
  LogOut,
  ExternalLink,
  Bell,
  ShieldCheck,
  Wallet,
  HandCoins,
  ClipboardList,
  HelpCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isAuthenticated, isLoading, logout } = useAdminAuth();
  const [volunteerResponsesUrl, setVolunteerResponsesUrl] = useState("");

  // /admin/invite is reached from an emailed link by someone who has no
  // session yet, so it must not be forced through the sign-in redirect.
  const isPublicAdminRoute = pathname === "/admin/login" || pathname === "/admin/invite";

  // Volunteer intake lives in an external Google Form; whoever reviews
  // applications gets a direct shortcut to its responses sheet. Expressed as the
  // capability rather than as `ADMIN || COORDINATOR`: the literal pair predates
  // the permission matrix and silently excluded every role added since.
  // REVIEW_APPLICATIONS resolves to exactly the same people it used to.
  const canOpenVolunteerResponses = roleHasPermission(role, PERMISSIONS.REVIEW_APPLICATIONS);

  useEffect(() => {
    if (!isAuthenticated || !canOpenVolunteerResponses) return;
    let active = true;
    getVolunteerFormLinks()
      .then((links) => {
        if (active) setVolunteerResponsesUrl(links.volunteerFormResponsesUrl);
      })
      .catch(() => {
        // Non-fatal: the shortcut simply stays hidden.
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, canOpenVolunteerResponses]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicAdminRoute) {
      router.push("/admin/login");
    }
  }, [isLoading, isAuthenticated, isPublicAdminRoute, router]);

  if (isPublicAdminRoute) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-card flex flex-col items-center justify-center p-8 space-y-3">
        <div className="flex size-10 items-center justify-center bg-primary text-primary-foreground animate-pulse">
          <PawPrint className="size-5" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Verifying Staff Session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // A tab is shown when the role holds ANY of its permissions. This is
  // presentation, not enforcement: every route and action guards itself
  // server-side. The settings page hosts two capabilities at different levels —
  // a Super Admin edits the configuration, a Volunteer Coordinator only sends a
  // test email — so gating it on the write permission alone would hide a page
  // the coordinator still has legitimate work on.
  //
  // Every tab must name a permission. The `permissions: null` opt-out that used
  // to exist here had exactly one user — a "Community Bulletins" tab pointing at
  // the PUBLIC /bulletins page — and it is how that tab was shown to every role
  // including Volunteer, sending staff to a page whose "editing" wrote to their
  // own browser. Requiring the field removes the shape of that mistake rather
  // than just its instance.
  const navLinks = [
    { href: "/admin/pets", label: "Pet Management (CRUD)", icon: Dog, permissions: [PERMISSIONS.MANAGE_PETS] },
    { href: "/admin/applications", label: "Adoption Applications", icon: FileText, permissions: [PERMISSIONS.VIEW_APPLICATIONS] },
    { href: "/admin/faqs", label: "FAQ Knowledge Base", icon: HelpCircle, permissions: [PERMISSIONS.MANAGE_CONTENT] },
    { href: "/admin/transparency", label: "Financial Transparency", icon: Wallet, permissions: [PERMISSIONS.MANAGE_CONTENT] },
    { href: "/admin/donations", label: "Payment Reconciliation", icon: HandCoins, permissions: [PERMISSIONS.RECONCILE_SPONSORSHIPS] },
    { href: "/admin/members", label: "Staff & Permissions", icon: Users, permissions: [PERMISSIONS.MANAGE_MEMBERS] },
    { href: "/admin/audit", label: "Audit & Security Logs", icon: ShieldCheck, permissions: [PERMISSIONS.VIEW_AUDIT_LOG] },
    { href: "/admin/settings", label: "Shelter Settings", icon: Settings, permissions: [PERMISSIONS.MANAGE_SETTINGS, PERMISSIONS.SEND_SHELTER_EMAIL] },
    { href: "/admin/bulletins", label: "Community Bulletins", icon: Bell, permissions: [PERMISSIONS.MANAGE_CONTENT] },
  ].filter((tab) =>
    tab.permissions.some((permission) => roleHasPermission(role, permission))
  );

  return (
    <div className="min-h-screen bg-card flex flex-col">
      {/* Top Admin Header */}
      <header className="border-b border-border bg-background px-6 sm:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center bg-primary text-primary-foreground">
            <PawPrint className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">
                Hope for Strays
              </span>
              <span className="bg-muted px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-foreground/80 border border-border">
                Staff Admin
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Petaling Jaya Sanctuary • Logged in as <strong className="text-foreground">{user?.name}</strong>
            </p>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2.5">
          {canOpenVolunteerResponses && isUsableFormUrl(volunteerResponsesUrl) && (
            <a
              href={volunteerResponsesUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="volunteer-responses-shortcut"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 bg-background"
            >
              <ClipboardList className="size-3.5" />
              Open Volunteer Form Responses
            </a>
          )}

          <Link
            href="/"
            target="_blank"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 bg-background"
          >
            <ExternalLink className="size-3.5" />
            Live Public Site
          </Link>

          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              logout();
              router.push("/admin/login");
            }}
            className="text-xs gap-1 font-semibold text-destructive hover:text-destructive"
          >
            <LogOut className="size-3" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <div className="border-b border-border bg-muted/30 px-6 sm:px-8">
        <nav className="flex space-x-6 overflow-x-auto" aria-label="Admin Tabs">
          {navLinks.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href || (tab.href === "/admin/pets" && pathname === "/admin");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 py-3 text-xs sm:text-sm font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Admin Content Container */}
      <main className="flex-1 w-full p-6 sm:p-8 lg:p-10">
        {children}
      </main>
    </div>
  );
}
